import { createContext, useContext, type ReactNode } from 'react';

/** Account controls are embedded in the page; never cover the goban or playback controls. */
export const AccountControlsContext = createContext<ReactNode>(null);
export function AccountControls() {
  return <>{useContext(AccountControlsContext)}</>;
}
