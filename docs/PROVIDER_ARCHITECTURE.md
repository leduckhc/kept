# Provider Architecture

## Overview

Mail and auth operations use a provider abstraction for testability and multi-provider support.

## Key Files

| File | Role |
|------|------|
| `src/store.ts` | Local SQLite query layer (provider-agnostic) |
| `src/provider.ts` | `MailProvider` interface |
| `src/providerRegistry.ts` | DI container for mail providers |
| `src/providers/gmail.ts` | Gmail `MailProvider` implementation |
| `src/authProvider.ts` | `AuthProvider` interface |
| `src/authProviderRegistry.ts` | DI container for auth providers |
| `src/authProviders/google.ts` | Google OAuth `AuthProvider` implementation |
| `src/providerFor.ts` | Convenience helper — resolves provider for an account |
| `src/gmail.ts` | Gmail API transport (legacy, being phased out) |

## Data Flow

```
UI → providerFor(account) → MailProvider method → Gmail API
                          ↘ store.ts → SQLite (local cache)
```

## Adding a New Provider

1. Implement `MailProvider` (see `src/providers/gmail.ts`)
2. Implement `AuthProvider` (see `src/authProviders/google.ts`)
3. Register both in their respective registries
