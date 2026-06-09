-- E2E seed data for Kept
-- Usage: sqlite3 kept.db < e2e/seed.sql
-- Or run via: node e2e/seed.ts

-- Account
INSERT OR REPLACE INTO accounts (id, email, access_token, refresh_token, token_expiry, signature)
VALUES ('test-user-1', 'testuser@gmail.com', 'fake-access-token', 'fake-refresh-token', 9999999999999, 'Best regards,\nTest User');

-- Threads (20 realistic emails, spread over 2 weeks)
INSERT OR REPLACE INTO threads (id, account_id, subject, snippet, sender_name, sender_email, received_at, is_unread, is_archived, has_attachment, gmail_thread_id, is_starred, message_count, label, category, is_muted)
VALUES
  ('t01', 'test-user-1', 'Your Amazon order has shipped', 'Your package with 3 items will arrive by Tuesday...', 'Amazon', 'shipment-tracking@amazon.com', 1748700000000, 1, 0, 0, 'gmail-t01', 0, 1, 'INBOX', 'updates', 0),
  ('t02', 'test-user-1', 'Re: Dinner plans this weekend?', 'Saturday works for me! How about 7pm at that new Italian place...', 'Sarah Chen', 'sarah.chen@gmail.com', 1748690000000, 1, 0, 0, 'gmail-t02', 0, 4, 'INBOX', 'personal', 0),
  ('t03', 'test-user-1', '[GitHub] Pull request review requested: feat/auth-redesign', 'milanle requested your review on #142...', 'GitHub', 'notifications@github.com', 1748680000000, 1, 0, 0, 'gmail-t03', 0, 1, 'INBOX', 'updates', 0),
  ('t04', 'test-user-1', 'Your weekly digest from Hacker News', 'Top stories: Show HN: I built a local-first email client...', 'Hacker News', 'digest@hndigest.com', 1748670000000, 0, 0, 0, 'gmail-t04', 0, 1, 'INBOX', 'newsletters', 0),
  ('t05', 'test-user-1', 'Invoice #2847 for January', 'Please find attached your invoice for services rendered...', 'Acme Corp', 'billing@acmecorp.com', 1748660000000, 0, 0, 1, 'gmail-t05', 1, 1, 'INBOX', 'updates', 0),
  ('t06', 'test-user-1', 'Re: Project kickoff meeting notes', 'Thanks for sending these. I have a few comments on the timeline...', 'David Park', 'david.park@company.com', 1748650000000, 0, 0, 1, 'gmail-t06', 0, 3, 'INBOX', 'personal', 0),
  ('t07', 'test-user-1', 'Your flight confirmation - PRG → BCN', 'Booking ref: XK7F2P. Departure: Feb 15, 06:45...', 'Ryanair', 'confirmation@ryanair.com', 1748640000000, 0, 0, 1, 'gmail-t07', 1, 1, 'INBOX', 'updates', 0),
  ('t08', 'test-user-1', '🎉 You have a new follower on X', 'John Carmack followed you back...', 'X', 'notify@x.com', 1748630000000, 0, 0, 0, 'gmail-t08', 0, 1, 'INBOX', 'updates', 0),
  ('t09', 'test-user-1', 'Reminder: Dentist appointment tomorrow', 'Your appointment is confirmed for 10:30 AM with Dr. Novak...', 'Prague Dental Clinic', 'appointments@praguedental.cz', 1748620000000, 1, 0, 0, 'gmail-t09', 0, 1, 'INBOX', 'updates', 0),
  ('t10', 'test-user-1', 'The Pragmatic Engineer Newsletter #287', 'This week: Why senior engineers are mass-quitting FAANG...', 'Gergely Orosz', 'gergely@pragmaticengineer.com', 1748610000000, 0, 0, 0, 'gmail-t10', 0, 1, 'INBOX', 'newsletters', 0),
  ('t11', 'test-user-1', 'Re: Can you review my resume?', 'Sure thing! I made some suggestions in the attached doc...', 'Mike Torres', 'mike.torres@protonmail.com', 1748500000000, 0, 0, 1, 'gmail-t11', 0, 2, 'INBOX', 'personal', 0),
  ('t12', 'test-user-1', 'Security alert: New sign-in from Chrome on Mac', 'We noticed a new sign-in to your Google Account...', 'Google', 'no-reply@accounts.google.com', 1748400000000, 0, 0, 0, 'gmail-t12', 0, 1, 'INBOX', 'updates', 0),
  ('t13', 'test-user-1', 'Your Spotify Wrapped 2025 is here!', 'You listened to 47,832 minutes of music this year...', 'Spotify', 'no-reply@spotify.com', 1748300000000, 0, 0, 0, 'gmail-t13', 0, 1, 'INBOX', 'newsletters', 0),
  ('t14', 'test-user-1', 'Shared document: Q1 Planning Spreadsheet', 'testuser@gmail.com shared a document with you...', 'Google Drive', 'drive-shares-dm-noreply@google.com', 1748200000000, 0, 0, 0, 'gmail-t14', 0, 1, 'INBOX', 'updates', 0),
  ('t15', 'test-user-1', 'Re: Coffee next week?', 'Tuesday or Wednesday afternoon both work for me!', 'Anna Kowalski', 'anna.k@outlook.com', 1748100000000, 1, 0, 0, 'gmail-t15', 0, 3, 'INBOX', 'personal', 0),
  ('t16', 'test-user-1', 'Your credit card statement is ready', 'Your December statement is available. Total: €1,247.83...', 'Revolut', 'statements@revolut.com', 1748000000000, 0, 0, 1, 'gmail-t16', 0, 1, 'INBOX', 'updates', 0),
  ('t17', 'test-user-1', 'Thanks for your order!', 'Order #ORD-98712 confirmed. Estimated delivery: 3-5 business days...', 'Alza.cz', 'orders@alza.cz', 1747900000000, 0, 0, 0, 'gmail-t17', 0, 1, 'INBOX', 'updates', 0),
  ('t18', 'test-user-1', 'Invitation: Team standup @ Mon Jan 13, 9:00 AM', 'David Park has invited you to a recurring event...', 'Google Calendar', 'calendar-notification@google.com', 1747800000000, 0, 0, 0, 'gmail-t18', 0, 1, 'INBOX', 'updates', 0),
  ('t19', 'test-user-1', 'Hey, saw this and thought of you', 'Check out this talk by Rich Hickey on simplicity...', 'Tom Wright', 'tom.wright@hey.com', 1747700000000, 0, 0, 0, 'gmail-t19', 1, 1, 'INBOX', 'personal', 0),
  ('t20', 'test-user-1', 'Action required: Verify your email', 'Please verify your email address to complete registration...', 'Linear', 'notifications@linear.app', 1747600000000, 0, 0, 0, 'gmail-t20', 0, 1, 'INBOX', 'updates', 0),
  ('t21', 'test-user-1', 'Your new gadget is on its way!', 'Shipped today, tracking number inside...', '"Alza.cz"', 'info@letter.alza.cz', 1747500000000, 0, 0, 0, 'gmail-t21', 0, 1, 'INBOX', 'updates', 0),
  ('t22', 'test-user-1', 'Weekly news digest', 'Top stories from this week...', '"Newsletter Team"', 'digest@news.bbc.com', 1747400000000, 0, 0, 0, 'gmail-t22', 0, 1, 'INBOX', 'newsletters', 0);

-- Sent threads
INSERT OR REPLACE INTO threads (id, account_id, subject, snippet, sender_name, sender_email, received_at, is_unread, is_archived, has_attachment, gmail_thread_id, is_starred, message_count, label, category, is_muted)
VALUES
  ('t21', 'test-user-1', 'Re: Dinner plans this weekend?', 'Sounds perfect! I will book a table for 4.', 'Test User', 'testuser@gmail.com', 1748695000000, 0, 0, 0, 'gmail-t02', 0, 1, 'SENT', 'personal', 0),
  ('t22', 'test-user-1', 'Quick question about the API', 'Hey David, do we need to support pagination on the /threads endpoint?', 'Test User', 'testuser@gmail.com', 1748655000000, 0, 0, 0, 'gmail-t22', 0, 1, 'SENT', 'personal', 0);

-- Messages (multi-message threads get multiple entries)
INSERT OR REPLACE INTO messages (id, thread_id, account_id, from_name, from_email, to_addresses, subject, body_text, body_html, received_at, gmail_message_id)
VALUES
  -- Thread t01: Amazon shipping
  ('m01', 't01', 'test-user-1', 'Amazon', 'shipment-tracking@amazon.com', 'testuser@gmail.com', 'Your Amazon order has shipped', 'Your package with 3 items will arrive by Tuesday.', '<div style="font-family: Arial, sans-serif;"><h2>Your package is on the way!</h2><p>Your order containing <strong>3 items</strong> has shipped and will arrive by <strong>Tuesday, Jan 14</strong>.</p><p>Track your package: <a href="#">Click here</a></p><hr><p style="color:#666;font-size:12px">Amazon.com</p></div>', 1748700000000, 'gmail-m01'),

  -- Thread t02: Dinner plans (4 messages)
  ('m02a', 't02', 'test-user-1', 'Test User', 'testuser@gmail.com', 'sarah.chen@gmail.com', 'Dinner plans this weekend?', 'Hey Sarah! Are you free this weekend for dinner?', '<p>Hey Sarah!</p><p>Are you free this weekend for dinner? Been wanting to try that new place on Vinohradska.</p><p>Let me know!</p>', 1748670000000, 'gmail-m02a'),
  ('m02b', 't02', 'test-user-1', 'Sarah Chen', 'sarah.chen@gmail.com', 'testuser@gmail.com', 'Re: Dinner plans this weekend?', 'Yes! Saturday works best for me.', '<p>Yes! Saturday works best for me. What time were you thinking?</p>', 1748680000000, 'gmail-m02b'),
  ('m02c', 't02', 'test-user-1', 'Test User', 'testuser@gmail.com', 'sarah.chen@gmail.com', 'Re: Dinner plans this weekend?', 'How about 7pm?', '<p>How about 7pm? I can book a table for us.</p>', 1748685000000, 'gmail-m02c'),
  ('m02d', 't02', 'test-user-1', 'Sarah Chen', 'sarah.chen@gmail.com', 'testuser@gmail.com', 'Re: Dinner plans this weekend?', 'Saturday works for me! How about 7pm at that new Italian place on Vinohradska?', '<p>Saturday works for me! How about 7pm at that new Italian place on Vinohradska? I heard their pasta is amazing 🍝</p>', 1748690000000, 'gmail-m02d'),

  -- Thread t03: GitHub PR
  ('m03', 't03', 'test-user-1', 'GitHub', 'notifications@github.com', 'testuser@gmail.com', '[GitHub] Pull request review requested: feat/auth-redesign', 'milanle requested your review on #142', '<div><p><strong>milanle</strong> requested your review on <a href="#">#142 feat/auth-redesign</a></p><p>Changes: Replaced session-based auth with JWT tokens. Added refresh token rotation.</p><p style="color:#666">+342 −89 across 8 files</p></div>', 1748680000000, 'gmail-m03'),

  -- Thread t06: Project kickoff (3 messages)
  ('m06a', 't06', 'test-user-1', 'Test User', 'testuser@gmail.com', 'david.park@company.com', 'Project kickoff meeting notes', 'Here are the notes from today meeting.', '<p>Hey David,</p><p>Here are the notes from today''s kickoff meeting:</p><ul><li>Sprint 1: Auth + DB schema (2 weeks)</li><li>Sprint 2: Core inbox UI (2 weeks)</li><li>Sprint 3: Compose + send (1 week)</li></ul><p>Let me know if I missed anything.</p>', 1748630000000, 'gmail-m06a'),
  ('m06b', 't06', 'test-user-1', 'David Park', 'david.park@company.com', 'testuser@gmail.com', 'Re: Project kickoff meeting notes', 'Looks good! One thing — I think Sprint 2 might need 3 weeks.', '<p>Looks good! One thing — I think Sprint 2 might need 3 weeks given the thread reader complexity.</p><p>Also, should we add a buffer sprint?</p>', 1748640000000, 'gmail-m06b'),
  ('m06c', 't06', 'test-user-1', 'David Park', 'david.park@company.com', 'testuser@gmail.com', 'Re: Project kickoff meeting notes', 'Thanks for sending these. I have a few comments on the timeline — see attached.', '<p>Thanks for sending these. I have a few comments on the timeline — see attached revised schedule.</p><p>Main change: moved compose to Sprint 3 to give inbox more breathing room.</p>', 1748650000000, 'gmail-m06c'),

  -- Thread t15: Coffee (3 messages)
  ('m15a', 't15', 'test-user-1', 'Anna Kowalski', 'anna.k@outlook.com', 'testuser@gmail.com', 'Coffee next week?', 'Hey! It has been a while — want to grab coffee next week?', '<p>Hey! It''s been a while — want to grab coffee next week? I''m pretty flexible on timing.</p>', 1748080000000, 'gmail-m15a'),
  ('m15b', 't15', 'test-user-1', 'Test User', 'testuser@gmail.com', 'anna.k@outlook.com', 'Re: Coffee next week?', 'Would love to! When works for you?', '<p>Would love to! When works for you? I''m free most afternoons.</p>', 1748090000000, 'gmail-m15b'),
  ('m15c', 't15', 'test-user-1', 'Anna Kowalski', 'anna.k@outlook.com', 'testuser@gmail.com', 'Re: Coffee next week?', 'Tuesday or Wednesday afternoon both work for me!', '<p>Tuesday or Wednesday afternoon both work for me! There''s a nice café on Náměstí Míru if you''re up for it ☕</p>', 1748100000000, 'gmail-m15c'),

  -- Single-message threads
  ('m04', 't04', 'test-user-1', 'Hacker News', 'digest@hndigest.com', 'testuser@gmail.com', 'Your weekly digest from Hacker News', 'Top stories this week', '<div><h3>Your Weekly Digest</h3><ol><li><strong>Show HN: I built a local-first email client</strong> (342 points)</li><li><strong>Why SQLite is the future of app data</strong> (289 points)</li><li><strong>Tauri 2.0 released with mobile support</strong> (256 points)</li></ol></div>', 1748670000000, 'gmail-m04'),
  ('m05', 't05', 'test-user-1', 'Acme Corp', 'billing@acmecorp.com', 'testuser@gmail.com', 'Invoice #2847 for January', 'Please find attached your invoice.', '<p>Dear Customer,</p><p>Please find attached your invoice #2847 for services rendered in January 2025.</p><p><strong>Amount due: €2,400.00</strong><br>Due date: February 15, 2025</p><p>Thank you for your business.</p>', 1748660000000, 'gmail-m05'),
  ('m07', 't07', 'test-user-1', 'Ryanair', 'confirmation@ryanair.com', 'testuser@gmail.com', 'Your flight confirmation - PRG → BCN', 'Booking confirmed', '<div style="background:#003087;color:white;padding:20px"><h2>Booking Confirmed ✈️</h2></div><div style="padding:20px"><p><strong>Booking Ref:</strong> XK7F2P</p><p><strong>Route:</strong> Prague (PRG) → Barcelona (BCN)</p><p><strong>Date:</strong> Feb 15, 2025</p><p><strong>Departure:</strong> 06:45 | <strong>Arrival:</strong> 09:30</p><p><strong>Passenger:</strong> Test User</p></div>', 1748640000000, 'gmail-m07'),
  ('m09', 't09', 'test-user-1', 'Prague Dental Clinic', 'appointments@praguedental.cz', 'testuser@gmail.com', 'Reminder: Dentist appointment tomorrow', 'Your appointment is confirmed.', '<p>Dear Test User,</p><p>This is a reminder that your appointment is confirmed for <strong>tomorrow at 10:30 AM</strong> with Dr. Novak.</p><p>Address: Václavské náměstí 12, Prague 1</p><p>Please arrive 10 minutes early.</p>', 1748620000000, 'gmail-m09'),
  ('m10', 't10', 'test-user-1', 'Gergely Orosz', 'gergely@pragmaticengineer.com', 'testuser@gmail.com', 'The Pragmatic Engineer Newsletter #287', 'This week in tech', '<div><h2>The Pragmatic Engineer #287</h2><h3>Why senior engineers are mass-quitting FAANG</h3><p>A deep dive into the exodus of L6+ engineers from big tech, what''s driving it, and where they''re going...</p><p><a href="#">Read the full article →</a></p></div>', 1748610000000, 'gmail-m10'),
  ('m19', 't19', 'test-user-1', 'Tom Wright', 'tom.wright@hey.com', 'testuser@gmail.com', 'Hey, saw this and thought of you', 'Check out this talk', '<p>Hey!</p><p>Saw this talk by Rich Hickey and immediately thought of you: <a href="https://youtube.com/watch?v=SxdOUGdseq4">Simple Made Easy</a></p><p>The bit about complecting state and time at 23:00 is exactly what we were discussing last week.</p><p>— Tom</p>', 1747700000000, 'gmail-m19'),
  ('m11a', 't11', 'test-user-1', 'Test User', 'testuser@gmail.com', 'mike.torres@protonmail.com', 'Can you review my resume?', 'Hey Mike, could you take a look at my updated resume?', '<p>Hey Mike,</p><p>Could you take a look at my updated resume? Attached the latest version plus a new headshot for LinkedIn.</p><p>Thanks!</p>', 1748490000000, 'gmail-m11a'),
  ('m11b', 't11', 'test-user-1', 'Mike Torres', 'mike.torres@protonmail.com', 'testuser@gmail.com', 'Re: Can you review my resume?', 'Sure thing! I made some suggestions in the attached doc.', '<p>Sure thing! I''ll take a look this weekend and send you some feedback.</p><p>The headshot looks great btw!</p>', 1748500000000, 'gmail-m11b'),
  ('m16', 't16', 'test-user-1', 'Revolut', 'statements@revolut.com', 'testuser@gmail.com', 'Your credit card statement is ready', 'Your December statement is available.', '<p>Hi Test User,</p><p>Your December 2024 statement is ready.</p><p><strong>Total: €1,247.83</strong></p><p>View your statement in the attached PDF or in the Revolut app.</p>', 1748000000000, 'gmail-m16'),
  ('m21', 't21', 'test-user-1', '"Alza.cz"', 'info@letter.alza.cz', 'testuser@gmail.com', 'Your new gadget is on its way!', 'Shipped today, tracking number inside.', '<p>Your order has been shipped! Track your package with the link below.</p>', 1747500000000, 'gmail-m21');

-- Blocked senders
INSERT OR REPLACE INTO blocked_senders (email, account_id, blocked_at)
VALUES
  ('spam@marketing-blast.com', 'test-user-1', 1747000000),
  ('noreply@annoying-notifications.io', 'test-user-1', 1747100000);

-- Settings (mark as synced before so the app doesn't try a fresh full sync)
INSERT OR REPLACE INTO settings (key, account_id, value)
VALUES ('historyId', 'test-user-1', '999999');

-- Attachments
INSERT OR REPLACE INTO attachments (id, message_id, thread_id, account_id, filename, mime_type, size, attachment_id)
VALUES
  ('att_m05_0', 'm05', 't05', 'test-user-1', 'invoice-january-2025.pdf', 'application/pdf', 245760, 'gmail-att-001'),
  ('att_m06c_0', 'm06c', 't06', 'test-user-1', 'revised-schedule.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 38912, 'gmail-att-002'),
  ('att_m07_0', 'm07', 't07', 'test-user-1', 'boarding-pass.pdf', 'application/pdf', 152000, 'gmail-att-003'),
  ('att_m07_1', 'm07', 't07', 'test-user-1', 'prague-weather.png', 'image/png', 89000, 'gmail-att-004'),
  ('att_m11_0', 'm11a', 't11', 'test-user-1', 'resume-v3.pdf', 'application/pdf', 312000, 'gmail-att-005'),
  ('att_m11_1', 'm11a', 't11', 'test-user-1', 'headshot.jpg', 'image/jpeg', 156000, 'gmail-att-006'),
  ('att_m16_0', 'm16', 't16', 'test-user-1', 'statement-december-2024.pdf', 'application/pdf', 98304, 'gmail-att-007');
