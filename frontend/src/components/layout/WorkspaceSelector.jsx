import { useState, useRef, useEffect } from 'react';
import { useWorkspace, WORKSPACES, WORKSPACE_LABELS } from '../../context/WorkspaceContext';
import { Briefcase, User, Users, Globe, ChevronDown, Check } from 'lucide-react';
import './WorkspaceSelector.css';

export default function WorkspaceSelector({ isCollapsed }) {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = (type, size = 16) => {
    switch(type) {
      case WORKSPACES.ALL: return <Globe size={size} className="ws-icon ws-all" />;
      case WORKSPACES.PERSONAL: return <User size={size} className="ws-icon ws-personal" />;
      case WORKSPACES.BUSINESS: return <Briefcase size={size} className="ws-icon ws-business" />;
      case WORKSPACES.FAMILY: return <Users size={size} className="ws-icon ws-family" />;
      default: return <Globe size={size} />;
    }
  };

  const handleSelect = (ws) => {
    setCurrentWorkspace(ws);
    setIsOpen(false);
  };

  return (
    <div className="workspace-selector-container" ref={dropdownRef}>
      <button 
        className={`workspace-trigger ${isCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={WORKSPACE_LABELS[currentWorkspace]}
      >
        <div className="workspace-trigger-left">
          {getIcon(currentWorkspace, 18)}
          {!isCollapsed && (
            <div className="workspace-trigger-text">
              <span className="workspace-trigger-label">Escolha o que ver</span>
              <span className="workspace-trigger-value">{WORKSPACE_LABELS[currentWorkspace]}</span>
            </div>
          )}
        </div>
        {!isCollapsed && <ChevronDown size={14} className="workspace-trigger-chevron" />}
      </button>

      {isOpen && (
        <div className={`workspace-dropdown ${isCollapsed ? 'dropdown-floating' : ''}`}>
          <div className="workspace-dropdown-header">Escolha o que ver</div>
          <div className="workspace-opt-list">
            {Object.values(WORKSPACES).map((ws) => (
              <button 
                key={ws}
                className={`workspace-opt ${currentWorkspace === ws ? 'active' : ''}`}
                onClick={() => handleSelect(ws)}
              >
                {getIcon(ws, 16)}
                <span>{WORKSPACE_LABELS[ws]}</span>
                {currentWorkspace === ws && <Check size={14} className="ws-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
