import type { AuthProvider } from '../authProvider';
import type { Account } from '../auth';
import { startOAuth, ensureFreshToken, removeAccount } from '../auth';

export class GoogleAuthProvider implements AuthProvider {
  id = 'gmail' as const;
  displayName = 'Google';

  async startOAuth(): Promise<Account> {
    return startOAuth();
  }

  async refreshToken(account: Account): Promise<Account> {
    return ensureFreshToken(account);
  }

  async revokeToken(account: Account): Promise<void> {
    await removeAccount(account);
  }

  getScopes(): string[] {
    return [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/contacts.other.readonly',
    ];
  }
}
