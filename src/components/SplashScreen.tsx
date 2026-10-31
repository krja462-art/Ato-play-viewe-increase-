import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  CheckCircle, 
  ArrowRight, 
  Plus,
  UserCheck
} from 'lucide-react';
import { User } from '../types';
import { 
  signInWithGoogle, 
  syncFirebaseUserWithFirestore,
  saveUserAtoPlayProfileToFirestore
} from '../lib/firebase';
import { apiFetch, isRealAtoPlayAvatarUrl } from '../lib/api';
import { LegalModal, LegalTabType } from './LegalModal';

interface SplashScreenProps {
  onLoginSuccess: (user: User) => void;
  onOpenInstallScreen?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onLoginSuccess }) => {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [legalModalTab, setLegalModalTab] = useState<LegalTabType | null>(null);
  const loginInProgressRef = useRef(false);
  
  const [referralInput, setReferralInput] = useState('');
  const [showReferralField, setShowReferralField] = useState(false);

  const completeGoogleLogin = async (
    email: string,
    displayName?: string,
    photoURL?: string,
    firebaseUid?: string,
    directAtoPlayProfile?: {
      atoPlayUsername: string;
      channelName: string;
      channelImage?: string;
      channelBanner?: string;
    }
  ) => {
    setGoogleLoading(true);
    setErrorMessage(null);
    if (typeof window !== 'undefined') {
      (window as any).__atoplayLoginInFlight = true;
    }
    try {
      const cleanEmail = email.trim().toLowerCase();
      const name = (displayName || '').trim() || cleanEmail.split('@')[0] || 'Creator';
      const avatar = photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`;

      // Check if localStorage already has an account for this exact Gmail address
      let savedLocalId: string | undefined = undefined;
      let savedLocalCoins: number | undefined = undefined;
      try {
        const raw = localStorage.getItem('atoviewer_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.email?.toLowerCase().trim() === cleanEmail && parsed.id && !String(parsed.id).startsWith('guest_')) {
            savedLocalId = parsed.id;
            if (typeof parsed.coins === 'number') {
              savedLocalCoins = parsed.coins;
            }
          }
        }
      } catch {}

      const isAdministrator = cleanEmail === 'krja462@gmail.com';
      const userId = firebaseUid || savedLocalId || (isAdministrator ? 'g_krja462_gmail_com' : `g_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`);
      const initialCoins = isAdministrator ? 999999999 : (savedLocalCoins ?? 100);

      let finalReferralCode = referralInput.trim().toUpperCase();
      if (!finalReferralCode && localStorage.getItem('atoplay_ref_code')) {
        finalReferralCode = localStorage.getItem('atoplay_ref_code') || '';
      }

      // 1. Sync with Firestore first so we resolve the single canonical user document for this Gmail
      let firestoreUser: User | null = null;
      try {
        firestoreUser = await syncFirebaseUserWithFirestore({
          uid: userId,
          email: cleanEmail,
          displayName: directAtoPlayProfile?.atoPlayUsername || name,
          photoURL: directAtoPlayProfile?.channelImage || avatar
        } as any, finalReferralCode);
      } catch (fErr) {
        console.warn('Firestore sync fallback:', fErr);
      }

      const canonicalId = firestoreUser?.id || userId;
      const canonicalCoins = isAdministrator
        ? 999999999
        : Math.max(firestoreUser?.coins ?? 0, savedLocalCoins ?? 0, 100);

      // 2. Sync with Backend using the exact same canonical UID and email
      let backendUser: User | null = null;
      try {
        const res = await apiFetch('/api/auth/google', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': canonicalId,
            'x-user-email': cleanEmail
          },
          body: JSON.stringify({
            uid: canonicalId,
            email: cleanEmail,
            displayName: name,
            photoURL: avatar,
            coins: canonicalCoins,
            referralCode: finalReferralCode,
            atoPlayUsername: directAtoPlayProfile?.atoPlayUsername || firestoreUser?.atoPlayUsername,
            channelName: directAtoPlayProfile?.channelName || firestoreUser?.channelName,
            channelImage: directAtoPlayProfile?.channelImage || firestoreUser?.channelImage
          })
        });
        if (res?.success && res.user) {
          backendUser = res.user;
        }
      } catch (err) {
        console.warn('Backend login fallback:', err);
      }

      const candidateChannelImage =
        directAtoPlayProfile?.channelImage ||
        firestoreUser?.channelImage ||
        backendUser?.channelImage ||
        '';
      const hasRealAtoPlaySync = isRealAtoPlayAvatarUrl(candidateChannelImage) && Boolean(
        directAtoPlayProfile?.atoPlayUsername ||
        firestoreUser?.atoPlayUsername ||
        backendUser?.atoPlayUsername
      );

      const syncedAtoPlayUsername = hasRealAtoPlaySync
        ? (directAtoPlayProfile?.atoPlayUsername || firestoreUser?.atoPlayUsername || backendUser?.atoPlayUsername || '')
        : '';
      const syncedChannelName = hasRealAtoPlaySync
        ? (directAtoPlayProfile?.channelName || firestoreUser?.channelName || backendUser?.channelName || syncedAtoPlayUsername)
        : '';
      const syncedChannelImage = hasRealAtoPlaySync ? candidateChannelImage : '';
      const syncedChannelBanner = hasRealAtoPlaySync
        ? (directAtoPlayProfile?.channelBanner || firestoreUser?.channelBanner || backendUser?.channelBanner || '')
        : '';

      const mergedCoins = isAdministrator
        ? 999999999
        : Math.max(firestoreUser?.coins ?? 0, backendUser?.coins ?? 0, savedLocalCoins ?? 0, initialCoins);

      const loggedInUser: User = {
        ...(backendUser || firestoreUser || {
          id: canonicalId,
          name: name,
          email: cleanEmail,
          avatar: avatar,
          coins: mergedCoins,
          streak: 1,
          isAdmin: isAdministrator,
          createdAt: new Date().toISOString()
        }),
        id: canonicalId,
        email: cleanEmail,
        coins: mergedCoins,
        name: hasRealAtoPlaySync ? (syncedChannelName || syncedAtoPlayUsername) : (firestoreUser?.name || backendUser?.name || name),
        avatar: hasRealAtoPlaySync ? syncedChannelImage : (firestoreUser?.avatar || backendUser?.avatar || avatar),
        atoPlayUsername: syncedAtoPlayUsername,
        channelName: syncedChannelName,
        channelImage: syncedChannelImage,
        channelBanner: syncedChannelBanner
      };

      if (hasRealAtoPlaySync) {
        saveUserAtoPlayProfileToFirestore(loggedInUser.id, {
          atoPlayUsername: syncedAtoPlayUsername,
          channelName: syncedChannelName,
          channelImage: syncedChannelImage,
          channelBanner: syncedChannelBanner,
          name: loggedInUser.name,
          avatar: loggedInUser.avatar,
          email: cleanEmail
        }).catch(() => {});
      }

      localStorage.setItem('atoviewer_user', JSON.stringify(loggedInUser));
      localStorage.setItem('atoplay_active_user', JSON.stringify(loggedInUser));
      onLoginSuccess(loggedInUser);
    } catch (e: any) {
      console.error('Sign-In failed:', e);
      setErrorMessage(e?.message || 'Sign-In failed. Please try again.');
      setGoogleLoading(false);
    } finally {
      loginInProgressRef.current = false;
      if (typeof window !== 'undefined') {
        (window as any).__atoplayLoginInFlight = false;
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (loginInProgressRef.current) return;
    loginInProgressRef.current = true;
    try {
      setGoogleLoading(true);
      setErrorMessage(null);

      const firebaseUser = await signInWithGoogle();
      if (firebaseUser && firebaseUser.email) {
        await completeGoogleLogin(
          firebaseUser.email, 
          firebaseUser.displayName || firebaseUser.email.split('@')[0], 
          firebaseUser.photoURL || undefined,
          firebaseUser.uid
        );
        return;
      } else {
        throw new Error('Could not retrieve email from Google account.');
      }
    } catch (err: any) {
      console.warn('Google Sign-In attempt:', err);
      const errCode = err?.code || '';
      loginInProgressRef.current = false;
      setGoogleLoading(false);
      if (errCode !== 'auth/popup-closed-by-user' && errCode !== 'auth/cancelled-popup-request') {
        setErrorMessage(err?.message || 'Google Sign-In failed. Please try again.');
      }
    }
  };

  const handleGuestLogin = () => {
    setErrorMessage(null);
    let existingGuest: User | null = null;
    try {
      const saved = localStorage.getItem('atoplay_guest_user') || localStorage.getItem('atoviewer_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && String(parsed.id).startsWith('guest_')) {
          existingGuest = parsed;
        }
      }
    } catch {}

    const guestId = existingGuest?.id || `guest_${Math.random().toString(36).substring(2, 10)}`;
    const guestUser: User = existingGuest || {
      id: guestId,
      name: 'Guest Creator',
      email: `${guestId}@guest.atoplay.local`,
      coins: 100,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(guestId)}`,
      streak: 1,
      lastCheckIn: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      referralCode: `REF-${guestId.slice(-4).toUpperCase()}`,
      referralsCount: 0,
      referralEarnings: 0
    };

    localStorage.setItem('atoviewer_user', JSON.stringify(guestUser));
    localStorage.setItem('atoplay_guest_user', JSON.stringify(guestUser));
    localStorage.setItem('atoplay_active_user', JSON.stringify(guestUser));
    onLoginSuccess(guestUser);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-x-hidden font-sans select-none">
      
      {/* Background Decorative Glows */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-sm sm:max-w-md bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 sm:p-8 shadow-2xl text-white relative z-10 space-y-6 my-auto">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl border border-white/30 overflow-hidden relative">
            <img src="/icon.png" alt="AtoPlay Booster Icon" className="w-full h-full object-cover" />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-500/30 border border-blue-400/30 text-blue-200 text-xs font-extrabold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Creator Growth & SEO Studio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight pt-1">
              AtoPlay Booster
            </h1>
            <p className="text-xs sm:text-sm text-blue-200/90 font-medium max-w-xs mx-auto">
              Watch AtoPlay videos, generate viral SEO tags, plan campaigns, and grow your channel organically.
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-bold flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Primary Action: Continue with Google + Open Guest */}
        <div className="space-y-3">
          <div className="space-y-2.5">
            {/* Primary Top Button: Continue with Google */}
            <button
              type="button"
              id="google-signin-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full py-3.5 px-5 rounded-2xl bg-white hover:bg-blue-50 text-zinc-900 font-extrabold text-sm sm:text-base shadow-xl flex items-center justify-center transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-80 group"
            >
              {googleLoading ? (
                <div className="flex items-center space-x-2.5 text-zinc-700 py-0.5">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3 w-full">
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
                </div>
              )}
            </button>

            {/* Secondary Button: Open Guest */}
            <button
              type="button"
              id="open-guest-btn"
              onClick={handleGuestLogin}
              disabled={googleLoading}
              className="w-full py-3.5 px-5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-extrabold text-sm sm:text-base shadow-lg flex items-center justify-center space-x-2.5 transition-all transform hover:scale-[1.01] active:scale-[0.98] cursor-pointer disabled:opacity-60 group"
            >
              <UserCheck className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Open Guest</span>
              <ArrowRight className="w-4 h-4 text-blue-200 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Optional Referral Code Toggle */}
          <div className="text-center pt-1">
            {!showReferralField ? (
              <button
                type="button"
                onClick={() => setShowReferralField(true)}
                className="text-xs text-amber-300 hover:text-amber-200 font-semibold inline-flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Have a referral code? (+250 Bonus Coins)</span>
              </button>
            ) : (
              <div className="space-y-1 text-left bg-black/20 p-3 rounded-2xl border border-white/10 animate-in fade-in duration-150">
                <label className="text-xs font-bold text-amber-200 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Referral Code</span>
                </label>
                <input
                  type="text"
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  placeholder="e.g. REF-A482"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/95 text-zinc-900 font-bold text-xs border border-white/20 focus:outline-none uppercase"
                />
              </div>
            )}
          </div>
        </div>

        {/* Verification Badges */}
        <div className="pt-3 border-t border-white/10 grid grid-cols-3 gap-1 text-[11px] text-center text-blue-200/90 font-medium">
          <div className="flex flex-col items-center justify-center space-y-0.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Fair Exchange</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-0.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Google Login</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-0.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Cloud Sync</span>
          </div>
        </div>

        {/* Legal Disclaimer Box for Store Compliance */}
        <div className="pt-2 text-[10px] text-blue-200/60 leading-relaxed text-center px-1">
          Disclaimer: AtoPlay Booster is an independent community video promotion network. Not officially affiliated with or endorsed by AtoPlay or Bluedoors Technologies.
        </div>

      </div>

      {/* Clean Legal & Compliance Footer for App Store (Uptodown / Play Store) Acceptance */}
      <div className="text-center space-y-2 pt-4 pb-2 relative z-10">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-blue-200/80 font-medium">
          <button
            type="button"
            onClick={() => setLegalModalTab('privacy')}
            className="hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
          <span className="text-blue-300/40">•</span>
          <button
            type="button"
            onClick={() => setLegalModalTab('terms')}
            className="hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Terms of Service
          </button>
          <span className="text-blue-300/40">•</span>
          <button
            type="button"
            onClick={() => setLegalModalTab('disclaimer')}
            className="hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Disclaimer
          </button>
          <span className="text-blue-300/40">•</span>
          <button
            type="button"
            onClick={() => setLegalModalTab('contact')}
            className="hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Support
          </button>
          <span className="text-blue-300/40">•</span>
          <button
            type="button"
            onClick={() => setLegalModalTab('delete_account')}
            className="hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Data Deletion
          </button>
        </div>
        <p className="text-[11px] text-blue-200/50">
          © 2026 AtoPlay Booster • Community Video Promotion Platform
        </p>
      </div>

      {/* Direct In-App Legal Modal (Visible without login) */}
      {legalModalTab && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <LegalModal
            isOpen={true}
            initialTab={legalModalTab}
            onClose={() => setLegalModalTab(null)}
          />
        </div>
      )}

    </div>
  );
};
