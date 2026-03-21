import { createContext, useContext, ReactNode } from 'react';
import { useUpdater, UpdaterState } from '../hooks/useUpdater';

interface UpdaterContextValue {
  state: UpdaterState;
  checkForUpdates: (silent?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismiss: () => void;
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
}

export function useUpdaterContext() {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error('useUpdaterContext must be used inside UpdaterProvider');
  return ctx;
}
