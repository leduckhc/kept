// threadActions.test.ts — Unit tests for per-message thread actions, inline compose, quote reply
import { describe, it, expect, beforeEach } from 'vitest';

// Test the pure logic extracted from ThreadReader — parseSender, buildReplyAllRecipients

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: from, email: from };
}

function buildReplyAllRecipients(
  msg: { from: string; to: string; cc: string; replyTo: string },
  myEmail: string
): { to: string; cc: string } {
  const sender = parseSender(msg.replyTo || msg.from);
  const toAddrs = (msg.to || '').split(',').map(s => s.trim()).filter(Boolean);
  const ccAddrs = (msg.cc || '').split(',').map(s => s.trim()).filter(Boolean);
  const allRecipients = [...toAddrs, ...ccAddrs]
    .filter(addr => {
      const parsed = parseSender(addr);
      return parsed.email.toLowerCase() !== myEmail.toLowerCase() &&
             parsed.email.toLowerCase() !== sender.email.toLowerCase();
    });
  return { to: sender.email, cc: allRecipients.join(', ') };
}

describe('parseSender', () => {
  it('parses "Name <email>" format', () => {
    const result = parseSender('Alice Smith <alice@example.com>');
    expect(result).toEqual({ name: 'Alice Smith', email: 'alice@example.com' });
  });

  it('handles bare email as both name and email', () => {
    const result = parseSender('bob@test.com');
    expect(result).toEqual({ name: 'bob@test.com', email: 'bob@test.com' });
  });

  it('trims whitespace in name', () => {
    const result = parseSender('  Jane Doe  <jane@co.com>');
    expect(result).toEqual({ name: 'Jane Doe', email: 'jane@co.com' });
  });
});

describe('buildReplyAllRecipients', () => {
  const myEmail = 'me@mycompany.com';

  it('excludes self from reply-all recipients', () => {
    const msg = {
      from: 'Alice <alice@ex.com>',
      to: 'me@mycompany.com, Bob <bob@ex.com>',
      cc: 'Carol <carol@ex.com>',
      replyTo: '',
    };
    const result = buildReplyAllRecipients(msg, myEmail);
    expect(result.to).toBe('alice@ex.com');
    expect(result.cc).toContain('bob@ex.com');
    expect(result.cc).toContain('carol@ex.com');
    expect(result.cc).not.toContain('me@mycompany.com');
  });

  it('excludes sender from cc list', () => {
    const msg = {
      from: 'Alice <alice@ex.com>',
      to: 'me@mycompany.com, Alice <alice@ex.com>',
      cc: '',
      replyTo: '',
    };
    const result = buildReplyAllRecipients(msg, myEmail);
    expect(result.to).toBe('alice@ex.com');
    expect(result.cc).not.toContain('alice@ex.com');
  });

  it('uses replyTo over from when available', () => {
    const msg = {
      from: 'Alice <alice@ex.com>',
      to: 'me@mycompany.com',
      cc: '',
      replyTo: 'Support <support@ex.com>',
    };
    const result = buildReplyAllRecipients(msg, myEmail);
    expect(result.to).toBe('support@ex.com');
  });

  it('handles empty to/cc gracefully', () => {
    const msg = { from: 'Alice <alice@ex.com>', to: '', cc: '', replyTo: '' };
    const result = buildReplyAllRecipients(msg, myEmail);
    expect(result.to).toBe('alice@ex.com');
    expect(result.cc).toBe('');
  });

  it('case-insensitive email matching', () => {
    const msg = {
      from: 'Alice <alice@ex.com>',
      to: 'ME@MYCOMPANY.COM, Bob <bob@ex.com>',
      cc: '',
      replyTo: '',
    };
    const result = buildReplyAllRecipients(msg, myEmail);
    expect(result.cc).not.toContain('ME@MYCOMPANY.COM');
    expect(result.cc).toContain('bob@ex.com');
  });
});

describe('openCompose with per-message data', () => {
  // Test that openCompose correctly sets inline + messageId state
  // We import from store to test the real function
  let openCompose: typeof import('../src/solid/store').openCompose;
  let appState: typeof import('../src/solid/store').appState;
  let closeCompose: typeof import('../src/solid/store').closeCompose;

  beforeEach(async () => {
    const store = await import('../src/solid/store');
    openCompose = store.openCompose;
    appState = store.appState;
    closeCompose = store.closeCompose;
  });

  it('sets composeInline when inline option is true', () => {
    openCompose('reply', {
      to: 'alice@ex.com',
      subject: 'Re: Test',
      threadId: 'thread-1',
      messageId: 'msg-123',
      inline: true,
    });
    expect(appState.composeInline).toBe(true);
    expect(appState.composeReplyMessageId).toBe('msg-123');
    expect(appState.composeTo).toBe('alice@ex.com');
    closeCompose();
  });

  it('sets quotedText into composeBody with prefix', () => {
    openCompose('reply', {
      to: 'bob@ex.com',
      subject: 'Re: Hello',
      threadId: 'thread-2',
      quotedText: 'On Jan 1, Bob wrote:\n> some text\n',
      inline: true,
    });
    expect(appState.composeBody).toContain('On Jan 1, Bob wrote:');
    expect(appState.composeBody).toContain('> some text');
    closeCompose();
  });

  it('closeCompose resets inline and messageId', () => {
    openCompose('reply', { to: 'x@x.com', inline: true, messageId: 'msg-1' });
    closeCompose();
    expect(appState.composeInline).toBe(false);
    expect(appState.composeReplyMessageId).toBeNull();
  });

  it('defaults inline to false when not specified', () => {
    openCompose('reply', { to: 'a@b.com', subject: 'Re: Hi', threadId: 't1' });
    expect(appState.composeInline).toBe(false);
    expect(appState.composeReplyMessageId).toBeNull();
    closeCompose();
  });
});
