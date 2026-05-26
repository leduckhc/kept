import { brandTokens, renderPipMark } from '/packages/ui/src/index.js';
import { sampleThreads } from '/packages/mail-core/src/index.js';
import { createInMemorySearchIndex } from '/packages/search-core/src/index.js';
import { createPromptAudit, disabledProvider } from '/packages/ai-core/src/index.js';

const index = createInMemorySearchIndex();
sampleThreads.forEach((thread) => index.addThread(thread));
const results = index.search('invoice next week');
const audit = createPromptAudit({
  provider: 'Ollama',
  purpose: 'Summarize selected local thread',
  contentDescription: 'Subject, sender, and selected body excerpts only after user approval',
});

const root = document.querySelector('#root');
root.innerHTML = `
  <section class="shell">
    <nav class="topbar">
      <div class="brand">${renderPipMark()}<span>Kept</span></div>
      <span class="pill">Local-first mail</span>
    </nav>
    <section class="hero">
      <div>
        <p class="eyebrow">Email, kept local.</p>
        <h1>Search your inbox privately. Bring your own AI when you want it.</h1>
        <p class="lede">Kept indexes mail on this device, keeps AI off by default, and shows exactly what would be sent before any provider sees content.</p>
        <div class="actions"><button>Connect Gmail</button><button class="secondary">Try seeded demo</button></div>
      </div>
      <aside class="privacy-card">
        <h2>Privacy status</h2>
        <ul>
          <li>SQLite cache: encrypted at rest</li>
          <li>Search: offline FTS index</li>
          <li>AI: ${disabledProvider.status}</li>
          <li>Prompt audit: ${audit.contentDescription}</li>
        </ul>
      </aside>
    </section>
    <section class="results">
      <h2>Demo search: “invoice next week”</h2>
      ${results.map((r) => `<article><strong>${r.subject}</strong><span>${r.sender}</span><p>${r.snippet}</p></article>`).join('')}
    </section>
  </section>
`;
document.documentElement.style.setProperty('--accent', brandTokens.color.accent);
