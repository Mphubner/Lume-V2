import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { queryClient } from '../services/queryClient';
import api from '../services/api';
const WorkspaceContext = createContext(null);
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [selection, setSelection] = useState({ userId: null, id: 'all' });
  const [catalog, setCatalog] = useState({ userId: null, items: [] });
  const [error, setError] = useState(null);
  const currentWorkspace = selection.userId === user?.id ? selection.id : 'all';
  const workspaces = catalog.userId === user?.id ? catalog.items : [];
  const refreshWorkspaces = useCallback(async () => {
    if (!user) return;
    try { const items = await api.request('/workspaces'); setCatalog({ userId: user.id, items }); setError(null); }
    catch (e) { setError(e); }
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api.request('/workspaces').then(items => { if (active) setCatalog({ userId: user.id, items }); }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, [user]);
  const setCurrentWorkspace = (id) => {
    if (id !== 'all' && !workspaces.some(w => w.id === id)) return;
    api.workspace = id;
    queryClient.clear();
    setSelection({ userId: user?.id, id });
  };
  const selected = workspaces.find(w => w.id === currentWorkspace);
  const isAccountInWorkspace = account => currentWorkspace === 'all' || account.workspace_id === currentWorkspace;
  return <WorkspaceContext.Provider value={{ currentWorkspace, setCurrentWorkspace, workspaces, refreshWorkspaces, error, isAccountInWorkspace, workspaceLabel: selected?.name || 'Consolidado autorizado' }}>{children}</WorkspaceContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
