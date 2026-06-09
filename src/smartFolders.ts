/**
 * Smart Folders — pure filter engine.
 * No DB, no side effects. Just types + filter evaluation.
 *
 * Single Responsibility: evaluate whether a thread matches a set of conditions.
 * DB persistence is handled separately in smartFolderDb.ts.
 */

// ── Types ─────────────────────────────────────────────────────

export type ConditionField =
  | 'from'       // matches senderEmail OR senderName
  | 'subject'    // matches subject line
  | 'domain'     // matches sender email domain
  | 'category'   // matches category (personal, updates, newsletters)
  | 'label'      // matches user_labels (comma-separated)
  | 'hasAttachment'  // boolean
  | 'isUnread'       // boolean
  | 'isStarred';     // boolean

export type ConditionOperator = 'contains' | 'equals';

export interface SmartFolderCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

export interface SmartFolder {
  id: string;
  name: string;
  accountId: string;
  conditions: SmartFolderCondition[];
  matchMode: 'all' | 'any';
  createdAt: number;
}

/** Minimal thread shape needed for filtering (decoupled from full Thread type) */
export interface FilterableThread {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  category: string;
  label: string;
  receivedAt: number;
  userLabels: string;
}

// ── Condition evaluation ──────────────────────────────────────

function getFieldValue(thread: FilterableThread, field: ConditionField): string {
  switch (field) {
    case 'from':
      return `${thread.senderName} ${thread.senderEmail}`.toLowerCase();
    case 'subject':
      return thread.subject.toLowerCase();
    case 'domain':
      return (thread.senderEmail.split('@')[1] ?? '').toLowerCase();
    case 'category':
      return thread.category.toLowerCase();
    case 'label':
      return thread.userLabels.toLowerCase();
    case 'hasAttachment':
      return thread.hasAttachment ? 'true' : 'false';
    case 'isUnread':
      return thread.isUnread ? 'true' : 'false';
    case 'isStarred':
      return thread.isStarred ? 'true' : 'false';
  }
}

function evaluateCondition(thread: FilterableThread, condition: SmartFolderCondition): boolean {
  const condValue = condition.value.toLowerCase();

  // Special handling: 'from' + 'equals' checks email only (not name+email concat)
  if (condition.field === 'from' && condition.operator === 'equals') {
    return thread.senderEmail.toLowerCase() === condValue;
  }

  const fieldValue = getFieldValue(thread, condition.field);

  switch (condition.operator) {
    case 'contains':
      return fieldValue.includes(condValue);
    case 'equals':
      return fieldValue === condValue;
  }
}

// ── Public API ────────────────────────────────────────────────

/** Check if thread matches ALL conditions (AND mode) */
export function matchesAllConditions(thread: FilterableThread, conditions: SmartFolderCondition[]): boolean {
  return conditions.every(c => evaluateCondition(thread, c));
}

/** Check if thread matches ANY condition (OR mode) */
export function matchesAnyCondition(thread: FilterableThread, conditions: SmartFolderCondition[]): boolean {
  return conditions.some(c => evaluateCondition(thread, c));
}

/** Check if thread matches a smart folder's criteria */
export function matchesThread(thread: FilterableThread, folder: SmartFolder): boolean {
  if (folder.conditions.length === 0) return true;

  if (folder.matchMode === 'any') {
    return matchesAnyCondition(thread, folder.conditions);
  }
  return matchesAllConditions(thread, folder.conditions);
}
