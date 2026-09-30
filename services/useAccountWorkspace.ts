import { useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { emptyWorkspace, preserveLegacyStorage } from './workspaceData';
import type { WorkspaceData } from './workspaceData';
import { WorkspaceSync } from './workspaceSync';
import type { SyncView } from './workspaceSync';
import { saveToCloud, subscribeToCloud } from './cloudService';

export function useAccountWorkspace(uid: string | null) {
  const [view, setView] = useState<SyncView>({ data: emptyWorkspace(), status: 'loading', editable: false, message: '' });
  const session = useRef<WorkspaceSync | null>(null);
  useEffect(() => {
    try { preserveLegacyStorage(localStorage); } catch { /* Preserve original keys even when backup storage is unavailable. */ }
    const sync = new WorkspaceSync(uid, localStorage, { watch: subscribeToCloud, save: saveToCloud }, setView);
    session.current = sync;
    sync.start();
    return () => { sync.stop(); session.current = null; };
  }, [uid]);
  const setField = <K extends keyof WorkspaceData>(key: K) => (action: SetStateAction<WorkspaceData[K]>) => {
    session.current?.update(data => ({ ...data, [key]: typeof action === 'function' ? (action as (value: WorkspaceData[K]) => WorkspaceData[K])(data[key]) : action }));
  };
  return { ...view, setField,
    updateData: (action: (data: WorkspaceData) => WorkspaceData) => session.current?.update(action),
    replaceData: (data: WorkspaceData) => { if (!session.current?.view.editable || !session.current.archive()) return false; session.current.update(() => data); return true; },
    retry: () => session.current?.reloadFromCloud(false),
    loadCloud: () => session.current?.reloadFromCloud(true) };
}
