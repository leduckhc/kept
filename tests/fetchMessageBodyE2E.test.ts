import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock import.meta.env.VITE_E2E = '1'
vi.stubEnv('VITE_E2E', '1');

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({ select: mockSelect, execute: vi.fn() }),
}));

vi.mock('../src/auth', () => ({
  ensureFreshToken: vi.fn().mockRejectedValue(new Error('should not be called in E2E')),
}));

import { fetchMessageBody } from '../src/gmail';

const account = { id: 'acc-1', email: 'test@gmail.com' } as any;

describe('fetchMessageBody — E2E mode', () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it('reads messages from local DB instead of calling Gmail API', async () => {
    mockSelect.mockResolvedValueOnce([
      { id: 'm1', from_name: 'Alice', from_email: 'alice@test.com', to_addresses: 'bob@test.com', subject: 'Hello', body_text: 'Hi Bob', body_html: '<p>Hi Bob</p>', received_at: 1000 },
      { id: 'm2', from_name: null, from_email: 'bob@test.com', to_addresses: 'alice@test.com', subject: 'Re: Hello', body_text: 'Hi Alice', body_html: null, received_at: 2000 },
    ]);

    const result = await fetchMessageBody(account, 'gmail-thread-1');

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      from: 'Alice <alice@test.com>',
      to: 'bob@test.com',
      cc: '',
      replyTo: '',
      body: 'Hi Bob',
      htmlBody: '<p>Hi Bob</p>',
      sanitizedHtml: '<p>Hi Bob</p>',
      receivedAt: 1000,
      gmailMessageId: 'm1',
    });
    expect(result.messages[1].from).toBe('bob@test.com'); // no from_name → email only
    expect(result.messages[1].htmlBody).toBeNull();
    expect(result.lastMessageId).toBe('m2');
  });

  it('returns empty when no messages found', async () => {
    mockSelect.mockResolvedValueOnce([]);

    const result = await fetchMessageBody(account, 'gmail-nonexistent');

    expect(result.messages).toHaveLength(0);
    expect(result.lastMessageId).toBeNull();
  });

  it('queries with JOIN through threads table for gmail_thread_id', async () => {
    mockSelect.mockResolvedValueOnce([]);

    await fetchMessageBody(account, 'gmail-t06');

    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining('JOIN threads t ON m.thread_id = t.id'),
      ['gmail-t06']
    );
    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining('WHERE t.gmail_thread_id = ?'),
      ['gmail-t06']
    );
  });

  it('does not call ensureFreshToken in E2E mode', async () => {
    mockSelect.mockResolvedValueOnce([]);
    // If ensureFreshToken were called, it would throw (see mock above)
    await expect(fetchMessageBody(account, 'gmail-t01')).resolves.toBeDefined();
  });
});
