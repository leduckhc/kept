export interface Snippet {
  id: string;
  title: string;
  body: string;
  usageCount: number;
}

const STORAGE_KEY = 'kept_snippets';

const DEFAULTS: Snippet[] = [
  { id: 'default-1', title: 'Thank you',      body: 'Thank you for your email. I appreciate you reaching out.',                     usageCount: 0 },
  { id: 'default-2', title: 'Following up',   body: 'Just following up on my previous email. Would love to hear your thoughts.',    usageCount: 0 },
  { id: 'default-3', title: 'Meeting confirm',body: 'Confirmed! Looking forward to our meeting.',                                   usageCount: 0 },
  { id: 'default-4', title: 'Out of office',  body: 'I am currently out of office and will respond when I return.',                 usageCount: 0 },
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
