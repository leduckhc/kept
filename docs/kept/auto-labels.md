# Auto Labels

Automatically categorize incoming email with rule-based labeling — no AI required.

## What it does

Auto Labels applies labels to incoming threads based on rules you define. When new email arrives during sync, each thread is checked against your rules and labeled accordingly.

## Rule structure

Each rule has:
- **Label** — the label to apply (e.g., "Dev", "Finance", "Newsletters")
- **Conditions** — one or more match criteria
- **Match mode** — "all" (every condition must match) or "any" (at least one matches)

## Condition types

| Field | Syntax | Example |
|-------|--------|---------|
| From | `from:value` | `from:@github.com` |
| Subject | `subject:value` | `subject:invoice` |
| To | `to:value` | `to:notifications@` |
| Attachment | `has:attachment` | `has:attachment` |

Conditions use **contains** matching by default — `from:github` matches "notifications@github.com".

## Examples

### Label all GitHub notifications as "Dev"
```
Label: Dev
Match: any
Conditions:
  - from:@github.com
  - from:noreply@github.com
```

### Label invoices and receipts as "Finance"
```
Label: Finance
Match: any
Conditions:
  - subject:invoice
  - subject:receipt
  - subject:payment
```

### Label emails with attachments from a specific domain
```
Label: Work-Files
Match: all
Conditions:
  - from:@company.com
  - has:attachment
```

## Managing rules

### Create a rule
1. Open **Settings** (gear icon in sidebar)
2. Go to **Auto Labels** section
3. Click **Add Rule**
4. Enter the label name
5. Add one or more conditions using the syntax above
6. Choose match mode (all/any)
7. Save

### Edit a rule
Click the pencil icon next to any existing rule to modify its conditions.

### Delete a rule
Click the trash icon next to a rule to remove it.

## When rules run

- **On every sync** — both manual (Cmd+R) and auto-sync (every 60 seconds)
- **On initial sync** — all existing threads are evaluated when you first sign in
- Rules only **add** labels — they never remove labels from threads that no longer match

## Technical details

- Rules stored in SQLite (`auto_label_rules` table)
- Evaluation is pure logic — no network calls, no AI
- Thread fields available for matching: sender_email, sender_name, subject, to_addresses, has_attachment, user_labels
- Labels applied locally in the cache; does not modify Gmail labels (local-only categorization)
