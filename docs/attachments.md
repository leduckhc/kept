# Attachments

## Overview

View, download, and send email attachments. Attachment metadata is extracted during sync and stored in SQLite; binary data is fetched on-demand from Gmail API.

## Architecture

```
Gmail API → sync extracts metadata → attachments table (SQLite cache)
                                          ↓
                        ThreadReader loads per-thread → filters per-message
                                          ↓
                        User clicks chip → downloadAttachment() → save dialog
```

## DB Schema

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  gmail_attachment_id TEXT NOT NULL
);
```

## Reader UI (ThreadReader.tsx)

- `loadAttachments(threadId)` fetches all attachments for the thread
- Filtered per-message: `attachments.filter(a => a.message_id === msg.gmailMessageId)`
- Rendered as chips between message body and action buttons (Reply/Forward)
- MIME-type emoji icons: 📄 PDF, 📊 spreadsheet, 📝 doc, 🖼️ image, 🎬 video, 🎵 audio, 📦 archive, 📎 other
- Human-readable sizes (B/KB/MB)
- Click → `downloadAttachment()` → triggers browser save

## Compose UI (Compose.tsx)

- Paperclip button (footer-left) opens native file picker (multi-select)
- Drag & drop files onto compose panel (blue dashed outline on hover)
- Pending attachments render as removable chips with × button
- On send: files converted to `Uint8Array` and passed to `sendEmail()`
- Attachments cleared on successful send

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.attachment-section` | Container below message body |
| `.attachment-chip` | Individual chip (clickable) |
| `.compose-attachments` | Pending attachments container |
| `.compose-attachment-chip` | Pending chip with remove button |
| `.compose-drag-over` | Panel state during drag |

## Edge Cases

- Messages without attachments show no section (conditional render)
- Reply-to-self detection still works with attachments present
- E2E mode: attachment chips render from seed data; download shows toast
- Forward includes original subject but does NOT auto-attach (user picks new files)
