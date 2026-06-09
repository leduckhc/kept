//! Scheduled job types.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledJob {
    pub id: String,
    pub account_id: String,
    pub job_type: String,
    pub payload: String,
    pub fire_at: i64,
    pub status: String,
    pub attempts: i64,
    pub created_at: i64,
}

/// Payload for a send job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendPayload {
    pub to: String,
    #[serde(default)]
    pub cc: Option<String>,
    #[serde(default)]
    pub bcc: Option<String>,
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub in_reply_to: Option<String>,
}
