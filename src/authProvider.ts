import type { Account } from './auth';

export interface AuthProvider {
  id: string;
  displayName: string;

  /** Start OAuth flow — returns the new account on success */
  startOAuth(): Promise<Account>;

  /** Refresh an expired access token */
  refreshToken(account: Account): Promise<Account>;

  /** Revoke tokens (sign out from provider) */
  revokeToken(account: Account): Promise<void>;

  /** Get the authorization scopes this provider needs */
  getScopes(): string[];
}
