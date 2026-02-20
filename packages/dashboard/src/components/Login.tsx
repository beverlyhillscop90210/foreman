import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      alert("Check your email for the login link!");
    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-accent)] font-mono tracking-wider mb-2">FOREMAN</h1>
        <p className="text-[var(--color-text-muted)] mb-8">Mission Control Authentication</p>
        
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)] text-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-accent)] text-black font-medium py-3 px-4 rounded-md flex items-center justify-center gap-3 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Sending link..." : "Send Magic Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
