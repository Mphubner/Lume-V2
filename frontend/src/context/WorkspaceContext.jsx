import { createContext, useContext, useState, useEffect } from 'react';

const WorkspaceContext = createContext(null);

export const WORKSPACES = {
  ALL: 'all',
  PERSONAL: 'personal',
  BUSINESS: 'business',
  FAMILY: 'family'
};

export const WORKSPACE_LABELS = {
  [WORKSPACES.ALL]: 'Todas as Contas',
  [WORKSPACES.PERSONAL]: 'Pessoal',
  [WORKSPACES.BUSINESS]: 'Empresarial',
  [WORKSPACES.FAMILY]: 'Familiar'
};

export function WorkspaceProvider({ children }) {
  // Start with consolidated view
  const [currentWorkspace, setCurrentWorkspace] = useState(() => {
    const saved = localStorage.getItem('lume_workspace');
    return saved || WORKSPACES.ALL;
  });

  useEffect(() => {
    localStorage.setItem('lume_workspace', currentWorkspace);
  }, [currentWorkspace]);

  // Helper function to check if a specific account belongs to the current workspace
  const isAccountInWorkspace = (account) => {
    if (currentWorkspace === WORKSPACES.ALL) return true;
    
    // If family is selected, only show accounts that have family_id linked
    if (currentWorkspace === WORKSPACES.FAMILY) {
      return account.family_id !== null;
    }
    
    // If personal/business is selected, require family_id to be null (exclude shared)
    // AND match the specific account_type.
    return account.family_id === null && account.account_type === currentWorkspace;
  };

  return (
    <WorkspaceContext.Provider value={{
      currentWorkspace,
      setCurrentWorkspace,
      isAccountInWorkspace,
      workspaceLabel: WORKSPACE_LABELS[currentWorkspace]
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
