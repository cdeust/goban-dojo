import { AccountPersistence } from './accountPersistence.ts';

// One active data scope for the lifetime of the application. The account gate initializes it
// before mounting the dojo. Switching account reloads the application and clears this memory.
let active = AccountPersistence.visitor();
export function progressSession(): AccountPersistence {
  return active;
}
export function setProgressSession(session: AccountPersistence): void {
  active = session;
}
