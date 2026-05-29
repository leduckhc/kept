import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTriageActionController,
  filterArchivedInboxThreads,
  getThreadTriageState,
  isEditableShortcutTarget,
  isTriageShortcutEvent,
  resolveTriageAction,
  statusCopyForTriage,
} from '../src/triage-actions.js';

const baseThread = {
  id: 'thr_1',
  localMessageId: 'msg_1',
  providerMessageId: 'gmail_msg_1',
  accountId: 'acct_gmail_primary',
  subject: 'Action me',
  flags: { read: false, starred: false, archived: false },
  isUnread: true,
  isStarred: false,
  isArchived: false,
};

function createRepository() {
  const flags = new Map([['msg_1', { read: false, starred: false, archived: false }]]);
  const actions = [];
  return {
    flags,
    actions,
    async setFlags(messageId, nextFlags) {
      flags.set(messageId, { ...flags.get(messageId), ...nextFlags });
      return flags.get(messageId);
    },
    async queueTriageAction(action) {
      actions.push({ ...action });
      if (action.messageId) await this.setFlags(action.messageId, action.desiredFlags);
      return { ...action };
    },
    async updateTriageActionStatus(actionId, patch) {
      const action = actions.find((candidate) => candidate.id === actionId);
      Object.assign(action, patch);
      return { ...action };
    },
    async listTriageActions({ status }: { status?: any } = {}) {
      const statuses = Array.isArray(status) ? status : (status ? [status] : null);
      return actions.filter((action) => !statuses || statuses.includes(action.status)).map((action) => ({ ...action }));
    },
  };
}

test('filterArchivedInboxThreads hides archived rows without mutating source threads', () => {
  const source = [baseThread, { ...baseThread, id: 'thr_2', flags: { read: true, starred: false, archived: true } }];

  const visible = filterArchivedInboxThreads(source);

  assert.deepEqual(visible.map((thread) => thread.id), ['thr_1']);
  assert.equal(source.length, 2);
});

test('triage state resolves read, star, and archive actions from repository flags', () => {
  assert.deepEqual(getThreadTriageState(baseThread), { read: false, starred: false, archived: false });
  assert.equal(resolveTriageAction(baseThread, 'read-toggle'), 'mark-read');
  assert.equal(resolveTriageAction({ ...baseThread, flags: { read: true, starred: true, archived: false } }, 'read-toggle'), 'mark-unread');
  assert.equal(resolveTriageAction(baseThread, 'star-toggle'), 'star');
  assert.equal(resolveTriageAction({ ...baseThread, flags: { read: false, starred: true, archived: false } }, 'star-toggle'), 'unstar');
  assert.equal(resolveTriageAction(baseThread, 'archive'), 'archive');
});

test('keyboard shortcuts ignore search inputs and editable content', () => {
  assert.equal(isEditableShortcutTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableShortcutTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableShortcutTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTriageShortcutEvent({ key: 'e', target: { tagName: 'INPUT' } }), false);
  assert.equal(isTriageShortcutEvent({ key: 's', target: { tagName: 'BUTTON' } }), true);
  assert.equal(isTriageShortcutEvent({ key: 'k', target: { tagName: 'BUTTON' } }), false);
});

test('controller optimistically queues then syncs Gmail actions without leaking body content', async () => {
  const repository = createRepository();
  const connectorCalls = [];
  const controller = createTriageActionController({
    repository,
    connector: { async applyTriageAction(messageId, action) { connectorCalls.push({ messageId, action }); return { id: messageId }; } },
    accountId: 'acct_gmail_primary',
    now: () => new Date('2026-05-28T00:00:00Z'),
    online: () => true,
    idFactory: () => 'act_1',
  } as any);

  const result = await controller.applyThreadAction({ ...baseThread, body: 'private body must not leak' }, 'archive');

  assert.equal((result as any).status, 'synced');
  assert.deepEqual(repository.flags.get('msg_1'), { read: false, starred: false, archived: true });
  assert.deepEqual(connectorCalls, [{ messageId: 'gmail_msg_1', action: 'archive' }]);
  assert.equal(repository.actions[0].error, null);
  assert.equal(JSON.stringify(repository.actions).includes('private body'), false);
});

test('controller keeps local-only actions saved locally when no provider message id exists', async () => {
  const repository = createRepository();
  const controller = createTriageActionController({ repository, accountId: 'acct_gmail_primary', idFactory: () => 'act_local' } as any);

  const result = await controller.applyThreadAction({ ...baseThread, providerMessageId: '', source: 'local' }, 'star');

  assert.equal((result as any).status, 'saved-locally');
  assert.deepEqual(repository.flags.get('msg_1'), { read: false, starred: true, archived: false });
  assert.deepEqual(repository.actions, []);
});

test('controller leaves provider actions queued offline and status copy is user-facing', async () => {
  const repository = createRepository();
  const controller = createTriageActionController({ repository, accountId: 'acct_gmail_primary', online: () => false, idFactory: () => 'act_queued' } as any);

  const result = await controller.applyThreadAction(baseThread, 'mark-read');

  assert.equal((result as any).status, 'queued');
  assert.equal(repository.actions[0].status, 'queued');
  assert.equal(statusCopyForTriage('saved-locally'), 'Saved locally');
  assert.equal(statusCopyForTriage('queued'), 'Queued');
  assert.equal(statusCopyForTriage('synced'), 'Synced to Gmail');
  assert.equal(statusCopyForTriage('needs-reconnect'), 'Needs reconnect');
});
