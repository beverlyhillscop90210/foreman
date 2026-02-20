import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export const LoginPage = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-foreman-bg-deep flex items-center justify-center">
      <div className="flex flex-col items-center gap-12">
        {/* Logo */}
        <h1 className="font-mono font-bold text-6xl text-foreman-text tracking-wider">
          FOREMAN
        </h1>
        
        {/* Google OAuth Button */}
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="px-8 py-3 bg-foreman-orange text-white font-sans font-medium text-xs
                     hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                     border border-foreman-orange"
        >
          {isLoading ? 'Authenticating...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
};

