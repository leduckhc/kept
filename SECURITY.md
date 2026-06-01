# Supply Chain Security — Kept

Hardening practices for npm/pnpm dependency management.
Based on [npm-security-best-practices](https://github.com/lirantal/npm-security-best-practices) and [Better Stack video](https://youtu.be/Wq6yMdt11LM).

---

## Principles

1. **Never trust fresh packages** — enforce a minimum release age cooldown
2. **Never auto-execute install scripts** — allow only explicitly reviewed packages
3. **Block exotic subdeps** — no git/tarball URLs in transitive dependencies
4. **Frozen lockfile in CI** — deterministic, auditable installs
5. **Validate lockfile integrity** — prevent lockfile injection attacks
6. **Minimize dependency surface** — prefer native APIs over packages
7. **Audit continuously** — scan for CVEs and suspicious behavior

---

## Configuration

### `.npmrc` (project-level)

```ini
# Prevent accidental npm usage (we use pnpm)
engine-strict=true

# Block install scripts globally
ignore-scripts=true

# Minimum age before a version can be installed (days)
min-release-age=3
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - '.'

# Supply chain hardening (pnpm 10+)
onlyBuiltDependencies:
  - esbuild
  - '@tauri-apps/cli'

# Block git/tarball transitive deps
blockExoticSubdeps: true

# Fail on unreviewed build scripts
strictDepBuilds: true

# 3-day cooldown (in minutes)
minimumReleaseAge: 4320

# Trust policy — reject downgrades in attestation level
trustPolicy: no-downgrade
```

### CI (`pnpm install --frozen-lockfile`)

Always use frozen lockfile in CI/CD. Never allow lockfile rewrites in automated pipelines.

---

## Allowlisted Build Scripts

Only these packages are permitted to run install/build scripts:

| Package | Reason |
|---------|--------|
| `esbuild` | Native binary — requires postinstall to fetch platform binary |
| `@tauri-apps/cli` | Native toolchain — requires postinstall |

All others are blocked by `strictDepBuilds: true`. To add a new allowlisted package:
1. Verify the package needs install scripts (check `scripts` in its package.json)
2. Review the script content manually
3. Add to `onlyBuiltDependencies` in `pnpm-workspace.yaml`
4. Document the reason in this table

---

## Practices

### Adding Dependencies

Before adding any new package:
1. Check Snyk DB: `https://security.snyk.io/package/npm/<package>`
2. Check Socket: look for install scripts, network access, obfuscated code
3. Prefer packages with **provenance attestations** and **trusted publishing**
4. Check maintenance signals: recent commits, multiple maintainers, no open CVEs
5. Consider native alternatives first (fetch over axios, structuredClone over lodash.clonedeep)

### Lockfile Hygiene

- `pnpm-lock.yaml` is always committed
- Never run `pnpm update` without reviewing changes interactively
- In CI: `pnpm install --frozen-lockfile` (fails if lockfile is stale)
- pnpm lockfiles are resistant to injection by design (content-addressable)

### Secret Management

- No plaintext secrets in `.env` files committed to git
- `.env` is in `.gitignore`
- Use environment variables injected at runtime for Tauri signing keys

### Dependency Updates

- Use Dependabot or Renovate with cooldown configured
- Review changelogs before merging update PRs
- Never blind-upgrade: `pnpm update --interactive`

---

## Audit Commands

```bash
# Check for known vulnerabilities
pnpm audit

# Verify lockfile integrity (if lockfile-lint installed)
npx lockfile-lint --path pnpm-lock.yaml --type yarn --allowed-hosts npm yarn --validate-https

# List packages with install scripts
pnpm ls --depth Infinity 2>/dev/null | head -50

# Check what would run on install
pnpm install --ignore-scripts --frozen-lockfile && pnpm rebuild --dry-run
```

---

## Incident Response

If a dependency is compromised:
1. Pin to last known good version immediately
2. Run `pnpm audit` to confirm advisory
3. Check if install scripts ran: review `node_modules/.pnpm/*/node_modules/<pkg>/package.json` for scripts
4. If scripts ran: treat as potential breach, rotate secrets
5. File a GitHub advisory if not already reported

---

## References

- [npm-security-best-practices](https://github.com/lirantal/npm-security-best-practices) — Liran Tal
- [Better Stack: npm installs will hack you](https://youtu.be/Wq6yMdt11LM)
- [pnpm Supply Chain Security](https://pnpm.io/supply-chain-security)
- [Socket.dev](https://socket.dev/) — real-time malware detection
- [npq](https://github.com/nicedoc/npq) — package quality/security auditor
