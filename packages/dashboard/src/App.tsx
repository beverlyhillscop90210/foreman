import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TerminalGrid } from "./components/TerminalGrid";
import { BottomBar } from "./components/BottomBar";
import { Login } from "./components/Login";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center text-[var(--color-accent)]">Loading...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div className="h-screen w-screen bg-[var(--color-background)] text-[var(--color-text-primary)] flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <TerminalGrid />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}

export default App;
