# Attachments: View, Download & Quick Preview — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let users see, download, and preview attachments inline — the #1 missing table-stakes feature that makes the app unusable for many real email workflows.

**Architecture:** Gmail REST API already tells us about attachments during sync (has_attachment flag exists). We need to:
1. Store attachment metadata (filename, mimeType, size, attachmentId) in SQLite during sync
2. Display attachment chips in the thread reader
3. Fetch attachment data on demand via Gmail API `messages.attachments.get`
4. Save to disk via Tauri's file dialog, or preview inline (images/PDFs)

**Tech Stack:** Gmail REST API, tauri-plugin-dialog (save file), existing SQLite schema, vanilla TS DOM rendering.

---

## Task 1: Add attachments table to SQLite schema

**Objective:** Store attachment metadata per message so we can render chips without re-fetching.

**Files:**
- Modify: `src/db.ts` — add CREATE TABLE for attachments
- Modify: `src/gmail.ts` — extract attachment metadata during sync

**Step 1: Add schema migration in db.ts**

Add after existing table creations:

```typescript
await db.execute(`CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  attachment_id TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id)
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_attachments_thread ON attachments(thread_id)`);
```

**Step 2: Extract attachment metadata during sync in gmail.ts**

In the `syncInbox` function, after upserting threads, walk message parts and INSERT attachment rows:

```typescript
interface AttachmentMeta {
  id: string;           // `${messageId}_${partIndex}`
  messageId: string;
  threadId: string;
  accountId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string; // Gmail's attachment ID for fetching body
}
```

Walk parts recursively, collect those with `filename && body.attachmentId`, upsert.

**Step 3: Verify**

Run: `pnpm seed:e2e` still works, `tsc --noEmit` clean.

**Step 4: Commit**

```bash
git commit -m "feat(attachments): add SQLite schema for attachment metadata"
```

---

## Task 2: Populate attachment metadata during sync

**Objective:** During `syncInbox`, extract attachment info from Gmail message payloads and store in DB.

**Files:**
- Modify: `src/gmail.ts` — add `extractAttachments()` helper, call during sync

**Step 1: Add helper function**

```typescript
function extractAttachments(
  payload: MimePart,
  messageId: string,
  threadId: string,
  accountId: string
): AttachmentMeta[] {
  const results: AttachmentMeta[] = [];
  let partIdx = 0;

  function walk(part: MimePart) {
    if (part.filename && part.body?.attachmentId) {
      results.push({
        id: `${messageId}_${partIdx}`,
        messageId,
        threadId,
        accountId,
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
      partIdx++;
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(payload);
  return results;
}
```

**Step 2: Upsert after thread save**

```typescript
// In the sync loop, after upserting thread:
const attachments = extractAttachments(msg.payload, msg.id, threadDbId, account.id);
for (const att of attachments) {
  await db.execute(
    `INSERT OR REPLACE INTO attachments (id, message_id, thread_id, account_id, filename, mime_type, size, attachment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [att.id, att.messageId, att.threadId, att.accountId, att.filename, att.mimeType, att.size, att.attachmentId]
  );
}
```

**Step 3: Add exported loader**

```typescript
export async function loadAttachments(threadId: string): Promise<AttachmentMeta[]> {
  const db = await getDb();
  return db.select<AttachmentMeta[]>(
    'SELECT * FROM attachments WHERE thread_id = ? ORDER BY filename',
    [threadId]
  );
}
```

**Step 4: Verify**

`tsc --noEmit` clean.

**Step 5: Commit**

```bash
git commit -m "feat(attachments): extract and store attachment metadata during sync"
```

---

## Task 3: Render attachment chips in thread reader

**Objective:** Show attachment chips (filename + size + icon) below message body in thread reader view.

**Files:**
- Modify: `src/threadReader.ts` — after rendering message body, render attachment chips
- Modify: `src/style.css` — add `.attachment-chip` styles

**Step 1: Import and call loadAttachments**

In `threadReader.ts`, after the message HTML is rendered:

```typescript
import { loadAttachments } from './gmail';

// After message body renders:
const attachments = await loadAttachments(thread.id);
if (attachments.length) {
  const attachSection = document.createElement('div');
  attachSection.className = 'attachment-section';
  attachSection.innerHTML = attachments.map(a => `
    <button class="attachment-chip" data-attachment-id="${esc(a.attachmentId)}" data-message-id="${esc(a.messageId)}" data-filename="${esc(a.filename)}" data-mime="${esc(a.mimeType)}">
      <span class="attachment-chip-icon">${attachmentIcon(a.mimeType)}</span>
      <span class="attachment-chip-name">${esc(a.filename)}</span>
      <span class="attachment-chip-size">${formatSize(a.size)}</span>
    </button>
  `).join('');
  // Append after message body
  messageContainer.appendChild(attachSection);
}
```

**Step 2: Add helper functions**

```typescript
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(mime: string): string {
  if (mime.startsWith('image/')) return icon.image('14px');
  if (mime === 'application/pdf') return icon.pdf('14px');
  return icon.paperclip('14px');
}
```

**Step 3: Add CSS**

```css
.attachment-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.attachment-chip:hover {
  background: var(--bg-hover);
}
.attachment-chip-size {
  color: var(--text-muted);
  font-size: 11px;
}
```

**Step 4: Verify**

`tsc --noEmit` clean. Visual check in dev.

**Step 5: Commit**

```bash
git commit -m "feat(attachments): render attachment chips in thread reader"
```

---

## Task 4: Download attachment on click

**Objective:** Clicking an attachment chip fetches the binary data from Gmail API and saves to disk via system file dialog.

**Files:**
- Modify: `src/gmail.ts` — add `downloadAttachment()` function
- Modify: `src/threadReader.ts` — wire click handler on chips
- Modify: `src-tauri/Cargo.toml` — add `tauri-plugin-dialog`
- Modify: `src-tauri/src/lib.rs` — register dialog plugin
- Modify: `src-tauri/capabilities/default.json` — add dialog permissions

**Step 1: Add Gmail API fetch for attachment data**

```typescript
export async function downloadAttachment(
  account: Account,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const fresh = await ensureFreshToken(account);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${fresh.accessToken}` },
  });
  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
  const json = await res.json() as { data: string };
  // Gmail returns URL-safe base64
  return base64UrlToBytes(json.data);
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
```

**Step 2: Add Tauri dialog plugin**

```bash
cd src-tauri && cargo add tauri-plugin-dialog
pnpm add @tauri-apps/plugin-dialog
```

Register in `lib.rs`:
```rust
.plugin(tauri_plugin_dialog::init())
```

Add to capabilities:
```json
"dialog:allow-save"
```

**Step 3: Wire click handler**

```typescript
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

attachSection.addEventListener('click', async (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.attachment-chip');
  if (!chip || !state.account) return;
  
  const { attachmentId, messageId, filename } = chip.dataset;
  if (!attachmentId || !messageId || !filename) return;

  chip.classList.add('downloading');
  try {
    const bytes = await downloadAttachment(state.account, messageId, attachmentId);
    const path = await save({ defaultPath: filename });
    if (path) {
      await writeFile(path, bytes);
      showToast(`Saved: ${filename}`);
    }
  } catch (err) {
    showToast(`Download failed: ${(err as Error).message}`, 'error');
  } finally {
    chip.classList.remove('downloading');
  }
});
```

**Step 4: Verify**

`tsc --noEmit` clean. `cargo check` clean. Manual test with a real email that has an attachment.

**Step 5: Commit**

```bash
git commit -m "feat(attachments): download on click via Gmail API + system save dialog"
```

---

## Task 5: Inline preview for images

**Objective:** Image attachments (png/jpg/gif/webp) show a thumbnail preview without needing to save to disk.

**Files:**
- Modify: `src/threadReader.ts` — for image/* attachments, render an `<img>` with object URL

**Step 1: After rendering chips, auto-preview images**

```typescript
// After attachment chips are rendered:
const imageAttachments = attachments.filter(a => a.mimeType.startsWith('image/'));
if (imageAttachments.length) {
  const gallery = document.createElement('div');
  gallery.className = 'attachment-gallery';
  messageContainer.appendChild(gallery);

  for (const img of imageAttachments) {
    const thumb = document.createElement('div');
    thumb.className = 'attachment-thumb loading';
    thumb.innerHTML = '<div class="attachment-thumb-placeholder"></div>';
    gallery.appendChild(thumb);

    // Lazy fetch
    downloadAttachment(state.account!, img.messageId, img.attachmentId).then(bytes => {
      const blob = new Blob([bytes], { type: img.mimeType });
      const url = URL.createObjectURL(blob);
      thumb.innerHTML = `<img src="${url}" alt="${esc(img.filename)}" class="attachment-thumb-img" />`;
      thumb.classList.remove('loading');
    }).catch(() => {
      thumb.innerHTML = '<div class="attachment-thumb-error">⚠️</div>';
      thumb.classList.remove('loading');
    });
  }
}
```

**Step 2: Add CSS**

```css
.attachment-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.attachment-thumb {
  width: 120px;
  height: 90px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: pointer;
}
.attachment-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

**Step 3: Commit**

```bash
git commit -m "feat(attachments): inline image preview thumbnails"
```

---

## Task 6: Attachment compose (drag & drop + button)

**Objective:** Users can attach files when composing new emails or replying.

**Files:**
- Modify: `src/compose.ts` — add attach button + drag/drop zone
- Modify: `src/inlineReply.ts` — same for inline reply
- Modify: `src/gmail.ts` — update `sendEmail()` to include multipart/mixed with base64 attachments

**Step 1: Add file picker button to compose footer**

```typescript
// In compose panel footer, before send button:
<button class="compose-attach-btn" id="compose-attach" aria-label="Attach file">${icon.paperclip('16px')}</button>
```

**Step 2: Wire file dialog**

```typescript
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

interface PendingAttachment {
  name: string;
  mimeType: string;
  data: Uint8Array;
}

const pendingAttachments: PendingAttachment[] = [];

attachBtn.addEventListener('click', async () => {
  const paths = await openFileDialog({ multiple: true });
  if (!paths) return;
  for (const p of Array.isArray(paths) ? paths : [paths]) {
    const bytes = await readFile(p);
    const name = p.split('/').pop() ?? 'file';
    pendingAttachments.push({ name, mimeType: guessMime(name), data: bytes });
  }
  renderAttachmentList();
});
```

**Step 3: Update sendEmail to support attachments**

Modify `sendEmail()` in `gmail.ts` to build a multipart/mixed RFC 2822 message when attachments are present, using base64 encoding for each part.

**Step 4: Add drag & drop**

```typescript
bodyEl.addEventListener('dragover', e => { e.preventDefault(); bodyEl.classList.add('drag-over'); });
bodyEl.addEventListener('dragleave', () => bodyEl.classList.remove('drag-over'));
bodyEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  bodyEl.classList.remove('drag-over');
  // Read dropped files via Tauri fs
});
```

**Step 5: Verify**

Send a test email with attachment, confirm it arrives with the file intact.

**Step 6: Commit**

```bash
git commit -m "feat(attachments): compose with file attachments (picker + drag & drop)"
```

---

## Summary

| Task | Scope | Effort |
|------|-------|--------|
| 1. SQLite schema | DB migration | 10 min |
| 2. Sync extraction | Parse during sync | 20 min |
| 3. Render chips | UI in reader | 20 min |
| 4. Download click | Gmail API + save dialog | 30 min |
| 5. Image preview | Inline thumbnails | 20 min |
| 6. Compose attach | Send with files | 40 min |

**Total: ~2.5 hours**

**Acceptance criteria:**
- [ ] Emails with attachments show chips with filename + size in thread reader
- [ ] Clicking a chip downloads via Gmail API and opens system save dialog
- [ ] Image attachments show inline thumbnails
- [ ] Compose/reply supports attaching files (button + drag & drop)
- [ ] Sent emails with attachments arrive correctly at recipient
- [ ] All existing tests still pass
- [ ] `tsc --noEmit` and `cargo check` clean
