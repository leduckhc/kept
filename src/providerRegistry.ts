import type { MailProvider } from './provider';

const _providers: Map<string, MailProvider> = new Map();

export function registerProvider(id: string, provider: MailProvider): void {
  _providers.set(id, provider);
}

export function getProviderForAccount(account: { provider?: string }): MailProvider {
  const providerId = account.provider ?? 'gmail';
  const provider = _providers.get(providerId);
  if (!provider) throw new Error(`No provider registered for "${providerId}"`);
  return provider;
}

export function resetRegistry(): void {
  _providers.clear();
}

export function getRegisteredProviders(): MailProvider[] {
  return Array.from(_providers.values());
}
