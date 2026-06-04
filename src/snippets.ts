export interface Snippet {
  id: string;
  title: string;
  body: string;
  usageCount: number;
}

/** Context passed to variable resolution — typically from current thread + account */
export interface SnippetContext {
  senderName?: string;
  senderEmail?: string;
  myEmail?: string;
  myName?: string;
  subject?: string;
}

const VARIABLE_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/** All supported auto-resolve variable names */
export const BUILTIN_VARIABLES = [
  'first_name',    // sender's first name (derived from sender_name)
  'sender_name',   // full sender display name
  'sender_email',  // sender email address
  'my_email',      // current user's email
  'my_name',       // current user's display name (from email prefix)
  'subject',       // thread subject line
  'date',          // today's date (e.g. "June 4, 2026")
  'day',           // day of week (e.g. "Thursday")
] as const;

/** Extract all {{variable}} names from a snippet body */
export function extractVariables(body: string): string[] {
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_RE.source, 'g');
  while ((m = re.exec(body)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

/** Resolve variables in snippet body. Returns { resolved, unresolved } */
export function resolveVariables(
  body: string,
  context: SnippetContext
): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];

  const autoValues: Record<string, string | undefined> = {
    sender_name: context.senderName,
    sender_email: context.senderEmail,
    first_name: context.senderName?.split(/\s+/)[0],
    my_email: context.myEmail,
    my_name: context.myName || context.myEmail?.split('@')[0],
    subject: context.subject,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
  };

  const text = body.replace(VARIABLE_RE, (match, varName: string) => {
    const val = autoValues[varName];
    if (val) return val;
    if (!unresolved.includes(varName)) unresolved.push(varName);
    return match; // leave placeholder for manual fill
  });

  return { text, unresolved };
}

/** Replace specific variable placeholders with provided values */
export function fillVariables(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE_RE, (match, varName: string) => {
    return values[varName] ?? match;
  });
}

const STORAGE_KEY = 'kept_snippets';

const DEFAULTS: Snippet[] = [
  { id: 'default-1', title: 'Thank you',      body: 'Thank you for your email, {{first_name}}. I appreciate you reaching out.',    usageCount: 0 },
  { id: 'default-2', title: 'Following up',   body: 'Hi {{first_name}}, just following up on my previous email. Would love to hear your thoughts.', usageCount: 0 },
  { id: 'default-3', title: 'Meeting confirm',body: 'Confirmed! Looking forward to our meeting on {{day}}.',                       usageCount: 0 },
  { id: 'default-4', title: 'Out of office',  body: 'I am currently out of office and will respond when I return on {{date}}.',    usageCount: 0 },
  { id: 'default-5', title: 'Intro',          body: 'Hi {{first_name}},\n\nMy name is {{my_name}}. Thanks for connecting!',        usageCount: 0 },
  { id: 'default-6', title: 'Invoice',        body: 'Hi {{first_name}},\n\nPlease find attached invoice #{{invoice_number}} for {{amount}}.\n\nDue date: {{due_date}}\nPayment methods: bank transfer or card via the link in the PDF.\n\nLet me know if you have any questions.\n\nBest,\n{{my_name}}', usageCount: 0 },
  { id: 'default-7', title: 'Faktura {{month}} {{year}}', body: 'Dobrý den,\n\nPosílám fakturu za období {{month}} {{year}}.\n\nS pozdravem,\n{{my_name}}', usageCount: 0 },
];

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
      return DEFAULTS;
    }
    return JSON.parse(raw) as Snippet[];
  } catch {
    return DEFAULTS;
  }
}

function persist(snippets: Snippet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

export function saveSnippet(title: string, body: string): void {
  const snippets = loadSnippets();
  snippets.push({ id: `snip-${Date.now()}`, title, body, usageCount: 0 });
  persist(snippets);
}

export function deleteSnippet(id: string): void {
  persist(loadSnippets().filter(s => s.id !== id));
}

export function updateSnippet(id: string, title: string, body: string): void {
  const snippets = loadSnippets();
  const s = snippets.find(s => s.id === id);
  if (s) { s.title = title; s.body = body; }
  persist(snippets);
}

export function bumpUsage(id: string): void {
  const snippets = loadSnippets();
  const s = snippets.find(s => s.id === id);
  if (s) { s.usageCount++; }
  persist(snippets);
}
