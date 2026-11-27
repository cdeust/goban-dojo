import { describe, expect, it, vi } from 'vitest';
import { AccountPersistence, type ProgressBackend } from '../src/state/accountPersistence.ts';

describe('session de progression', () => {
  it('ne conserve rien dans une nouvelle session visiteur', () => {
    const guest = AccountPersistence.visitor();
    expect(guest.write('school', 'one')).toBe(true);
    expect(guest.read('school')).toBe('one');
    expect(guest.status).toBe('visitor');
    expect(AccountPersistence.visitor().read('school')).toBeNull();
  });
  it('charge une progression distante et sérialise les modifications', async () => {
    const write = vi
      .fn<ProgressBackend['write']>()
      .mockImplementation(async (_space, _value, revision) => revision + 1);
    const account = await AccountPersistence.connected({
      read: async () => [{ space: 'school', value: 'old', revision: 3 }],
      write,
    });
    expect(account.read('school')).toBe('old');
    account.write('school', 'new');
    await account.flush();
    expect(write).toHaveBeenCalledWith('school', 'new', 3);
    expect(account.status).toBe('ready');
    account.write('school', 'next');
    await account.flush();
    expect(write).toHaveBeenCalledWith('school', 'next', 4);
    expect(await account.close()).toBe(true);
    expect(account.read('school')).toBeNull();
    expect(account.write('school', 'late')).toBe(false);
  });
  it('ne présente pas un échec comme sauvegardé et n’efface pas les modifications en attente', async () => {
    const account = await AccountPersistence.connected({
      read: async () => [],
      write: async () => {
        throw new Error('indisponible');
      },
    });
    account.write('practice', 'pending');
    await account.flush();
    expect(account.status).toBe('error');
    expect(account.read('practice')).toBe('pending');
    expect(await account.close()).toBe(false);
  });
});

it('préserve une nouvelle modification produite pendant une sauvegarde', async () => {
  let resolve!: (revision: number) => void;
  const first = new Promise<number>((done) => {
    resolve = done;
  });
  const write = vi
    .fn<ProgressBackend['write']>()
    .mockReturnValueOnce(first)
    .mockImplementation(async (_space, _value, revision) => revision + 1);
  const account = await AccountPersistence.connected({ read: async () => [], write });
  account.write('school', 'first');
  await Promise.resolve();
  account.write('school', 'second');
  resolve(1);
  await account.flush();
  expect(write.mock.calls).toEqual([
    ['school', 'first', 0],
    ['school', 'second', 1],
  ]);
  expect(account.read('school')).toBe('second');
});

it('ignore une réponse tardive après fermeture du compte, sans contaminer une nouvelle session', async () => {
  let resolve!: (revision: number) => void;
  const response = new Promise<number>((done) => {
    resolve = done;
  });
  const old = await AccountPersistence.connected({
    read: async () => [],
    write: async () => response,
  });
  old.write('school', 'compte-a');
  await Promise.resolve();
  old.discard();
  const other = await AccountPersistence.connected({
    read: async () => [{ space: 'school', value: 'compte-b', revision: 1 }],
    write: async (_space, _value, revision) => revision + 1,
  });
  resolve(1);
  await Promise.resolve();
  await Promise.resolve();
  expect(old.read('school')).toBeNull();
  expect(other.read('school')).toBe('compte-b');
});
