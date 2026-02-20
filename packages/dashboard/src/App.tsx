import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { KanbanPage } from './pages/KanbanPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { useTerminalStore } from './stores/terminalStore';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const initialize = useTerminalStore(state => state.initialize);

  // Check authentication
  useEffect(() => {
    const auth = localStorage.getItem('foreman_auth');
    setIsAuthenticated(auth === 'true');
  }, []);

  // Initialize real data from API
  useEffect(() => {
    if (isAuthenticated) {
      initialize();
    }
  }, [isAuthenticated, initialize]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

