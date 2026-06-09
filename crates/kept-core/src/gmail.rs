//! Gmail API send — constructs and sends RFC 2822 messages.

use anyhow::{Context, Result};
use crate::jobs::SendPayload;

/// Send an email via Gmail API using the provided access token.
pub async fn send_email(access_token: &str, payload: &SendPayload) -> Result<()> {
    let raw_message = build_raw_message(payload);
    let encoded = base64_url_encode(&raw_message);

    let mut body = serde_json::json!({ "raw": encoded });
    if let Some(ref tid) = payload.thread_id {
        body["threadId"] = serde_json::json!(tid);
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .context("Gmail send request failed")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Gmail API error {}: {}", status, body);
    }

    Ok(())
}

fn build_raw_message(payload: &SendPayload) -> String {
    let mut headers = format!(
        "To: {}\r\nSubject: {}\r\nContent-Type: text/html; charset=utf-8\r\n",
        payload.to, payload.subject
    );
    if let Some(ref cc) = payload.cc {
        headers.push_str(&format!("Cc: {}\r\n", cc));
    }
    if let Some(ref reply_to) = payload.in_reply_to {
        headers.push_str(&format!("In-Reply-To: {}\r\nReferences: {}\r\n", reply_to, reply_to));
    }
    format!("{}\r\n{}", headers, payload.body)
}

fn base64_url_encode(input: &str) -> String {
    use std::io::Write;
    let mut buf = Vec::new();
    {
        let mut encoder = Base64Encoder::new(&mut buf);
        encoder.write_all(input.as_bytes()).unwrap();
        encoder.finish().unwrap();
    }
    String::from_utf8(buf)
        .unwrap()
        .replace('+', "-")
        .replace('/', "_")
        .replace('=', "")
}

/// Minimal base64 encoder (no external dep needed).
struct Base64Encoder<W: std::io::Write> {
    writer: W,
    buf: [u8; 3],
    len: usize,
}

const B64_CHARS: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

impl<W: std::io::Write> Base64Encoder<W> {
    fn new(writer: W) -> Self {
        Self { writer, buf: [0; 3], len: 0 }
    }

    fn flush_buf(&mut self) -> std::io::Result<()> {
        if self.len == 0 { return Ok(()); }
        let mut out = [b'='; 4];
        out[0] = B64_CHARS[(self.buf[0] >> 2) as usize];
        out[1] = B64_CHARS[((self.buf[0] & 0x03) << 4 | self.buf[1] >> 4) as usize];
        if self.len > 1 {
            out[2] = B64_CHARS[((self.buf[1] & 0x0f) << 2 | self.buf[2] >> 6) as usize];
        }
        if self.len > 2 {
            out[3] = B64_CHARS[(self.buf[2] & 0x3f) as usize];
        }
        self.writer.write_all(&out)?;
        self.buf = [0; 3];
        self.len = 0;
        Ok(())
    }

    fn finish(mut self) -> std::io::Result<W> {
        self.flush_buf()?;
        Ok(self.writer)
    }
}

impl<W: std::io::Write> std::io::Write for Base64Encoder<W> {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        for &byte in data {
            self.buf[self.len] = byte;
            self.len += 1;
            if self.len == 3 {
                self.flush_buf()?;
            }
        }
        Ok(data.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_url_encode() {
        let encoded = base64_url_encode("Hello, World!");
        assert_eq!(encoded, "SGVsbG8sIFdvcmxkIQ");
    }

    #[test]
    fn test_build_raw_message() {
        let payload = SendPayload {
            to: "bob@example.com".into(),
            cc: None,
            bcc: None,
            subject: "Test".into(),
            body: "<p>Hi</p>".into(),
            thread_id: None,
            in_reply_to: None,
        };
        let msg = build_raw_message(&payload);
        assert!(msg.contains("To: bob@example.com"));
        assert!(msg.contains("Subject: Test"));
        assert!(msg.contains("<p>Hi</p>"));
    }
}
