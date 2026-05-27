use serde::Serialize;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
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
    let redirect_uri = config_value("KEPT_GMAIL_REDIRECT_URI", option_env!("KEPT_GMAIL_REDIRECT_URI"))
        .unwrap_or_else(|| DEFAULT_REDIRECT_URI.to_string());
    let token_url = config_value("KEPT_GMAIL_TOKEN_URL", option_env!("KEPT_GMAIL_TOKEN_URL"))
        .unwrap_or_else(|| DEFAULT_TOKEN_URL.to_string());

    GmailOAuthConfig {
        enabled: client_id.is_some(),
        client_id,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kept desktop app");
}
