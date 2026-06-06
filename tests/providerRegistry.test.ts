import { describe, it, expect, beforeEach } from 'vitest';
import { registerProvider, getProviderForAccount, resetRegistry } from '../src/providerRegistry';
import type { MailProvider } from '../src/provider';

describe('providerRegistry', () => {
  beforeEach(() => resetRegistry());

  it('registers and retrieves a provider by account.provider field', () => {
    const mockProvider = { id: 'gmail', displayName: 'Gmail' } as MailProvider;
    registerProvider('gmail', mockProvider);
    const result = getProviderForAccount({ provider: 'gmail' } as any);
    expect(result.id).toBe('gmail');
  });

  it('throws when provider not registered', () => {
    expect(() => getProviderForAccount({ provider: 'outlook' } as any))
      .toThrow(/no provider registered/i);
  });

  it('defaults to gmail when account has no provider field', () => {
    const mockProvider = { id: 'gmail', displayName: 'Gmail' } as MailProvider;
    registerProvider('gmail', mockProvider);
    const result = getProviderForAccount({} as any);
    expect(result.id).toBe('gmail');
  });

  it('can register multiple providers', () => {
    const gmail = { id: 'gmail', displayName: 'Gmail' } as MailProvider;
    const outlook = { id: 'outlook', displayName: 'Outlook' } as MailProvider;
    registerProvider('gmail', gmail);
    registerProvider('outlook', outlook);
    expect(getProviderForAccount({ provider: 'gmail' } as any).id).toBe('gmail');
    expect(getProviderForAccount({ provider: 'outlook' } as any).id).toBe('outlook');
  });
});
