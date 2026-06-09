//! kept-dispatch — background send sidecar.
//! Invoked by OS scheduler every 5 min. Processes due send jobs, then exits.

use anyhow::{Context, Result};
use kept_core::{db, gmail, jobs::SendPayload, keychain};
use std::time::{SystemTime, UNIX_EPOCH};

/// OAuth client credentials — read from env or bundled config.
/// In production these come from the same bundled config as the Tauri app.
fn get_oauth_config() -> (String, String) {
    let client_id = std::env::var("KEPT_GOOGLE_CLIENT_ID")
        .unwrap_or_else(|_| "YOUR_CLIENT_ID".into());
    let client_secret = std::env::var("KEPT_GOOGLE_CLIENT_SECRET")
        .unwrap_or_else(|_| "YOUR_CLIENT_SECRET".into());
    (client_id, client_secret)
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let db_path = db::db_path()?;
    if !db_path.exists() {
        // App hasn't been run yet — nothing to do
        return Ok(());
    }

    let conn = db::open_db(&db_path)?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis() as i64;

    let due_jobs = db::get_due_send_jobs(&conn, now_ms)?;
    if due_jobs.is_empty() {
        return Ok(());
    }

    let (client_id, client_secret) = get_oauth_config();

    for job in &due_jobs {
        let result = process_job(&conn, job, &client_id, &client_secret).await;
        match result {
            Ok(_) => {
                db::mark_fired(&conn, &job.id)?;
                eprintln!("[kept-dispatch] sent job {}", job.id);
            }
            Err(e) => {
                let err_msg = format!("{:#}", e);
                db::mark_failed(&conn, &job.id, &err_msg)?;
                eprintln!("[kept-dispatch] failed job {}: {}", job.id, err_msg);
            }
        }
    }

    Ok(())
}

async fn process_job(
    conn: &rusqlite::Connection,
    job: &kept_core::jobs::ScheduledJob,
    client_id: &str,
    client_secret: &str,
) -> Result<()> {
    let payload: SendPayload = serde_json::from_str(&job.payload)
        .context("Failed to parse job payload")?;

    let email = db::get_account_email(conn, &job.account_id)?
        .context("Account not found")?;

    let tokens = keychain::get_tokens(&email)?;

    // Check if token is expired (with 60s buffer)
    let now_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs() as i64;
    let access_token = if tokens.token_expiry < now_s + 60 {
        keychain::refresh_access_token(client_id, client_secret, &tokens.refresh_token).await?
    } else {
        tokens.access_token
    };

    gmail::send_email(&access_token, &payload).await?;
    Ok(())
}
