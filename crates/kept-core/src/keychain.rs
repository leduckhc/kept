//! OS keychain access for OAuth tokens.
//! Uses the same service name as the Tauri app: "com.kept.app"

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.kept.app";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTokens {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "tokenExpiry")]
    pub token_expiry: i64,
}

/// Retrieve OAuth tokens from the OS keychain for the given email.
pub fn get_tokens(email: &str) -> Result<StoredTokens> {
    let entry = keyring::Entry::new(SERVICE, email)
        .context("Failed to create keyring entry")?;
    let raw = entry
        .get_password()
        .with_context(|| format!("No keychain entry for {}", email))?;
    let tokens: StoredTokens = serde_json::from_str(&raw)
        .with_context(|| format!("Failed to parse keychain JSON for {}", email))?;
    Ok(tokens)
}

/// Refresh an expired access token using the refresh token.
/// Returns the new access token.
pub async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .context("Token refresh request failed")?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token refresh failed: {}", body);
    }

    #[derive(Deserialize)]
    struct TokenResp {
        access_token: String,
    }

    let token_resp: TokenResp = resp.json().await.context("Failed to parse token response")?;
    Ok(token_resp.access_token)
}
