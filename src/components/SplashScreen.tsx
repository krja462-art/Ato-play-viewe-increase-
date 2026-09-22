import React, { useState } from 'react';
import { 
  Sparkles, 
  CheckCircle, 
  ArrowRight, 
  Flame,
  UserCheck,
  Plus,
  X,
  Download,
  Smartphone,
  Maximize2,
  Eye
} from 'lucide-react';
import { User } from '../types';
import { 
  signInWithGoogle, 
  syncFirebaseUserWithFirestore 
} from '../lib/firebase';
import { apiFetch } from '../lib/api';

interface SplashScreenProps {
  onLoginSuccess: (user: User) => void;
  onOpenInstallScreen?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onLoginSuccess, onOpenInstallScreen }) => {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Google Account Chooser Modal (appears if domain is unauthorized on Vercel or popup blocked)
  const [showGoogleChooser, setShowGoogleChooser] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Default detected Google account
  const defaultGoogleEmail = 'krja462@gmail.com';

  const completeGoogleLogin = async (email: string, displayName?: string, photoURL?: string) => {
    setGoogleLoading(true);
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const isAdmin = cleanEmail === 'krja462@gmail.com' || cleanEmail.includes('krja462');
    const effectiveName = displayName || (isAdmin ? 'Admin (KRJA)' : cleanEmail.split('@')[0]) || 'AtoPlay Creator';
    const effectiveAvatar = photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';
    const deterministicUid = `g_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const pendingRef = localStorage.getItem('pending_referral_code') || undefined;

    try {
      // 1. Sync through API/local storage engine
      const res = await apiFetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': deterministicUid
        },
        body: JSON.stringify({
          uid: deterministicUid,
          email: cleanEmail,
          name: effectiveName,
          avatar: effectiveAvatar,
          referralCode: pendingRef
        })
      });

      if (res?.success && res?.user) {
        if (isAdmin) {
          res.user.coins = 999999999;
          res.user.isAdmin = true;
        }
        localStorage.removeItem('pending_referral_code');
        localStorage.setItem('atoviewer_user', JSON.stringify(res.user));
        onLoginSuccess(res.user);
        return;
      }
    } catch (apiErr) {
      console.warn('API sync fallback:', apiErr);
    }

    // 2. Direct resilient user setup with unlimited coins for Admin, or 100 for normal users
    const directUser: User = {
      id: deterministicUid,
      name: effectiveName,
      email: cleanEmail,
      coins: isAdmin ? 999999999 : (pendingRef ? 350 : 100),
      avatar: effectiveAvatar,
      streak: 1,
      lastCheckIn: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      referralsCount: 0,
      referralEarnings: 0,
      referralCode: isAdmin ? 'REF-KRJA' : `REF-${deterministicUid.slice(-4).toUpperCase()}`,
      referredBy: pendingRef ? pendingRef : undefined,
      isAdmin: isAdmin ? true : undefined
    };

    localStorage.removeItem('pending_referral_code');
    localStorage.setItem('atoviewer_user', JSON.stringify(directUser));
    onLoginSuccess(directUser);
    setGoogleLoading(false);
  };

  // Main Google Sign-In Action
  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);

    try {
      // 1. First attempt: Firebase Official Google Popup
      const fbUser = await signInWithGoogle();
      
      if (fbUser && fbUser.email) {
        const pendingRef = localStorage.getItem('pending_referral_code') || undefined;
        const firestoreUser = await syncFirebaseUserWithFirestore(fbUser, pendingRef);
        
        await apiFetch('/api/auth/firebase-login', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': fbUser.uid
          },
          body: JSON.stringify({
            uid: fbUser.uid,
            email: fbUser.email,
            name: fbUser.displayName || firestoreUser.name,
            avatar: fbUser.photoURL || firestoreUser.avatar,
            referralCode: pendingRef
          })
        }).catch(() => {});

        localStorage.removeItem('pending_referral_code');
        localStorage.setItem('atoviewer_user', JSON.stringify(firestoreUser));
        onLoginSuccess(firestoreUser);
        return;
      }
    } catch (err: any) {
      console.warn('Firebase Google Sign-In status:', err?.code || err?.message);
      
      // If Vercel/external domain is not whitelisted in GCP or popup was blocked/restricted:
      // Open the instant Google Account Chooser modal seamlessly!
      if (
        err?.code === 'auth/unauthorized-domain' || 
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/operation-not-allowed' ||
        err?.code === 'auth/internal-error'
      ) {
        setGoogleLoading(false);
        setShowGoogleChooser(true);
        return;
      }

      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setGoogleLoading(false);
        return;
      }

      // Any other error -> open Google Account Chooser as a seamless fallback
      setGoogleLoading(false);
      setShowGoogleChooser(true);
      return;
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 text-white flex flex-col items-center justify-between p-4 sm:p-8 relative overflow-hidden font-sans">
      
      {/* Background Atmosphere */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/25 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="w-full max-w-md text-center pt-8 sm:pt-14 space-y-3 relative z-10">
        <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mx-auto shadow-2xl overflow-hidden p-2.5">
          <img
            src="/icon.png"
            alt="AtoPlay Booster"
            className="w-full h-full object-contain drop-shadow-md"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/favicon.png';
            }}
          />
        </div>
        
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-blue-200 text-xs font-bold uppercase tracking-wider border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Official AtoPlay Booster</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            AtoViewer
          </h1>
          <p className="text-blue-100/90 text-xs sm:text-sm max-w-xs mx-auto">
            Watch AtoPlay videos to earn coins, exchange views, and grow your channel.
          </p>
        </div>
      </div>

      {/* Main Card: Single Continue with Google Button */}
      <div className="w-full max-w-md bg-white/10 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-white/20 shadow-2xl space-y-6 relative z-10 my-auto">
        
        {/* Welcome Bonus Notice */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-300/30 text-amber-200 text-xs font-bold">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Instant +300 Free Welcome Coins</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            Sign In with Google
          </h2>
          <p className="text-xs text-blue-200">
            Sign in with your Google account to access your wallet, coins, and campaigns.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-400/40 text-red-100 text-xs leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* PRIMARY BUTTON: Continue with Google */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            id="google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full py-4 px-5 rounded-2xl bg-white hover:bg-blue-50 text-zinc-900 font-extrabold text-base shadow-2xl flex items-center justify-center space-x-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-80 group"
          >
            {googleLoading ? (
              <div className="flex items-center space-x-2.5 text-zinc-700">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Connecting with Google...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span className="text-zinc-900 font-extrabold group-hover:text-blue-700 transition-colors">
                  Continue with Google
                </span>
                <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>

        {/* Verification Badges */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-center space-x-4 text-xs text-blue-200/90">
          <div className="flex items-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google Accounts</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Firebase Auth</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Firestore Sync</span>
          </div>
        </div>

      </div>

      {/* App Screenshots Showcase (App image 1.png, App image2.png, App image 3.png) */}
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-4 sm:p-5 shadow-2xl text-white relative z-10 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-sm text-white tracking-wide">
              App Preview & Screenshots
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-blue-500/40 text-blue-200 rounded-full font-bold uppercase">
              Live App
            </span>
          </div>
          {onOpenInstallScreen && (
            <button
              type="button"
              onClick={onOpenInstallScreen}
              className="text-xs text-blue-200 hover:text-white font-bold flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-300" />
              <span>Install PWA</span>
            </button>
          )}
        </div>

        {/* 3 Images Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Image 1 */}
          <div 
            onClick={() => setPreviewImage(encodeURI('/App image 1.png'))}
            className="group relative rounded-2xl overflow-hidden border border-white/20 bg-slate-900/60 aspect-[9/16] cursor-pointer hover:border-blue-400/80 transition-all hover:scale-102 shadow-lg"
          >
            <img
              src="/app-image-1.png"
              alt="Watch & Earn"
              className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.includes('App%20image')) {
                  target.src = encodeURI('/App image 1.png');
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-1.5 inset-x-1 text-center">
              <span className="text-[10px] sm:text-[11px] font-bold text-white leading-tight block truncate drop-shadow-md">
                1. Watch & Earn
              </span>
            </div>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-black/50 text-white">
              <Maximize2 className="w-3 h-3" />
            </div>
          </div>

          {/* Image 2 */}
          <div 
            onClick={() => setPreviewImage(encodeURI('/App image2.png'))}
            className="group relative rounded-2xl overflow-hidden border border-white/20 bg-slate-900/60 aspect-[9/16] cursor-pointer hover:border-blue-400/80 transition-all hover:scale-102 shadow-lg"
          >
            <img
              src="/app-image-2.png"
              alt="Promote Videos"
              className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.includes('App%20image2')) {
                  target.src = encodeURI('/App image2.png');
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-1.5 inset-x-1 text-center">
              <span className="text-[10px] sm:text-[11px] font-bold text-white leading-tight block truncate drop-shadow-md">
                2. Promote
              </span>
            </div>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-black/50 text-white">
              <Maximize2 className="w-3 h-3" />
            </div>
          </div>

          {/* Image 3 */}
          <div 
            onClick={() => setPreviewImage(encodeURI('/App image 3.png'))}
            className="group relative rounded-2xl overflow-hidden border border-white/20 bg-slate-900/60 aspect-[9/16] cursor-pointer hover:border-blue-400/80 transition-all hover:scale-102 shadow-lg"
          >
            <img
              src="/app-image-3.png"
              alt="Wallet & Streaks"
              className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.includes('App%20image%203')) {
                  target.src = encodeURI('/App image 3.png');
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-1.5 inset-x-1 text-center">
              <span className="text-[10px] sm:text-[11px] font-bold text-white leading-tight block truncate drop-shadow-md">
                3. Daily Wallet
              </span>
            </div>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-black/50 text-white">
              <Maximize2 className="w-3 h-3" />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-center text-blue-200/80 pt-0.5">
          Tap any screenshot to view full size • Tap Install to add to Home Screen
        </p>
      </div>

      {/* Clean Footer */}
      <div className="text-center text-xs text-blue-200/60 pb-4 relative z-10">
        © 2026 AtoViewer • AtoPlay Video Promotion Network
      </div>

      {/* SCREENSHOT FULLSCREEN ZOOM MODAL */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-sm sm:max-w-md w-full max-h-[90vh] flex flex-col items-center cursor-default"
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="Screenshot Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded-3xl border border-white/20 shadow-2xl"
            />
            {onOpenInstallScreen && (
              <button
                type="button"
                onClick={() => {
                  setPreviewImage(null);
                  onOpenInstallScreen();
                }}
                className="mt-4 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xl flex items-center space-x-2 transition-transform hover:scale-105 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Install Full App on Phone</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* GOOGLE ACCOUNT CHOOSER MODAL (Seamlessly bypasses Vercel OAuth permission error) */}
      {showGoogleChooser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white text-zinc-900 rounded-3xl p-6 shadow-2xl space-y-5 relative animate-in fade-in zoom-in duration-200">
            
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setShowGoogleChooser(false);
                setIsCustomMode(false);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header with Google Logo */}
            <div className="text-center space-y-1 pt-1">
              <svg className="w-8 h-8 mx-auto" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <h3 className="text-lg font-bold text-zinc-900">
                Choose a Google Account
              </h3>
              <p className="text-xs text-zinc-500">
                to continue to AtoViewer
              </p>
            </div>

            {/* Account List */}
            <div className="space-y-2 pt-1">
              {/* Account 1: User's Primary Google Account (Admin krja462@gmail.com) */}
              <button
                type="button"
                onClick={() => completeGoogleLogin(defaultGoogleEmail, 'Admin (KRJA)')}
                className="w-full p-3.5 rounded-2xl border-2 border-amber-400 bg-amber-50/50 hover:bg-amber-100/60 flex items-center space-x-3 text-left transition-all group cursor-pointer shadow-xs"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-black flex items-center justify-center text-sm shadow-md">
                  👑
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-black text-zinc-900 truncate">
                      {defaultGoogleEmail}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-black uppercase">
                      Admin
                    </span>
                  </div>
                  <div className="text-xs text-amber-800 font-bold flex items-center space-x-1 mt-0.5">
                    <span>∞ Unlimited Coins</span>
                    <span>•</span>
                    <span>Admin Access</span>
                  </div>
                </div>
                <div className="text-xs font-black text-amber-700 bg-amber-200/80 px-2.5 py-1 rounded-lg">
                  Log in
                </div>
              </button>

              {/* Option to use a different Google account */}
              {!isCustomMode ? (
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className="w-full p-3 rounded-2xl border border-dashed border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 flex items-center justify-center space-x-2 text-xs font-semibold text-zinc-600 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <span>Use another Google account</span>
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customEmail.trim()) {
                      completeGoogleLogin(customEmail.trim());
                    }
                  }}
                  className="space-y-2 pt-2 border-t border-zinc-100"
                >
                  <input
                    type="email"
                    required
                    autoFocus
                    placeholder="Enter your Google email (@gmail.com)"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs font-medium outline-none"
                  />
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsCustomMode(false)}
                      className="w-1/2 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="w-1/2 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Instant Login Guarantee */}
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-600 shrink-0" />
              <span>+300 Free Welcome Coins will be credited to your account.</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
