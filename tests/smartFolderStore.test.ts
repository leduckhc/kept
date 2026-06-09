/**
 * Unit tests for Smart Folder store integration.
 * Tests that filteredThreads respects activeSmartFolder.
 */
import { describe, it, expect } from 'vitest';
import { matchesThread, type SmartFolder, type FilterableThread } from '../src/smartFolders';

// We test the filter logic that will be used inside the store's filteredThreads memo.
// The actual store integration is a one-liner: filter threads through matchesThread.
// Testing it here as a pure function ensures correctness.

const threads: FilterableThread[] = [
  {
    id: 't01', subject: 'Amazon order shipped', senderName: 'Amazon',
    senderEmail: 'shipment-tracking@amazon.com', snippet: 'Your package...',
    isUnread: true, isStarred: false, hasAttachment: false,
    category: 'updates', label: 'INBOX', receivedAt: 1748700000000, userLabels: '',
  },
  {
    id: 't02', subject: 'Dinner this weekend?', senderName: 'Sarah Chen',
    senderEmail: 'sarah.chen@gmail.com', snippet: 'Saturday works for me!',
    isUnread: true, isStarred: false, hasAttachment: false,
    category: 'personal', label: 'INBOX', receivedAt: 1748690000000, userLabels: 'friends',
  },
  {
    id: 't03', subject: 'PR review requested', senderName: 'GitHub',
    senderEmail: 'notifications@github.com', snippet: 'Review #142...',
    isUnread: true, isStarred: false, hasAttachment: false,
    category: 'updates', label: 'INBOX', receivedAt: 1748680000000, userLabels: 'work',
  },
  {
    id: 't04', subject: 'Invoice for January', senderName: 'Acme Corp',
    senderEmail: 'billing@acmecorp.com', snippet: 'Please find attached...',
    isUnread: false, isStarred: true, hasAttachment: true,
    category: 'updates', label: 'INBOX', receivedAt: 1748660000000, userLabels: 'finance,work',
  },
];

function applySmartFolder(allThreads: FilterableThread[], folder: SmartFolder | null): FilterableThread[] {
  if (!folder) return allThreads;
  return allThreads.filter(t => matchesThread(t, folder));
}

describe('Smart folder filtering in store context', () => {
  it('no active folder returns all threads', () => {
    expect(applySmartFolder(threads, null)).toHaveLength(4);
  });

  it('filters by domain', () => {
    const folder: SmartFolder = {
      id: 'sf1', name: 'GitHub', accountId: 'a1',
      conditions: [{ field: 'domain', operator: 'equals', value: 'github.com' }],
      matchMode: 'all', createdAt: 0,
    };
    const result = applySmartFolder(threads, folder);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t03');
  });

  it('filters by category', () => {
    const folder: SmartFolder = {
      id: 'sf2', name: 'Personal', accountId: 'a1',
      conditions: [{ field: 'category', operator: 'equals', value: 'personal' }],
      matchMode: 'all', createdAt: 0,
    };
    const result = applySmartFolder(threads, folder);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t02');
  });

  it('filters by multiple conditions (AND)', () => {
    const folder: SmartFolder = {
      id: 'sf3', name: 'Work with attachments', accountId: 'a1',
      conditions: [
        { field: 'label', operator: 'contains', value: 'work' },
        { field: 'hasAttachment', operator: 'equals', value: 'true' },
      ],
      matchMode: 'all', createdAt: 0,
    };
    const result = applySmartFolder(threads, folder);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t04');
  });

  it('filters by multiple conditions (OR)', () => {
    const folder: SmartFolder = {
      id: 'sf4', name: 'Personal or starred', accountId: 'a1',
      conditions: [
        { field: 'category', operator: 'equals', value: 'personal' },
        { field: 'isStarred', operator: 'equals', value: 'true' },
      ],
      matchMode: 'any', createdAt: 0,
    };
    const result = applySmartFolder(threads, folder);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id).sort()).toEqual(['t02', 't04']);
  });

  it('combines with view filter (inbox only + smart folder)', () => {
    // Simulate: first filter to inbox, then apply smart folder
    const inboxThreads = threads.filter(t => t.label === 'INBOX' && t.isUnread);
    const folder: SmartFolder = {
      id: 'sf5', name: 'Updates only', accountId: 'a1',
      conditions: [{ field: 'category', operator: 'equals', value: 'updates' }],
      matchMode: 'all', createdAt: 0,
    };
    const result = applySmartFolder(inboxThreads, folder);
    expect(result).toHaveLength(2); // t01 + t03 (unread updates)
  });
});
