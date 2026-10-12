import React, { createContext, useContext, useState } from 'react';
import type { Address } from 'viem';
import { config } from './config';
import { demoAccount } from '../demo/fixtures';
type Session = {
  account: Address | null;
  isDemo: boolean;
  connect: (account: Address, isDemo?: boolean) => void;
  disconnect: () => void;
};
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Address | null>(config.useMocks ? demoAccount : null);
  const [isDemo, setIsDemo] = useState(config.useMocks);
  return (
    <SessionContext.Provider
      value={{
        account,
        isDemo,
        connect: (next, demo = false) => {
          setAccount(next);
          setIsDemo(demo);
        },
        disconnect: () => {
          setAccount(null);
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Session provider missing.');
  return session;
}
