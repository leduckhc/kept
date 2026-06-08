# Snooze & Scheduled Send

## Snooze

Snooze temporarily hides a thread from your inbox and brings it back at a time you choose.

### How to snooze

1. Open a thread or hover over it in the thread list
2. Click the snooze icon (clock) or use the overflow menu → "Snooze"
3. Pick a preset or choose a custom date/time:
   - **In 3 hours** — resurfaces 3 hours from now
   - **Tomorrow 9am** — next day at 9:00
   - **Saturday 9am** — coming Saturday
   - **Monday 9am** — coming Monday
   - **Custom** — pick any date and time

### Where snoozed threads live

- Snoozed threads appear in the **Snoozed** view (keyboard: `gn`)
- When the snooze time arrives, the thread reappears in your Inbox as if it just arrived
- You can unsnooze manually at any time from the Snoozed view

### Technical details

- Snooze state is stored locally in SQLite (`snoozed_until` timestamp on the thread)
- A timer checks for expired snoozes every 60 seconds during auto-sync
- Unsnoozing clears the `snoozed_until` field and moves the thread back to inbox

---

## Scheduled Send

Write an email now, send it at a future time.

### How to schedule a send

1. Compose your email normally (keyboard: `c`, or reply with `r`)
2. Instead of clicking **Send**, click the clock icon next to the Send button
3. Choose when to send:
   - **Tomorrow 8am** — sent first thing next morning
   - **Monday 8am** — held until next Monday
   - **Custom** — pick any future date/time
4. The email appears in your **Scheduled** view

### Cancelling a scheduled email

1. Go to the **Scheduled** view
2. Find the email
3. Click **Cancel** — the email moves back to Drafts for editing

### Important limitations

- **App must be open** for scheduled sends to dispatch. There is no background daemon yet (planned for a future release).
- Scheduled emails are stored in localStorage and checked against the current time every 60 seconds.
- If the app is closed when a scheduled time passes, the email will send on next app launch.

### Undo Send

Every sent email (including scheduled ones that fire) has a **5-second undo window**:

1. After hitting Send, a toast appears: "Message sent — Undo"
2. Click **Undo** within 5 seconds to cancel delivery
3. The email returns to your compose panel for editing

The 5-second delay means Kept holds the email locally before actually calling the Gmail API to send it.
