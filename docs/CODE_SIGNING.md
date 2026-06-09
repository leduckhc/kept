# Code Signing & CI Setup

## Prerequisites

- macOS computer (for certificate creation)
- Apple ID
- `gh` CLI installed and authenticated

---

## Apple Developer Program

1. Go to <https://developer.apple.com/programs/>
2. Click "Enroll", sign in with your Apple ID
3. Pay $99 USD/year — activation takes 0–48h (usually same day)

**Required.** No alternative for signed/notarized macOS distribution.

---

## Create "Developer ID Application" Certificate

1. Go to <https://developer.apple.com/account/resources/certificates/list>
2. Click `+` → select **"Developer ID Application"**
3. Generate a CSR (Certificate Signing Request):
   - Open **Keychain Access** on your Mac
   - Menu: `Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority`
   - Enter your email, leave CA Email blank, select "Saved to disk"
   - Saves a `.certSigningRequest` file
4. Upload the CSR to Apple's portal
5. Download the `.cer` file → double-click to install in Keychain

---

## Export as .p12

1. Open **Keychain Access**
2. Under "My Certificates", find `Developer ID Application: Your Name (TEAMID)`
3. Right-click → **Export**
4. Save as `.p12`, set a password (this becomes `APPLE_CERTIFICATE_PASSWORD`)

---

## Gather All Values

```bash
# APPLE_CERTIFICATE — base64-encoded .p12 file
base64 -i ~/Desktop/Certificates.p12 | pbcopy

# APPLE_CERTIFICATE_PASSWORD — the password you set during .p12 export

# APPLE_SIGNING_IDENTITY — find it with:
security find-identity -v -p codesigning
# Output: "Developer ID Application: Milan Le (ABC1234567)"
# Use the full quoted string as the value

# APPLE_TEAM_ID — the 10-char code in parentheses (e.g. ABC1234567)
# Also at https://developer.apple.com/account → Membership Details

# APPLE_ID — your Apple ID email address

# APPLE_PASSWORD — app-specific password (NOT your Apple ID password)
```

---

## Create App-Specific Password

1. Go to <https://account.apple.com/account/manage>
2. Sign in → "App-Specific Passwords" → "Generate"
3. Name it "Kept CI"
4. Copy the generated password — this is `APPLE_PASSWORD`

---

## Add Secrets to GitHub

```bash
cd ~/kept

# Base64 the .p12 and set directly
gh secret set APPLE_CERTIFICATE < <(base64 -i ~/Desktop/Certificates.p12)

# These prompt interactively for the value
gh secret set APPLE_CERTIFICATE_PASSWORD
gh secret set APPLE_SIGNING_IDENTITY
gh secret set APPLE_ID
gh secret set APPLE_PASSWORD
gh secret set APPLE_TEAM_ID
```

---

## Verification

After secrets are set, push to `main` or create a tag:

```bash
# Trigger a build
git tag v0.1.0
git push --tags
```

The workflow will:
- Build for macOS (arm64 + x64), Linux, Windows
- Sign and notarize the macOS `.dmg`
- Create a draft GitHub Release with all artifacts attached

Check the Actions tab: <https://github.com/leduckhc/kept/actions>

---

## Quick Reference

| Secret | Source |
|--------|--------|
| `APPLE_CERTIFICATE` | `base64 -i Certificates.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password set during .p12 export |
| `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password from account.apple.com |
| `APPLE_TEAM_ID` | 10-char team ID from developer portal |

---

## Windows Signing (future)

Not yet configured. Options:
- EV code signing certificate ($200–400/year from DigiCert, Sectigo, etc.)
- Azure Trusted Signing (newer, cheaper, requires Azure account)

Add `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD` secrets when ready.
