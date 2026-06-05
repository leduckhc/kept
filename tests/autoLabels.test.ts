import { describe, it, expect } from 'vitest';
import { matchRule, applyRules, parseCondition, type AutoLabelRule, type ThreadForLabeling } from '../src/autoLabels';

describe('parseCondition', () => {
  it('parses from: condition', () => {
    const cond = parseCondition('from:@github.com');
    expect(cond).toEqual({ field: 'from', operator: 'contains', value: '@github.com' });
  });

  it('parses subject: condition', () => {
    const cond = parseCondition('subject:invoice');
    expect(cond).toEqual({ field: 'subject', operator: 'contains', value: 'invoice' });
  });

  it('parses to: condition', () => {
    const cond = parseCondition('to:team@company.com');
    expect(cond).toEqual({ field: 'to', operator: 'contains', value: 'team@company.com' });
  });

  it('parses has:attachment condition', () => {
    const cond = parseCondition('has:attachment');
    expect(cond).toEqual({ field: 'has_attachment', operator: 'equals', value: '1' });
  });

  it('returns null for invalid condition', () => {
    const cond = parseCondition('gibberish');
    expect(cond).toBeNull();
  });

  it('handles extra whitespace', () => {
    const cond = parseCondition('  from: @example.com ');
    expect(cond).toEqual({ field: 'from', operator: 'contains', value: '@example.com' });
  });
});

describe('matchRule', () => {
  const thread: ThreadForLabeling = {
    id: 't1',
    sender_email: 'bot@github.com',
    sender_name: 'GitHub',
    subject: 'PR merged: fix avatar blink',
    to_addresses: 'milan@company.com',
    has_attachment: 0,
    user_labels: '',
  };

  it('matches from: condition', () => {
    const rule: AutoLabelRule = {
      id: 'r1',
      label: 'Dev',
      conditions: [{ field: 'from', operator: 'contains', value: '@github.com' }],
      match_mode: 'all',
    };
    expect(matchRule(rule, thread)).toBe(true);
  });

  it('does not match from: when sender differs', () => {
    const rule: AutoLabelRule = {
      id: 'r2',
      label: 'Dev',
      conditions: [{ field: 'from', operator: 'contains', value: '@gitlab.com' }],
      match_mode: 'all',
    };
    expect(matchRule(rule, thread)).toBe(false);
  });

  it('matches subject: condition (case-insensitive)', () => {
    const rule: AutoLabelRule = {
      id: 'r3',
      label: 'PRs',
      conditions: [{ field: 'subject', operator: 'contains', value: 'pr merged' }],
      match_mode: 'all',
    };
    expect(matchRule(rule, thread)).toBe(true);
  });

  it('matches to: condition', () => {
    const rule: AutoLabelRule = {
      id: 'r4',
      label: 'Team',
      conditions: [{ field: 'to', operator: 'contains', value: 'milan@company.com' }],
      match_mode: 'all',
    };
    expect(matchRule(rule, thread)).toBe(true);
  });

  it('matches has:attachment condition', () => {
    const rule: AutoLabelRule = {
      id: 'r5',
      label: 'Files',
      conditions: [{ field: 'has_attachment', operator: 'equals', value: '1' }],
      match_mode: 'all',
    };
    const threadWithAttachment = { ...thread, has_attachment: 1 };
    expect(matchRule(rule, threadWithAttachment)).toBe(true);
    expect(matchRule(rule, thread)).toBe(false);
  });

  it('match_mode "all" requires all conditions to pass', () => {
    const rule: AutoLabelRule = {
      id: 'r6',
      label: 'Dev + Files',
      conditions: [
        { field: 'from', operator: 'contains', value: '@github.com' },
        { field: 'has_attachment', operator: 'equals', value: '1' },
      ],
      match_mode: 'all',
    };
    expect(matchRule(rule, thread)).toBe(false); // no attachment
  });

  it('match_mode "any" passes if at least one condition matches', () => {
    const rule: AutoLabelRule = {
      id: 'r7',
      label: 'Dev or Files',
      conditions: [
        { field: 'from', operator: 'contains', value: '@github.com' },
        { field: 'has_attachment', operator: 'equals', value: '1' },
      ],
      match_mode: 'any',
    };
    expect(matchRule(rule, thread)).toBe(true); // from matches
  });
});

describe('applyRules', () => {
  const rules: AutoLabelRule[] = [
    {
      id: 'r1',
      label: 'Dev',
      conditions: [{ field: 'from', operator: 'contains', value: '@github.com' }],
      match_mode: 'all',
    },
    {
      id: 'r2',
      label: 'Finance',
      conditions: [{ field: 'subject', operator: 'contains', value: 'invoice' }],
      match_mode: 'all',
    },
  ];

  it('returns labels for matching rules', () => {
    const thread: ThreadForLabeling = {
      id: 't1',
      sender_email: 'bot@github.com',
      sender_name: 'GitHub',
      subject: 'PR #42 merged',
      to_addresses: '',
      has_attachment: 0,
      user_labels: '',
    };
    const labels = applyRules(rules, thread);
    expect(labels).toEqual(['Dev']);
  });

  it('returns multiple labels if multiple rules match', () => {
    const thread: ThreadForLabeling = {
      id: 't2',
      sender_email: 'billing@github.com',
      sender_name: 'GitHub Billing',
      subject: 'Your invoice for June',
      to_addresses: '',
      has_attachment: 0,
      user_labels: '',
    };
    const labels = applyRules(rules, thread);
    expect(labels).toEqual(['Dev', 'Finance']);
  });

  it('returns empty array if no rules match', () => {
    const thread: ThreadForLabeling = {
      id: 't3',
      sender_email: 'friend@gmail.com',
      sender_name: 'Friend',
      subject: 'Lunch tomorrow?',
      to_addresses: '',
      has_attachment: 0,
      user_labels: '',
    };
    const labels = applyRules(rules, thread);
    expect(labels).toEqual([]);
  });

  it('does not duplicate labels already applied', () => {
    const thread: ThreadForLabeling = {
      id: 't4',
      sender_email: 'bot@github.com',
      sender_name: 'GitHub',
      subject: 'CI passed',
      to_addresses: '',
      has_attachment: 0,
      user_labels: 'Dev',
    };
    const labels = applyRules(rules, thread);
    expect(labels).toEqual([]); // Dev already applied, no new labels
  });
});
