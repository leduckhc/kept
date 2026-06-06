import { getProviderForAccount } from './providerRegistry';
import type { Account } from './auth';

/** Get the mail provider for an account. Shorthand for consumer use. */
export function providerFor(account: Account) {
  return getProviderForAccount(account);
}
