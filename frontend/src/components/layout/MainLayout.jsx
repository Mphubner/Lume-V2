import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Chatbot from '../ui/Chatbot';

export default function MainLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
      <Chatbot />
    </div>
  );
}
