# Kept — Developer Documentation

## Building & Testing iOS on Your Own Device (Free)

You can build and run Kept on your physical iPhone/iPad without paying the $99/yr Apple Developer fee. This uses Xcode's **Personal Team** (free Apple ID) signing.

### Limitations (Free Tier)

- App expires every **7 days** — re-deploy via USB to keep using it
- Max **3 app IDs** active per 7-day window
- No push notifications
- No iCloud/CloudKit (Kept uses local SQLite, so this is fine)
- No TestFlight or App Store distribution
- Keyring plugin is disabled on iOS — OAuth tokens live in SQLite only

### Prerequisites

- macOS with Xcode installed (latest stable)
- Rust via rustup
- pnpm
- iPhone/iPad connected via USB

### One-Time Setup

```bash
# 1. Add iOS Rust targets
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# 2. Initialize the iOS project (generates Xcode project)
cd ~/kept
pnpm tauri ios init
```

This creates `src-tauri/gen/apple/` with `Kept.xcodeproj`.

### Configure Signing in Xcode

1. Open the generated project:
   ```bash
   open src-tauri/gen/apple/Kept.xcodeproj
   ```
2. Select the project root in the sidebar
3. Under **Signing & Capabilities**:
   - Team → select your **Personal Team** (your Apple ID)
   - Bundle Identifier should be `com.kept.app`
4. Xcode auto-generates a provisioning profile — no manual cert management needed

### Build & Run

```bash
# Development mode with hot-reload (phone connected via USB)
pnpm tauri ios dev --device

# Or build a release .ipa
pnpm tauri ios build
```

### First Launch on Device

The first time you run a Personal Team–signed app on your iPhone:

1. The build will succeed but the app won't launch
2. On your iPhone: **Settings → General → VPN & Device Management**
3. Find your Apple ID under "Developer App" and tap **Trust**
4. Now launch the app again — it works

### Re-Deploying After Expiry

After 7 days the app stops launching. Just run again:

```bash
pnpm tauri ios dev --device
```

No re-configuration needed — signing profile is still valid, just the on-device binary expires.

### Simulator Testing

```bash
# Run on iOS Simulator (no signing needed)
pnpm tauri ios dev
```

Useful for UI iteration without needing your phone connected.

### iOS-Specific Code Architecture

The codebase uses `#[cfg(desktop)]` / `#[cfg(mobile)]` guards to handle platform differences:

- **Tray icon & app menu** — desktop only, wrapped in `#[cfg(desktop)]`
- **Keyring plugin** — desktop only (no iOS crate), tokens fall back to SQLite
- **tauri-plugin-pilot** — debug tool, desktop only
- **Frontend `keychain.ts`** — dynamically imports keyring, returns null when unavailable

These guards live in `src-tauri/src/lib.rs` and `src-tauri/Cargo.toml` (target-conditional deps).

### Troubleshooting

| Issue | Fix |
|-------|-----|
| "Untrusted Developer" on launch | Settings → General → VPN & Device Management → Trust |
| "No signing identity found" | Open .xcodeproj, set Team to Personal Team |
| App crashes immediately | Check Xcode console — likely a missing plugin or entitlement |
| "Device is busy: Preparing..." | Wait for Xcode to finish installing dev support files |
| Build fails with missing target | Run `rustup target add aarch64-apple-ios` |
