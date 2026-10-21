import { useWorkspace } from '../../context/WorkspaceContext';
import './WorkspaceSelector.css';
export default function WorkspaceSelector({ isCollapsed }) {
  const { currentWorkspace, setCurrentWorkspace, workspaces, error, refreshWorkspaces } = useWorkspace();
  return <div className="workspace-selector-container">
    <label htmlFor="workspace-select">{isCollapsed ? 'Contexto' : 'Contexto financeiro'}</label>
    <select id="workspace-select" value={currentWorkspace} onChange={e => setCurrentWorkspace(e.target.value)}>
      <option value="all">Consolidado autorizado</option>
      {workspaces.map(w => <option key={w.id} value={w.id}>{w.name} · {w.role === 'viewer' ? 'Leitura' : w.kind}</option>)}
    </select>
    {currentWorkspace === 'all' && !isCollapsed && <small>Visão consolidada para consulta. Selecione um contexto para cadastrar dados.</small>}
    {error && <button className="btn btn-secondary" onClick={refreshWorkspaces}>Recarregar contextos</button>}
  </div>;
}
