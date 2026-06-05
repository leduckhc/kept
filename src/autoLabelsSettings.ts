// autoLabelsSettings.ts — Settings UI for Auto Label rules (KPT-085)
import { loadAutoLabelRules, saveAutoLabelRule, deleteAutoLabelRule, parseCondition, type AutoLabelRule, type Condition } from './autoLabels';
import { state } from './state';
import { esc } from './helpers';

/** Render rules list in Settings and wire the "Add rule" button. */
export function initAutoLabelsSettings() {
  const addBtn = document.getElementById('settings-add-auto-label');
  addBtn?.addEventListener('click', () => showAddRuleDialog());

  // Render existing rules whenever settings panel opens
  const observer = new MutationObserver(() => {
    const panel = document.getElementById('settings-panel');
    if (panel?.classList.contains('open')) renderRulesList();
  });
  const panel = document.getElementById('settings-panel');
  if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
}

async function renderRulesList() {
  const list = document.getElementById('settings-auto-labels-list');
  if (!list || !state.account) return;

  const rules = await loadAutoLabelRules(state.account.id);
  if (rules.length === 0) {
    list.innerHTML = '<div class="settings-section-sub" style="opacity:0.5">No rules yet</div>';
    return;
  }

  list.innerHTML = rules.map(r => {
    const condStr = r.conditions.map(c => {
      if (c.field === 'has_attachment') return 'has:attachment';
      return `${c.field}:${c.value}`;
    }).join(r.match_mode === 'any' ? ' OR ' : ' AND ');
    return `
      <div class="auto-label-rule-row" data-rule-id="${esc(r.id)}">
        <span class="auto-label-rule-label">${esc(r.label)}</span>
        <span class="auto-label-rule-cond">${esc(condStr)}</span>
        <button class="auto-label-rule-delete" data-rule-id="${esc(r.id)}" title="Delete rule">×</button>
      </div>`;
  }).join('');

  // Wire delete buttons
  list.querySelectorAll<HTMLButtonElement>('.auto-label-rule-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ruleId = btn.dataset.ruleId!;
      await deleteAutoLabelRule(ruleId);
      renderRulesList();
    });
  });
}

function showAddRuleDialog() {
  if (!state.account) return;

  // Simple prompt-based dialog (lightweight, no heavy modal)
  const conditionRaw = prompt(
    'Enter condition(s) separated by commas:\n\nExamples:\n  from:@github.com\n  subject:invoice\n  has:attachment\n  from:@company.com, subject:report'
  );
  if (!conditionRaw) return;

  const label = prompt('Label to apply when rule matches:');
  if (!label) return;

  const parts = conditionRaw.split(',').map(s => s.trim()).filter(Boolean);
  const conditions: Condition[] = [];
  for (const part of parts) {
    const parsed = parseCondition(part);
    if (!parsed) {
      alert(`Invalid condition: "${part}"\n\nUse from:, subject:, to:, or has:attachment`);
      return;
    }
    conditions.push(parsed);
  }

  const matchMode = parts.length > 1
    ? (confirm('Match ALL conditions (OK) or ANY condition (Cancel)?') ? 'all' : 'any')
    : 'all';

  const rule: AutoLabelRule = {
    id: crypto.randomUUID(),
    label: label.trim(),
    conditions,
    match_mode: matchMode as 'all' | 'any',
  };

  saveAutoLabelRule(state.account.id, rule).then(() => renderRulesList());
}
