use base64::Engine as _;
use serde::Serialize;
use std::env;
use std::io::{Read, Write};
use std::net::{IpAddr, TcpListener, TcpStream};
use std::time::{Duration, Instant};
use url::Url;

const DEFAULT_GMAIL_CLIENT_ID: &str = "770442354658-ju4vt9tuurrq4a4r936b4ef08l36nati.apps.googleusercontent.com";
const DEFAULT_REDIRECT_URI: &str = "http://127.0.0.1:49210/oauth/google/callback";
const DEFAULT_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const KEYCHAIN_SERVICE: &str = "kept.gmail.oauth";
const MAX_CALLBACK_BYTES: usize = 8192;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GmailOAuthConfig {
    enabled: bool,
    client_id: Option<String>,
    client_secret: Option<String>,
    redirect_uri: String,
    token_url: String,
    callback_timeout_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeychainSetResult {
    stored: bool,
}

#[tauri::command]
fn gmail_oauth_config() -> GmailOAuthConfig {
    let client_id = config_value(
        "KEPT_GMAIL_CLIENT_ID",
        option_env!("KEPT_GMAIL_CLIENT_ID")
            .or(option_env!("GMAIL_CLIENT_ID"))
            .or(Some(DEFAULT_GMAIL_CLIENT_ID)),
    );
    let client_secret = config_value(
        "KEPT_GMAIL_CLIENT_SECRET",
        option_env!("KEPT_GMAIL_CLIENT_SECRET").or(option_env!("GMAIL_CLIENT_SECRET")),
    );
    let redirect_uri = config_value("KEPT_GMAIL_REDIRECT_URI", option_env!("KEPT_GMAIL_REDIRECT_URI"))
        .unwrap_or_else(|| DEFAULT_REDIRECT_URI.to_string());
    let token_url = config_value("KEPT_GMAIL_TOKEN_URL", option_env!("KEPT_GMAIL_TOKEN_URL"))
        .unwrap_or_else(|| DEFAULT_TOKEN_URL.to_string());

    GmailOAuthConfig {
        enabled: client_id.is_some(),
        client_id,
        client_secret,
        redirect_uri,
        token_url,
        callback_timeout_ms: 120_000,
    }
}

fn config_value(runtime_key: &str, build_value: Option<&'static str>) -> Option<String> {
    env::var(runtime_key)
        .ok()
        .or_else(|| build_value.map(str::to_string))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
fn gmail_start_oauth(auth_url: String, redirect_uri: String, timeout_ms: Option<u64>) -> Result<String, String> {
    let redirect = Url::parse(&redirect_uri).map_err(|_| "Gmail redirect URI is invalid".to_string())?;
    if redirect.scheme() != "http" {
        return Err("Gmail redirect URI must use loopback http".to_string());
    }
    let host = redirect.host_str().unwrap_or("127.0.0.1");
    if host != "127.0.0.1" && host != "localhost" {
        return Err("Gmail redirect URI must use localhost loopback".to_string());
    }
    let port = redirect.port().ok_or_else(|| "Gmail redirect URI must include a loopback port".to_string())?;
    let path = redirect.path().to_string();
    let listener = TcpListener::bind((host, port)).map_err(|_| "Could not start Gmail loopback listener".to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "Could not configure Gmail loopback listener".to_string())?;

    open::that_detached(auth_url).map_err(|_| "Could not open Gmail sign-in in the browser".to_string())?;

    let deadline = Instant::now() + Duration::from_millis(timeout_ms.unwrap_or(120_000));
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                let request_url = read_callback_url(&mut stream, host, port)?;
                if Url::parse(&request_url).map(|url| url.path() != path).unwrap_or(true) {
                    write_loopback_response(&mut stream, 404, "Kept Gmail callback path was not recognized.");
                    continue;
                }
                write_loopback_response(&mut stream, 200, "Kept received Gmail sign-in. You can return to Kept.");
                return Ok(request_url);
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => return Err("Gmail loopback listener failed".to_string()),
        }
    }
    Err("Gmail sign-in timed out before the browser returned to Kept".to_string())
}

#[tauri::command]
fn gmail_keychain_set(service: String, account: String, secret: String) -> Result<KeychainSetResult, String> {
    validate_keychain_request(&service, &account)?;
    let entry = keyring::Entry::new(&service, &account).map_err(|_| "Could not open Gmail token store".to_string())?;
    entry
        .set_password(&secret)
        .map_err(|_| "Could not save Gmail tokens to the OS keychain".to_string())?;
    Ok(KeychainSetResult { stored: true })
}

#[tauri::command]
fn gmail_keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    validate_keychain_request(&service, &account)?;
    let entry = keyring::Entry::new(&service, &account).map_err(|_| "Could not open Gmail token store".to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read Gmail tokens from the OS keychain".to_string()),
    }
}

#[tauri::command]
fn gmail_keychain_delete(service: String, account: String) -> Result<(), String> {
    validate_keychain_request(&service, &account)?;
    let entry = keyring::Entry::new(&service, &account).map_err(|_| "Could not open Gmail token store".to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not clear Gmail tokens from the OS keychain".to_string()),
    }
}

fn validate_keychain_request(service: &str, account: &str) -> Result<(), String> {
    if service != KEYCHAIN_SERVICE || account.trim().is_empty() || account.len() > 128 {
        return Err("Gmail token store request was not allowed".to_string());
    }
    Ok(())
}

// RFC 1918 + loopback + link-local private ranges
fn is_private_ip(addr: IpAddr) -> bool {
    match addr {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            // loopback 127.0.0.0/8
            o[0] == 127
            // 10.0.0.0/8
            || o[0] == 10
            // 172.16.0.0/12
            || (o[0] == 172 && o[1] >= 16 && o[1] <= 31)
            // 192.168.0.0/16
            || (o[0] == 192 && o[1] == 168)
            // link-local 169.254.0.0/16
            || (o[0] == 169 && o[1] == 254)
            // 0.0.0.0/8
            || o[0] == 0
        }
        IpAddr::V6(v6) => {
            // loopback ::1
            v6.is_loopback()
            // link-local fe80::/10
            || (v6.segments()[0] & 0xffc0) == 0xfe80
            // unique local fc00::/7
            || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB

#[tauri::command]
async fn fetch_image(url: String) -> Result<String, String> {
    let parsed = Url::parse(&url).map_err(|_| "Image URL is not valid".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Image URL must use http or https".to_string());
    }
    let host = parsed.host_str().ok_or_else(|| "Image URL must include a host".to_string())?;

    // Resolve host to IP and reject private ranges (blocking DNS on a thread pool thread)
    use std::net::ToSocketAddrs;
    let port = parsed.port_or_known_default().unwrap_or(443);
    let addrs: Vec<IpAddr> = format!("{}:{}", host, port)
        .to_socket_addrs()
        .map_err(|_| "Image host could not be resolved".to_string())?
        .map(|addr| addr.ip())
        .collect();
    if addrs.is_empty() {
        return Err("Image host could not be resolved".to_string());
    }
    for addr in &addrs {
        if is_private_ip(*addr) {
            return Err("Image URL resolves to a private or loopback address".to_string());
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Kept Mail)")
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Could not create image fetch client".to_string())?;

    let response = client
        .get(url.as_str())
        .header("Referrer-Policy", "no-referrer")
        .send()
        .await
        .map_err(|_| "Could not fetch image".to_string())?;

    if !response.status().is_success() {
        return Err(format!("Image fetch returned status {}", response.status().as_u16()));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim()
        .to_string();

    // Verify it looks like an image MIME type
    if !content_type.starts_with("image/") {
        return Err("URL did not return an image content type".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Could not read image bytes".to_string())?;

    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("Image is too large to proxy".to_string());
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, encoded))
}

fn read_callback_url(stream: &mut TcpStream, host: &str, port: u16) -> Result<String, String> {
    let mut buffer = [0_u8; MAX_CALLBACK_BYTES];
    let count = stream
        .read(&mut buffer)
        .map_err(|_| "Could not read Gmail callback".to_string())?;
    let request = String::from_utf8_lossy(&buffer[..count]);
    let request_line = request.lines().next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "GET" || target.is_empty() || !target.starts_with('/') {
        return Err("Gmail callback request was invalid".to_string());
    }
    Ok(format!("http://{}:{}{}", host, port, target))
}

/// Construct an RFC 2822 MIME message bytes for a Gmail reply.
fn build_mime_message(thread_id: &str, to: &str, subject: &str, body: &str) -> Vec<u8> {
    // Prefix subject with Re: only when not already there
    let reply_subject = if subject.to_lowercase().starts_with("re:") {
        subject.to_string()
    } else {
        format!("Re: {}", subject)
    };
    // Use thread_id as the Message-ID reference for threading
    let refs = format!("<{}>", thread_id);
    let message = format!(
        "To: {to}\r\n\
         Subject: {subject}\r\n\
         In-Reply-To: {refs}\r\n\
         References: {refs}\r\n\
         Content-Type: text/plain; charset=UTF-8\r\n\
         \r\n\
         {body}",
        to = to,
        subject = reply_subject,
        refs = refs,
        body = body,
    );
    message.into_bytes()
}

#[tauri::command]
async fn gmail_send_reply(
    thread_id: String,
    message_body: String,
    to: String,
    subject: String,
) -> Result<(), String> {
    // Load access token from keychain (same pattern as keychain_get)
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, "acct_local_gmail")
        .map_err(|_| "Could not open Gmail token store".to_string())?;
    let raw = match entry.get_password() {
        Ok(s) => s,
        Err(keyring::Error::NoEntry) => return Err("Gmail account is not connected".to_string()),
        Err(_) => return Err("Could not read Gmail tokens from the OS keychain".to_string()),
    };
    let tokens: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "Gmail tokens are invalid".to_string())?;
    let access_token = tokens
        .get("accessToken")
        .or_else(|| tokens.get("access_token"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Gmail access token is missing".to_string())?
        .to_string();

    // Build RFC 2822 MIME message and base64url-encode it
    let mime_bytes = build_mime_message(&thread_id, &to, &subject, &message_body);
    let raw_encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&mime_bytes);

    // POST to Gmail API
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not create Gmail send client".to_string())?;

    let response = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&access_token)
        .json(&serde_json::json!({
            "raw": raw_encoded,
            "threadId": thread_id,
        }))
        .send()
        .await
        .map_err(|_| "Could not reach Gmail API".to_string())?;

    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status().as_u16();
        Err(format!("Gmail send failed with status {}", status))
    }
}

fn write_loopback_response(stream: &mut TcpStream, status: u16, message: &str) {
    let reason = if status == 200 { "OK" } else { "Not Found" };
    let body = format!("<!doctype html><title>Kept Gmail</title><p>{}</p>", message);
    let response = format!(
        "HTTP/1.1 {} {}\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            gmail_oauth_config,
            gmail_start_oauth,
            gmail_keychain_set,
            gmail_keychain_get,
            gmail_keychain_delete,
            gmail_send_reply,
            fetch_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kept desktop app");
}

#[cfg(test)]
mod tests {
    use super::build_mime_message;

    #[test]
    fn mime_message_contains_required_headers() {
        let msg = String::from_utf8(build_mime_message("thread-abc", "recipient@example.com", "Hello", "Body text")).unwrap();
        assert!(msg.contains("To: recipient@example.com"), "missing To header");
        assert!(msg.contains("Subject: Re: Hello"), "missing Re: subject");
        assert!(msg.contains("In-Reply-To: <thread-abc>"), "missing In-Reply-To header");
        assert!(msg.contains("References: <thread-abc>"), "missing References header");
        assert!(msg.contains("Content-Type: text/plain; charset=UTF-8"), "missing Content-Type header");
        assert!(msg.contains("\r\n\r\nBody text"), "missing blank line before body");
    }

    #[test]
    fn mime_message_does_not_double_re_prefix() {
        let msg = String::from_utf8(build_mime_message("t1", "a@b.com", "Re: Already there", "hi")).unwrap();
        assert!(msg.contains("Subject: Re: Already there"));
        assert!(!msg.contains("Subject: Re: Re:"), "should not double-prefix Re:");
    }

    #[test]
    fn mime_message_case_insensitive_re_check() {
        let msg = String::from_utf8(build_mime_message("t1", "a@b.com", "RE: Uppercase", "hi")).unwrap();
        assert!(msg.contains("Subject: RE: Uppercase"));
        assert!(!msg.contains("Re: RE:"), "should not add Re: in front of RE:");
    }
}
