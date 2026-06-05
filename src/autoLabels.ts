// autoLabels.ts — Rule-based auto-labeling engine (KPT-085)
// Pure logic: no DB or DOM dependencies in the core functions (testable).
// DB integration at the bottom (loadRules, saveRule, deleteRule, runAutoLabelsOnSync).

export interface Condition {
  field: 'from' | 'subject' | 'to' | 'has_attachment';
  operator: 'contains' | 'equals';
  value: string;
}

export interface AutoLabelRule {
  id: string;
  label: string;
  conditions: Condition[];
  match_mode: 'all' | 'any';
}

export interface ThreadForLabeling {
  id: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  to_addresses: string;
  has_attachment: number;
  user_labels: string;
}

/**
 * Parse a human-readable condition string into a Condition object.
 * Supported formats: from:value, subject:value, to:value, has:attachment
 */
export function parseCondition(raw: string): Condition | null {
  const trimmed = raw.trim();

  // has:attachment special case
  if (/^has\s*:\s*attachment$/i.test(trimmed)) {
    return { field: 'has_attachment', operator: 'equals', value: '1' };
  }

  const match = trimmed.match(/^(from|subject|to)\s*:\s*(.+)$/i);
  if (!match) return null;

  const field = match[1].toLowerCase() as 'from' | 'subject' | 'to';
  const value = match[2].trim();
  return { field, operator: 'contains', value };
}

/**
 * Check if a single rule matches a thread.
 */
export function matchRule(rule: AutoLabelRule, thread: ThreadForLabeling): boolean {
  const check = (cond: Condition): boolean => {
    switch (cond.field) {
      case 'from': {
        const haystack = `${thread.sender_email} ${thread.sender_name}`.toLowerCase();
        return haystack.includes(cond.value.toLowerCase());
      }
      case 'subject': {
        return thread.subject.toLowerCase().includes(cond.value.toLowerCase());
      }
      case 'to': {
        return thread.to_addresses.toLowerCase().includes(cond.value.toLowerCase());
      }
      case 'has_attachment': {
        return String(thread.has_attachment) === cond.value;
      }
      default:
        return false;
    }
  };

  if (rule.match_mode === 'any') {
    return rule.conditions.some(check);
  }
  return rule.conditions.every(check);
}

/**
 * Apply all rules to a thread and return NEW labels to add (skipping already-applied).
 */
export function applyRules(rules: AutoLabelRule[], thread: ThreadForLabeling): string[] {
  const existing = new Set(
    thread.user_labels
      ? thread.user_labels.split(',').map((l) => l.trim()).filter(Boolean)
      : []
  );

  const newLabels: string[] = [];
  for (const rule of rules) {
    if (existing.has(rule.label)) continue;
    if (matchRule(rule, thread)) {
      newLabels.push(rule.label);
      existing.add(rule.label); // prevent duplicate from multiple rules with same label
    }
  }
  return newLabels;
}

// ─── DB Integration ────────────────────────────────────────────────────────────

import { getDb } from './db';

interface RuleRow {
  id: string;
  account_id: string;
  label: string;
  conditions: string;
  match_mode: string;
}

/** Load all auto-label rules for an account */
export async function loadAutoLabelRules(accountId: string): Promise<AutoLabelRule[]> {
  const db = await getDb();
  const rows = await db.select<RuleRow[]>(
    'SELECT id, label, conditions, match_mode FROM auto_label_rules WHERE account_id = ? ORDER BY created_at',
    [accountId]
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    conditions: JSON.parse(r.conditions) as Condition[],
    match_mode: r.match_mode as 'all' | 'any',
  }));
}

/** Save (upsert) a rule */
export async function saveAutoLabelRule(accountId: string, rule: AutoLabelRule): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO auto_label_rules (id, account_id, label, conditions, match_mode)
     VALUES (?, ?, ?, ?, ?)`,
    [rule.id, accountId, rule.label, JSON.stringify(rule.conditions), rule.match_mode]
  );
}

/** Delete a rule */
export async function deleteAutoLabelRule(ruleId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM auto_label_rules WHERE id = ?', [ruleId]);
}

interface ThreadRow {
  id: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  has_attachment: number;
  user_labels: string;
}

/**
 * Run auto-label rules on all threads for an account.
 * Called after sync completes. Updates user_labels for threads that gain new labels.
 */
export async function runAutoLabelsOnSync(accountId: string): Promise<number> {
  const rules = await loadAutoLabelRules(accountId);
  if (rules.length === 0) return 0;

  const db = await getDb();
  const threads = await db.select<ThreadRow[]>(
    `SELECT id, sender_email, sender_name, subject, has_attachment, COALESCE(user_labels, '') as user_labels
     FROM threads WHERE account_id = ?`,
    [accountId]
  );

  let updated = 0;
  for (const t of threads) {
    const thread: ThreadForLabeling = {
      ...t,
      to_addresses: '', // to_addresses not on threads table; rules using to: match on messages
    };
    const newLabels = applyRules(rules, thread);
    if (newLabels.length > 0) {
      const combined = thread.user_labels
        ? `${thread.user_labels},${newLabels.join(',')}`
        : newLabels.join(',');
      await db.execute('UPDATE threads SET user_labels = ? WHERE id = ?', [combined, t.id]);
      updated++;
    }
  }
  return updated;
}
