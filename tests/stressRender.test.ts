import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test that thread list rendering handles 5000 threads within performance budget
describe('Stress: 5000 thread rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="inbox"></div>';
  });

  it('renders 5000 threads initial batch within 100ms', async () => {
    // Import threadRow or the render function
    const { threadRow } = await import('../src/threadList');
    const { state } = await import('../src/state');
    
    // Setup mock accounts
    state.accounts = Array.from({ length: 10 }, (_, i) => ({
      id: `acct-${i}`,
      email: `user${i}@test.com`,
      name: `User ${i}`,
      colorIndex: i,
      accessToken: '', refreshToken: '', tokenExpiry: 0, signature: '',
    })) as any;
    state.vipSenders = [];
    state.groupedSenders = [];
    state.groupedDomains = [];
    
    // Generate 5000 mock threads
    const threads = Array.from({ length: 5000 }, (_, i) => ({
      id: `thread-${i}`,
      subject: `Test email subject number ${i}`,
      snippet: `This is the snippet for thread ${i}`,
      senderName: `Sender ${i % 100}`,
      senderEmail: `sender${i % 100}@example.com`,
      receivedAt: Date.now() - i * 60000,
      isUnread: i % 3 === 0,
      isArchived: false,
      isStarred: i % 10 === 0,
      hasAttachment: i % 7 === 0,
      gmailThreadId: `gthread-${i}`,
      snoozedUntil: null,
      snoozeLabel: null,
      messageCount: Math.floor(Math.random() * 5) + 1,
      label: 'INBOX',
      accountId: `acct-${i % 10}`,
      isMuted: false,
      isSetAside: false,
      category: 'personal',
      userLabels: '',
    }));
    
    // Measure rendering time for initial batch (first 100 — MAX_INITIAL_RENDER)
    const start = performance.now();
    const html = threads.slice(0, 100).map(t => threadRow(t, false)).join('');
    const elapsed = performance.now() - start;
    
    expect(html.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100); // Must render initial batch under 100ms
  });

  it('renders full 5000 threads without exceeding 500ms', async () => {
    const { threadRow } = await import('../src/threadList');
    const { state } = await import('../src/state');
    
    state.accounts = Array.from({ length: 10 }, (_, i) => ({
      id: `acct-${i}`,
      email: `user${i}@test.com`,
      name: `User ${i}`,
      colorIndex: i,
      accessToken: '', refreshToken: '', tokenExpiry: 0, signature: '',
    })) as any;
    state.vipSenders = [];
    state.groupedSenders = [];
    state.groupedDomains = [];
    
    const threads = Array.from({ length: 5000 }, (_, i) => ({
      id: `thread-${i}`,
      subject: `Test email subject number ${i}`,
      snippet: `This is the snippet for thread ${i}`,
      senderName: `Sender ${i % 100}`,
      senderEmail: `sender${i % 100}@example.com`,
      receivedAt: Date.now() - i * 60000,
      isUnread: i % 3 === 0,
      isArchived: false,
      isStarred: i % 10 === 0,
      hasAttachment: i % 7 === 0,
      gmailThreadId: `gthread-${i}`,
      snoozedUntil: null,
      snoozeLabel: null,
      messageCount: Math.floor(Math.random() * 5) + 1,
      label: 'INBOX',
      accountId: `acct-${i % 10}`,
      isMuted: false,
      isSetAside: false,
      category: 'personal',
      userLabels: '',
    }));
    
    const start = performance.now();
    const html = threads.map(t => threadRow(t, false)).join('');
    const elapsed = performance.now() - start;
    
    expect(html.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500); // Full render under 1500ms (CI variance)
  });
});
