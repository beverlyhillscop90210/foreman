import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { DevicesPage } from './pages/DevicesPage';
import { useTerminalStore } from './stores/terminalStore';
import { useSettingsStore } from './stores/settingsStore';
import { useChatStore } from './stores/chatStore';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const initialize = useTerminalStore(state => state.initialize);
  const { syncWithAPI } = useSettingsStore();

  // Check authentication
  useEffect(() => {
    const checkAccess = async (session: Session | null) => {
      if (session?.user?.email) {
        const email = session.user.email;
        const isSuperAdmin = email === 'peterschings@gmail.com' || email === 'peter@beverlyhillscop.io' || email === 'peter.schings@googlemail.com';

        let isAllowed = isSuperAdmin;

        if (!isAllowed) {
          // Query access control directly from Supabase settings table
          try {
            const { data, error } = await supabase
              .from('settings')
              .select('value')
              .eq('key', 'accessControl')
              .single();

            if (!error && data?.value?.users) {
              isAllowed = data.value.users.some((u: any) => u.email === email);
            }
          } catch (e) {
            console.error('Failed to query accessControl from settings', e);
          }
        }

        // Fallback: also check the store (covers localStorage fallback)
        if (!isAllowed) {
          try {
            await syncWithAPI();
          } catch (e) { /* ignore */ }
          isAllowed = useSettingsStore.getState().accessControl.users?.some(u => u.email === email) || false;
        }

        if (!isAllowed) {
          await supabase.auth.signOut();
          setSession(null);
          useChatStore.getState().setCurrentUser(null);
          setAccessDenied(true);
        } else {
          setSession(session);
          useChatStore.getState().setCurrentUser(email);
          setAccessDenied(false);
          // Sync full settings now that we know user is allowed
          syncWithAPI().catch(() => {});
        }
      } else {
        setSession(null);
        useChatStore.getState().setCurrentUser(null);
      }
    };

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await checkAccess(session);
      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await checkAccess(session);
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
    return (
      <>
        {accessDenied && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded shadow-lg z-50 font-sans text-sm">
            Access denied. Contact admin for an invite.
          </div>
        )}
        <LoginPage />
      </>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

