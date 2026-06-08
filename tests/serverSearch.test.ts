import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
const { mockSelect, mockExecute } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => Promise.resolve([])),
  mockExecute: vi.fn(() => Promise.resolve({ rowsAffected: 0 })),
}));

vi.mock('../src/db', () => ({
  getDb: vi.fn(() => Promise.resolve({ select: mockSelect, execute: mockExecute })),
}));

// Mock auth — passthrough
vi.mock('../src/auth', () => ({
  ensureFreshToken: vi.fn((a) => Promise.resolve(a)),
}));

// Mock followupReminders
vi.mock('../src/followupReminders', () => ({
  autoCancelIfReplied: vi.fn(),
  loadReminders: vi.fn(() => []),
}));

import { searchGmail } from '../src/gmail';

const mockAccount = {
  id: 'acc-1',
  email: 'test@example.com',
  accessToken: 'tok_test',
  refreshToken: 'ref_test',
  provider: 'gmail',
  tokenExpiry: Date.now() + 3600000,
  signature: '',
  colorIndex: 0,
} as any;

describe('searchGmail', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('calls messages.list with q parameter and returns deduplicated thread IDs', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      messages: [
        { id: 'msg-1', threadId: 'thread-1' },
        { id: 'msg-2', threadId: 'thread-2' },
        { id: 'msg-3', threadId: 'thread-1' }, // duplicate thread
      ],
      resultSizeEstimate: 3,
    }), { status: 200 }));

    const results = await searchGmail(mockAccount, 'from:bob subject:hello');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/me/messages?'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok_test' }),
      }),
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('q=from%3Abob+subject%3Ahello');
    expect(url).toContain('maxResults=50');

    // Deduplicates by threadId
    expect(results.threadIds).toEqual(['thread-1', 'thread-2']);
    expect(results.totalEstimate).toBe(3);
  });

  it('returns empty results when no messages match', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      messages: [],
      resultSizeEstimate: 0,
    }), { status: 200 }));

    const results = await searchGmail(mockAccount, 'nonexistent');
    expect(results.threadIds).toEqual([]);
    expect(results.totalEstimate).toBe(0);
  });

  it('returns empty results when messages field is missing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      resultSizeEstimate: 0,
    }), { status: 200 }));

    const results = await searchGmail(mockAccount, 'nothing');
    expect(results.threadIds).toEqual([]);
  });

  it('respects maxResults parameter', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    }), { status: 200 }));

    await searchGmail(mockAccount, 'test', 20);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('maxResults=20');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(searchGmail(mockAccount, 'test')).rejects.toThrow('Gmail API error 403');
  });
});
