/**
 * SmartFolderSidebar.tsx — Renders smart folder list in sidebar + creation dialog.
 * Single Responsibility: UI for browsing/creating/deleting smart folders.
 * Filter logic in smartFolders.ts, persistence in smartFolderDb.ts.
 */
import { For, Show, createSignal } from 'solid-js';
import { appState, activateSmartFolder } from './store';
import { createSmartFolder } from './smartFolderActions';
import { icon } from '../icons';
import type { ConditionField, ConditionOperator, SmartFolderCondition } from '../smartFolders';

// ── Smart Folder List (sidebar section) ──────────────────────

export function SmartFolderList() {
  return (
    <div class="sidebar-smart-folders" id="sidebar-smart-folders">
      <For each={appState.smartFolders}>
        {(folder) => (
          <button
            class={`sidebar-btn sidebar-smart-folder-btn${appState.activeSmartFolderId === folder.id ? ' active' : ''}`}
            title={folder.name}
            data-folder-id={folder.id}
            onClick={() => activateSmartFolder(
              appState.activeSmartFolderId === folder.id ? null : folder.id
            )}
          >
            <span innerHTML={icon.folderMove('16px')} />
            <span class="smart-folder-name">{folder.name}</span>
          </button>
        )}
      </For>
    </div>
  );
}

// ── Create Smart Folder Dialog ───────────────────────────────

const FIELD_OPTIONS: Array<{ value: ConditionField; label: string }> = [
  { value: 'from', label: 'From' },
  { value: 'subject', label: 'Subject' },
  { value: 'domain', label: 'Domain' },
  { value: 'category', label: 'Category' },
  { value: 'label', label: 'Label' },
  { value: 'hasAttachment', label: 'Has Attachment' },
  { value: 'isUnread', label: 'Unread' },
  { value: 'isStarred', label: 'Starred' },
];

const OPERATOR_OPTIONS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
];

function isBooleanField(field: ConditionField): boolean {
  return field === 'hasAttachment' || field === 'isUnread' || field === 'isStarred';
}

export function CreateSmartFolderDialog(props: { open: boolean; onClose: () => void }) {
  const [name, setName] = createSignal('');
  const [matchMode, setMatchMode] = createSignal<'all' | 'any'>('all');
  const [conditions, setConditions] = createSignal<SmartFolderCondition[]>([
    { field: 'from', operator: 'contains', value: '' },
  ]);

  const addCondition = () => {
    setConditions([...conditions(), { field: 'from', operator: 'contains', value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions().filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, patch: Partial<SmartFolderCondition>) => {
    setConditions(conditions().map((c, i) => i === index ? { ...c, ...patch } : c));
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmedName = name().trim();
    if (!trimmedName || conditions().length === 0) return;

    // Filter out empty-value conditions (except booleans)
    const validConditions = conditions().filter(c =>
      isBooleanField(c.field) || c.value.trim() !== ''
    );
    if (validConditions.length === 0) return;

    await createSmartFolder({
      name: trimmedName,
      accountId: appState.account?.id ?? '',
      conditions: validConditions,
      matchMode: matchMode(),
    });

    // Reset
    setName('');
    setConditions([{ field: 'from', operator: 'contains', value: '' }]);
    setMatchMode('all');
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="smart-folder-dialog-backdrop" onClick={props.onClose} />
      <div class="smart-folder-dialog" id="smart-folder-dialog">
        <form onSubmit={handleSubmit}>
          <h3>New Smart Folder</h3>
          <input
            type="text"
            class="smart-folder-name-input"
            id="smart-folder-name-input"
            placeholder="Folder name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            autofocus
          />

          <div class="smart-folder-match-mode">
            <label>Match</label>
            <select
              value={matchMode()}
              onChange={(e) => setMatchMode(e.currentTarget.value as 'all' | 'any')}
            >
              <option value="all">All conditions (AND)</option>
              <option value="any">Any condition (OR)</option>
            </select>
          </div>

          <div class="smart-folder-conditions">
            <For each={conditions()}>
              {(cond, index) => (
                <div class="smart-folder-condition-row">
                  <select
                    value={cond.field}
                    onChange={(e) => {
                      const field = e.currentTarget.value as ConditionField;
                      const patch: Partial<SmartFolderCondition> = { field };
                      if (isBooleanField(field)) {
                        patch.operator = 'equals';
                        patch.value = 'true';
                      }
                      updateCondition(index(), patch);
                    }}
                  >
                    <For each={FIELD_OPTIONS}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>

                  <Show when={!isBooleanField(cond.field)}>
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(index(), { operator: e.currentTarget.value as ConditionOperator })}
                    >
                      <For each={OPERATOR_OPTIONS}>
                        {(opt) => <option value={opt.value}>{opt.label}</option>}
                      </For>
                    </select>
                    <input
                      type="text"
                      placeholder="value"
                      value={cond.value}
                      onInput={(e) => updateCondition(index(), { value: e.currentTarget.value })}
                    />
                  </Show>

                  <Show when={conditions().length > 1}>
                    <button type="button" class="condition-remove-btn" onClick={() => removeCondition(index())}>
                      <span innerHTML={icon.close('14px')} />
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <button type="button" class="smart-folder-add-condition" onClick={addCondition}>
            + Add condition
          </button>

          <div class="smart-folder-dialog-actions">
            <button type="button" class="btn-cancel" onClick={props.onClose}>Cancel</button>
            <button type="submit" class="btn-create" id="btn-create-smart-folder">Create</button>
          </div>
        </form>
      </div>
    </Show>
  );
}
