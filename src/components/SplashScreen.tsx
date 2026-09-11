import React, { useState } from 'react';
import { Play, ShieldAlert, Sparkles, AlertCircle, ExternalLink, CheckCircle } from 'lucide-react';
import { User } from '../types';
import { signInWithGoogle } from '../lib/firebase';

interface SplashScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      // Real Firebase Google Auth
      const fbUser = await signInWithGoogle();
      
      if (!fbUser || !fbUser.email) {
        throw new Error('Google Sign-In failed or email not provided.');
      }

      // Sync verified Firebase Google profile with backend
      const res = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': fbUser.uid
        },
        body: JSON.stringify({
          uid: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName || fbUser.email.split('@')[0],
          avatar: fbUser.photoURL || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80`
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        onLoginSuccess(data.user);
      } else {
        setErrorMsg(data.message || 'Server failed to initialize user profile.');
      }
    } catch (err: any) {
      console.error('Firebase Google Sign-in error:', err);
      
      if (err?.code === 'auth/popup-blocked') {
        setErrorMsg('Google Sign-In popup was blocked by your browser. Please allow popups or open the app in a new tab.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-In window was closed before completing. Please try again.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Sign-In request was cancelled. Please click once and wait for the popup.');
      } else if (err?.message) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to sign in with Google Firebase. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white flex flex-col items-center justify-between p-6 sm:p-12 relative overflow-hidden font-sans">
      
      {/* Background Decorative Glows */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top spacing / Brand Header */}
      <div className="w-full max-w-md text-center pt-6 space-y-4 relative z-10">
        <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mx-auto shadow-2xl shadow-blue-900/50">
          <Play className="w-10 h-10 text-white fill-white ml-1" />
        </div>
        
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-blue-200 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Official Booster Network</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            AtoPlay Viewer
          </h1>
          <p className="text-blue-100 text-sm max-w-xs mx-auto pt-1">
            Watch videos to earn coins and boost your AtoPlay campaigns instantly.
          </p>
        </div>
      </div>

      {/* Center Card with Real Google Sign In & Anti-Cheat Instructions */}
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/20 shadow-2xl space-y-6 relative z-10 my-6">
        
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-white">Account Login Required</h2>
          <p className="text-xs text-blue-200">
            Sign in with your Google account to access your wallet and active campaigns.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-300/40 text-red-100 text-xs font-medium space-y-2">
            <div className="flex items-center space-x-2 font-bold text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>Authentication Notice</span>
            </div>
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Real Google Sign In Button (Firebase Auth) */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-blue-50 text-zinc-900 font-extrabold text-sm sm:text-base shadow-xl flex items-center justify-center space-x-3 transition-all hover:scale-102 active:scale-98 cursor-pointer"
        >
          {loading ? (
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Connecting to Firebase Google Auth...</span>
            </div>
          ) : (
            <>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Sign in with Google</span>
            </>
          )}
        </button>

        {/* Anti-Cheat / Strict Block Rule Instructions */}
        <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-300/30 text-amber-100 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-xs uppercase tracking-wider text-amber-200">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Strict Anti-Cheat Policy</span>
          </div>
          <p className="text-xs leading-relaxed text-amber-100">
            <strong>Warning:</strong> You cheat your account is blocked! Any use of automated bots, scripts, screen splitting, or tab-switching during watch countdown timers will trigger an immediate permanent account ban.
          </p>
        </div>

        {/* Bonus Coins Badge */}
        <div className="flex items-center justify-center space-x-1.5 text-xs text-blue-200">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>New users receive <strong>300 Bonus Coins</strong> upon Google sign in</span>
        </div>

      </div>

      {/* Footer */}
      <div className="text-center text-xs text-blue-200/70 pb-4 relative z-10">
        © 2026 AtoPlay Viewer Network • Secured with Firebase Auth
      </div>

    </div>
  );
};
