# KPT-004: Kept brand, Pip mascot, and first-run privacy UX

## Source evidence used

Kept is a Tauri local-first email client. The product promise is:

> Your mail is indexed locally. Bring your own AI key. We never read your inbox.

Design constraints from the product/privacy notes:

- Mail content is stored on the user's device.
- Search runs locally and should work offline after indexing.
- AI is disabled until the user connects a provider.
- No Kept application server receives message bodies by default.
- Logs must never include message bodies, OAuth tokens, API keys, or full prompts containing private mail.
- Before any mail content goes to an AI provider, the UI must show provider name, content sent, why it is needed, and prompt-audit behavior.
- The MVP proof points are real connector data, search latency, local DB path, and network boundary.

## Design-shotgun result

The gstack design-shotgun binary was attempted first and saved its brief/log under the local gstack design directory. The visual generation step could not run because this profile has no OpenAI key configured, so I used the skill's documented fallback: hand-built divergent HTML mockups plus a comparison board.

Local gstack artifact directory:
`~/.gstack/projects/leduckhc-kept/designs/kpt-004-brand-privacy-*`

Repo artifact:
`docs/brand/kpt-004-brand-privacy-mockups.html`

## Direction A: Ledger Calm

Posture: calm, editorial, trustworthy desktop software.

Brand system:

- Colors: warm paper, off-black ink, brass, olive, quiet borders.
- Type: serif headline with precise sans body.
- Shape: round seal, ledger cards, low-contrast dividers.
- Icon style: fine-line, stamped, sparing.
- Pip: a keeper's seal, used at trust moments only.

UX answer in 10 seconds:

- What it does: “Email memory that stays on your desk.”
- Privacy: “Your mail is indexed locally. Bring your own AI key. We never read your inbox.”
- Trust: local index, AI off by default, prompt audit.

Best for: mainstream paid beta, privacy-first credibility, non-technical users.

Risk: can feel quiet if the product needs sharper power-user energy.

## Direction B: Night Watch

Posture: premium dark command center for power users.

Brand system:

- Colors: charcoal/navy, glacier blue, amber status lights.
- Type: technical sans with mono accents.
- Shape: shield-eye mark, terminal surfaces, status chips.
- Icon style: geometric, high-contrast, system-like.
- Pip: a sentinel/shield, not a character.

UX answer in 10 seconds:

- What it does: “Your inbox, indexed under lock.”
- Privacy: “Local search first. BYO AI only when you allow it. Kept never receives message bodies.”
- Trust: provider status, network boundary, local match provenance.

Best for: developer-native/power-user launch, premium dark product feel.

Risk: can feel narrower and less welcoming for a broader email-client audience.

## Denisa recommendation for Milan to approve

I recommend Direction A, Ledger Calm, for v1 because it makes the privacy promise legible fastest and lets Pip become a mature trust mark instead of a mascot. Direction B is stronger if Bob wants Kept positioned as a power-user command center first.

Milan should choose the final brand direction before Bob reviews implementation fit.

## First-run privacy explainer structure

1. Connect account: name scopes in product language.
2. Build local index: show local DB path and progress.
3. Optional AI: keep off by default. If enabled, show provider, exact content, reason, and audit behavior before sending.

Primary copy:

- “Your mail is indexed locally.”
- “Bring your own AI key.”
- “We never read your inbox.”

## Empty/search/indexing states

- Empty: “Connect Gmail to build your private local index.”
- Indexing: progress by fetched, stored, indexed, redacted. Include local DB path.
- Search results: show source account, local/BYO-AI status, and whether a prompt was created.
- No results: “No local matches yet. Try a sender, date, or phrase from the thread.”

## Privacy/security notes

This PR adds design documentation and static mockup artifacts only. It does not touch mail content, OAuth, local DB code, logs, or AI prompts. The mockup intentionally avoids real email content and uses non-sensitive sample labels.
