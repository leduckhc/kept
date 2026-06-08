# Follow-up Reminders

"Remind if no reply" — Kept watches for replies and nudges you when someone doesn't respond.

## How it works

1. **Set a reminder** — after sending an email, choose "Remind if no reply" from the send confirmation or thread actions
2. **Pick a timeframe** — "In 2 days", "In 1 week", or custom
3. **Wait** — Kept monitors the thread for incoming replies
4. **Get reminded** — if no reply arrives by your deadline, the thread resurfaces in your Reminders view with a notification

## Setting a reminder

### From the compose flow
After sending an email, the undo toast includes a "Remind if no reply" option. Click it to set a default 2-day reminder.

### From the thread reader
Open any thread → overflow menu (⋯) → "Remind if no reply" → pick a timeframe.

### Available presets
- In 2 days
- In 1 week
- In 2 weeks
- Custom date/time

## Viewing active reminders

Navigate to the **Reminders** view:
- Click the bell icon in the sidebar, or
- Keyboard: open sidebar views

The Reminders view shows:
- Thread subject
- Who you're waiting to hear from
- When the reminder triggers
- Time remaining

## Auto-cancellation

Reminders are **smart** — they auto-dismiss when:
- A reply arrives on the thread (detected by message count change)
- You manually dismiss the reminder
- You archive or trash the thread

This means you'll never get a stale "no reply" reminder for a thread that was already answered.

## Technical details

- Reminders are stored in localStorage (survive app restarts)
- One reminder per thread (setting a new one replaces the old)
- Check runs during each sync cycle (every 60 seconds)
- Reply detection: compares current thread message count against snapshot at reminder creation time
- Overdue reminders trigger an OS notification (if permission granted)
