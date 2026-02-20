import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { KanbanPage } from './pages/KanbanPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { useTerminalStore } from './stores/terminalStore';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initialize = useTerminalStore(state => state.initialize);

  // Check authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize real data from API
  useEffect(() => {
    if (session) {
      initialize();
    }
  }, [session, initialize]);

  if (loading) {
    return <div className="w-screen h-screen bg-foreman-bg-deep flex items-center justify-center text-foreman-orange">Loading...</div>;
  }

  if (!session) {
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

