import { flagsForTriageAction } from '../../../packages/mail-core/src/index.js';

const PROVIDER_ACTION_STATUSES = ['queued', 'error', 'needs-reconnect'];

export function filterArchivedInboxThreads(threads = []) {
  return threads.filter((thread) => !getThreadTriageState(thread).archived);
}

export function getThreadTriageState(thread = {}) {
  const flags = thread.flags || {};
  return {
    read: Boolean(flags.read ?? !thread.isUnread),
    starred: Boolean(flags.starred ?? thread.isStarred ?? thread.isPriority),
    archived: Boolean(flags.archived ?? thread.isArchived),
  };
}

export function resolveTriageAction(thread, intent) {
  const triage = getThreadTriageState(thread);
  if (intent === 'archive') return 'archive';
  if (intent === 'read-toggle') return triage.read ? 'mark-unread' : 'mark-read';
  if (intent === 'star-toggle') return triage.starred ? 'unstar' : 'star';
  if (['mark-read', 'mark-unread', 'star', 'unstar'].includes(intent)) return intent;
  throw new Error(`Unsupported triage intent: ${intent}`);
}

export function isEditableShortcutTarget(target) {
  const tagName = String(target?.tagName || '').toUpperCase();
  return Boolean(target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName));
}

export function isTriageShortcutEvent(event) {
  if (!event || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (isEditableShortcutTarget(event.target)) return false;
  return ['e', 'u', 's', 'Enter'].includes(normalizeShortcutKey(event));
}

export function normalizeShortcutKey(event) {
  return event?.key === 'Enter' ? 'Enter' : String(event?.key || '').toLowerCase();
}

export function statusCopyForTriage(status) {
  switch (status) {
    case 'saved-locally': return 'Saved locally';
    case 'queued': return 'Queued';
    case 'syncing': return 'Queued';
    case 'synced': return 'Synced to Gmail';
    case 'needs-reconnect': return 'Needs reconnect';
    case 'error': return 'Queued';
    default: return '';
  }
}

export function createTriageActionController({
  repository,
  connector = null,
  accountId,
  now = () => new Date(),
  online = () => true,
  idFactory = defaultActionId,
} = {}) {
  if (!repository) throw new Error('repository is required');
  if (!accountId) throw new Error('accountId is required');

  async function applyThreadAction(thread, intent) {
    const action = resolveTriageAction(thread, intent);
    const desiredFlags = flagsForTriageAction(action);
    const localMessageId = localMessageIdForThread(thread);
    const providerMessageId = providerMessageIdForThread(thread);
    const timestamp = now().toISOString();

    if (!providerMessageId) {
      try {
        if (localMessageId) await repository.setFlags(localMessageId, desiredFlags);
      } catch (_error) {
        // Imported/local-only rows may live in desktop localStorage before they are in the durable repository.
      }
      return { status: 'saved-locally', action, desiredFlags, localMessageId, providerMessageId: null };
    }

    const entry = await repository.queueTriageAction({
      id: idFactory(),
      accountId: thread.accountId || accountId,
      messageId: localMessageId,
      threadId: thread.id ? String(thread.id) : null,
      providerMessageId,
      providerThreadId: thread.providerThreadId || thread.gmailThreadId || thread.id || null,
      action,
      desiredFlags,
      status: online() && connector?.applyTriageAction ? 'syncing' : 'queued',
      createdAt: timestamp,
      attemptedAt: online() && connector?.applyTriageAction ? timestamp : null,
      error: null,
    });

    if (!online() || !connector?.applyTriageAction) return { status: 'queued', action, entry };

    try {
      await connector.applyTriageAction(providerMessageId, action);
      const synced = await repository.updateTriageActionStatus(entry.id, { status: 'synced', confirmedAt: now().toISOString(), error: null });
      return { status: 'synced', action, entry: synced };
    } catch (error) {
      const status = error?.code === 'GMAIL_AUTH_REVOKED' ? 'needs-reconnect' : 'queued';
      const updated = await repository.updateTriageActionStatus(entry.id, { status, error: userSafeTriageError(error) });
      return { status, action, entry: updated };
    }
  }

  async function retryQueuedActions() {
    if (!online() || !connector?.applyTriageAction || typeof repository.listTriageActions !== 'function') return [];
    const entries = await repository.listTriageActions({ accountId });
    const pending = entries.filter((entry) => PROVIDER_ACTION_STATUSES.includes(entry.status));
    const results = [];
    for (const entry of pending) {
      if (!entry.providerMessageId) continue;
      await repository.updateTriageActionStatus(entry.id, { status: 'syncing', attemptedAt: now().toISOString(), error: null });
      try {
        await connector.applyTriageAction(entry.providerMessageId, entry.action);
        results.push(await repository.updateTriageActionStatus(entry.id, { status: 'synced', confirmedAt: now().toISOString(), error: null }));
      } catch (error) {
        const status = error?.code === 'GMAIL_AUTH_REVOKED' ? 'needs-reconnect' : 'queued';
        results.push(await repository.updateTriageActionStatus(entry.id, { status, error: userSafeTriageError(error) }));
      }
    }
    return results;
  }

  return { applyThreadAction, retryQueuedActions };
}

export function localMessageIdForThread(thread = {}) {
  return String(thread.localMessageId || thread.messageId || thread.id || '');
}

export function providerMessageIdForThread(thread = {}) {
  return thread.providerMessageId ? String(thread.providerMessageId) : '';
}

export function userSafeTriageError(_error) {
  return 'Gmail sync is queued.';
}

function defaultActionId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
