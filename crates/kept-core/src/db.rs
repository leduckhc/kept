//! Database access for kept-dispatch.
//! Reads the same SQLite DB as the Tauri app.

use anyhow::{Context, Result};
use rusqlite::Connection;
use std::path::PathBuf;

use crate::jobs::ScheduledJob;

/// Resolve the Kept database path.
/// macOS: ~/Library/Application Support/com.kept.app/kept.db
/// Linux: ~/.local/share/com.kept.app/kept.db
/// Windows: %APPDATA%/com.kept.app/kept.db
pub fn db_path() -> Result<PathBuf> {
    let base = if cfg!(target_os = "macos") {
        dirs_next().join("Library/Application Support")
    } else if cfg!(target_os = "linux") {
        dirs_next().join(".local/share")
    } else {
        // Windows
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| dirs_next())
    };
    let path = base.join("com.kept.app").join("kept.db");
    Ok(path)
}

fn dirs_next() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .expect("Could not determine home directory")
}

/// Open the Kept SQLite database (read-write).
pub fn open_db(path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(path)
        .with_context(|| format!("Failed to open DB at {:?}", path))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
    Ok(conn)
}

/// Get all due send jobs (status=pending, fire_at <= now).
pub fn get_due_send_jobs(conn: &Connection, now_ms: i64) -> Result<Vec<ScheduledJob>> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, job_type, payload, fire_at, status, attempts, created_at
         FROM scheduled_jobs
         WHERE status = 'pending' AND job_type = 'send' AND fire_at <= ?1"
    )?;

    let jobs = stmt.query_map([now_ms], |row| {
        Ok(ScheduledJob {
            id: row.get(0)?,
            account_id: row.get(1)?,
            job_type: row.get(2)?,
            payload: row.get(3)?,
            fire_at: row.get(4)?,
            status: row.get(5)?,
            attempts: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(jobs)
}

/// Mark a job as fired (completed).
pub fn mark_fired(conn: &Connection, job_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE scheduled_jobs SET status = 'fired' WHERE id = ?1",
        [job_id],
    )?;
    Ok(())
}

/// Mark a job as failed, incrementing attempts.
/// If attempts >= 5, sets status to 'failed' permanently.
pub fn mark_failed(conn: &Connection, job_id: &str, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE scheduled_jobs SET
            attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
            last_error = ?2
         WHERE id = ?1",
        rusqlite::params![job_id, error],
    )?;
    Ok(())
}

/// Get the account email for a given account_id.
pub fn get_account_email(conn: &Connection, account_id: &str) -> Result<Option<String>> {
    let email: Option<String> = conn
        .query_row(
            "SELECT email FROM accounts WHERE id = ?1",
            [account_id],
            |row| row.get(0),
        )
        .ok();
    Ok(email)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn setup_test_db() -> (Connection, NamedTempFile) {
        let tmp = NamedTempFile::new().unwrap();
        let conn = Connection::open(tmp.path()).unwrap();
        conn.execute_batch(
            "CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT);
             CREATE TABLE scheduled_jobs (
                id TEXT PRIMARY KEY,
                account_id TEXT REFERENCES accounts(id),
                job_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                fire_at INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_error TEXT
             );
             INSERT INTO accounts (id, email) VALUES ('acc1', 'test@gmail.com');
            "
        ).unwrap();
        (conn, tmp)
    }

    #[test]
    fn test_get_due_send_jobs_returns_pending_past_due() {
        let (conn, _tmp) = setup_test_db();
        conn.execute(
            "INSERT INTO scheduled_jobs (id, account_id, job_type, payload, fire_at, status, attempts, created_at)
             VALUES ('j1', 'acc1', 'send', '{\"to\":\"x@y.com\"}', 1000, 'pending', 0, 500)",
            [],
        ).unwrap();

        let jobs = get_due_send_jobs(&conn, 2000).unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, "j1");
    }

    #[test]
    fn test_future_jobs_not_returned() {
        let (conn, _tmp) = setup_test_db();
        conn.execute(
            "INSERT INTO scheduled_jobs (id, account_id, job_type, payload, fire_at, status, attempts, created_at)
             VALUES ('j2', 'acc1', 'send', '{}', 9999, 'pending', 0, 500)",
            [],
        ).unwrap();

        let jobs = get_due_send_jobs(&conn, 2000).unwrap();
        assert_eq!(jobs.len(), 0);
    }

    #[test]
    fn test_mark_fired() {
        let (conn, _tmp) = setup_test_db();
        conn.execute(
            "INSERT INTO scheduled_jobs (id, account_id, job_type, payload, fire_at, status, attempts, created_at)
             VALUES ('j3', 'acc1', 'send', '{}', 1000, 'pending', 0, 500)",
            [],
        ).unwrap();

        mark_fired(&conn, "j3").unwrap();
        let jobs = get_due_send_jobs(&conn, 2000).unwrap();
        assert_eq!(jobs.len(), 0);
    }

    #[test]
    fn test_mark_failed_increments_and_caps() {
        let (conn, _tmp) = setup_test_db();
        conn.execute(
            "INSERT INTO scheduled_jobs (id, account_id, job_type, payload, fire_at, status, attempts, created_at)
             VALUES ('j4', 'acc1', 'send', '{}', 1000, 'pending', 4, 500)",
            [],
        ).unwrap();

        mark_failed(&conn, "j4", "timeout").unwrap();
        // attempts was 4 → now 5, status should be 'failed'
        let jobs = get_due_send_jobs(&conn, 2000).unwrap();
        assert_eq!(jobs.len(), 0);
    }
}
