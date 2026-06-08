# Compose & Drafts

Writing, replying, forwarding, and managing drafts in Kept.

## Opening the composer

| Action | How |
|--------|-----|
| New email | Click ✏️ compose button in toolbar, or press `c` |
| Reply | Open thread → click Reply, or press `r` |
| Reply All | Open thread → click Reply All |
| Forward | Open thread → click Forward, or press `f` |

## Compose panel

The composer opens as a **floating panel** in the bottom-right corner of the screen. It can be expanded to fullscreen for longer emails.

### Layout
```
[To: _______________] [CC] [BCC]
[Subject: __________]
[                          ]
[  Message body            ]
[                          ]
[formatting] ........[Send]
```

- **To/CC/BCC**: Email address fields. CC and BCC toggle on via buttons.
- **Subject**: Auto-filled for replies (Re:) and forwards (Fwd:)
- **Body**: Plain text with rich-text formatting toolbar
- **Bottom bar**: Formatting controls on left, Send button (pill-shaped) on right. Always visible, 44px height.

### Expanding
Click the expand icon to go fullscreen. Click again to return to floating panel.

## Drafts

### Auto-save
Kept automatically saves drafts to Gmail as you type. There is no manual "save draft" action — it's always saved.

### Closing the composer
When you close the compose panel (click X or press Escape with focus outside text fields):
- The panel animates with a **shrink-and-fly** effect toward the Drafts icon in the sidebar
- The Drafts icon glows briefly and its badge count pulses
- Your draft is preserved — open Drafts view to resume

### Draft management
- **Resume editing**: Open Drafts view (`gd`) → click a draft to reopen the composer
- **Delete a draft**: In Drafts view, trash the draft thread
- **Drafts sync with Gmail**: Drafts created in Kept appear in Gmail, and vice versa

## Sending

### Normal send
Click the **Send** button or use the keyboard shortcut (Cmd+Enter / Ctrl+Enter when focused in compose).

### Undo send
After sending, a toast notification appears for **5 seconds**:
- "Message sent — **Undo**"
- Click Undo to cancel delivery and return to editing
- The 5-second delay is the window — after that, the email is dispatched to Gmail's API

### Scheduled send
Instead of sending immediately:
1. Click the clock icon next to Send
2. Pick a time (presets or custom)
3. Email moves to the Scheduled view
4. Dispatched automatically when the time arrives (app must be open)

## Attachments

### Viewing attachments
Received attachments appear below the message body with:
- Filename
- File size
- Download button

### Sending attachments
In the compose panel:
- Click the paperclip icon to attach files
- Drag and drop files onto the compose panel
- Attached files show as pills below the body with remove (×) buttons

## Reply context

When replying:
- The original message is quoted below your reply
- The To field is pre-filled with the sender's address
- Subject gets "Re: " prefix (if not already present)
- Thread ID is preserved so the reply appears in the same Gmail conversation
