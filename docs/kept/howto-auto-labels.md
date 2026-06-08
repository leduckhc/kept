# How to Create Auto-Label Rules

Set up automatic categorization so incoming email is labeled the instant it arrives.

## Quick start

### Example: Label all GitHub emails as "Dev"

1. Open **Settings** (gear icon)
2. Scroll to **Auto Labels**
3. Click **Add Rule**
4. Fill in:
   - Label: `Dev`
   - Match mode: `Any`
   - Condition 1: `from:@github.com`
5. Click **Save**

From now on, every email from a @github.com address gets the "Dev" label automatically on sync.

## Writing conditions

Conditions use a simple `field:value` syntax:

| Condition | Matches |
|-----------|---------|
| `from:@github.com` | Sender email contains "@github.com" |
| `from:john@` | Sender email starts with "john@" |
| `subject:invoice` | Subject line contains "invoice" (case-insensitive) |
| `subject:weekly report` | Subject contains "weekly report" |
| `to:team@company.com` | To field contains "team@company.com" |
| `has:attachment` | Thread has at least one attachment |

All matching is **contains** (substring) — you don't need wildcards.

## Match modes

### "All" (AND logic)
Every condition must be true for the label to apply.

**Example:** Label as "Work-Files" only if from your company AND has an attachment:
```
Label: Work-Files
Match: All
Conditions:
  - from:@mycompany.com
  - has:attachment
```

### "Any" (OR logic)
At least one condition must be true.

**Example:** Label as "Finance" if subject mentions invoice OR receipt OR payment:
```
Label: Finance
Match: Any
Conditions:
  - subject:invoice
  - subject:receipt
  - subject:payment confirmation
```

## Multiple rules

You can create as many rules as you want. Rules are independent — a single thread can receive multiple labels if it matches multiple rules.

**Example setup:**
| Rule | Label | Conditions |
|------|-------|------------|
| 1 | Dev | `from:@github.com` |
| 2 | Finance | `subject:invoice`, `subject:receipt` |
| 3 | Team | `from:@mycompany.com` |
| 4 | Newsletters | `to:news@`, `from:newsletter@` |

## Tips

- **Start broad, refine later** — begin with domain-level rules (`from:@domain.com`), add specific senders if needed
- **Check existing labels** — go to your Inbox after creating a rule and trigger a sync (Cmd+R) to see it in action
- **Rules are additive** — they only add labels, never remove them. If you want to unlabel something, do it manually.
- **Works offline** — rules run against locally cached data, no network needed
- **No AI** — this is pure pattern matching. Fast, predictable, and deterministic.

## Viewing labeled threads

Labeled threads show a colored pill/badge in the thread list. Click the label badge to filter to all threads with that label (enters Folder mode).
