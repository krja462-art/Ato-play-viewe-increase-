import React, { useState, useEffect, useCallback } from 'react';
import { User } from './types';
import { Navbar } from './components/Navbar';
import { HomeWatchFeed } from './components/HomeWatchFeed';
import { Campaigns } from './components/Campaigns';
import { AdminUsers } from './components/AdminUsers';
import { SplashScreen } from './components/SplashScreen';
import { PreLoginInstallScreen } from './components/PreLoginInstallScreen';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { OfflineBanner } from './components/OfflineBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useTheme } from './hooks/useTheme';
import { 
  auth, 
  logOut, 
  onAuthStateChanged, 
  checkRedirectResult, 
  syncFirebaseUserWithFirestore, 
  saveUserCoinsToFirestore,
  getUserCoinsFromFirestore,
  subscribeToUserCoins
} from './lib/firebase';
import { apiFetch } from './lib/api';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showInstallScreen, setShowInstallScreen] = useState(() => {
    try {
      return localStorage.getItem('pwa_prelogin_installed') !== 'true';
    } catch {
      return true;
    }
  });

  const { isOnline, isReconnected } = useOnlineStatus();
  useTheme(); // Initialize and apply documentElement dark class

  // Capture referral code from URL search params on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || params.get('referral');
      if (ref) {
        localStorage.setItem('pending_referral_code', ref.trim().toUpperCase());
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);

  // Check redirect login & cached session on initial load
  useEffect(() => {
    const ADMIN_EMAIL = 'krja462@gmail.com';
    const ADMIN_UNLIMITED_COINS = 999999999;

    const initAuth = async () => {
      // 1. Check if user just returned from Firebase Google Redirect
      try {
        const redirectUser = await checkRedirectResult();
        if (redirectUser) {
          const synced = await syncFirebaseUserWithFirestore(redirectUser);
          if (synced.email?.toLowerCase().trim() === ADMIN_EMAIL || synced.id.includes('krja462')) {
            synced.coins = ADMIN_UNLIMITED_COINS;
            synced.isAdmin = true;
          }
          setUser(synced);
          localStorage.setItem('atoviewer_user', JSON.stringify(synced));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Redirect check:', err);
      }

      // 2. Check local saved session
      const savedUserStr = localStorage.getItem('atoviewer_user');
      if (savedUserStr) {
        try {
          const parsed: User = JSON.parse(savedUserStr);
          if (parsed && parsed.id) {
            const isAdmin = parsed.email?.toLowerCase().trim() === ADMIN_EMAIL || parsed.id.includes('krja462') || parsed.isAdmin;
            if (isAdmin) {
              parsed.coins = ADMIN_UNLIMITED_COINS;
              parsed.isAdmin = true;
            }
            setUser(parsed);

            // Fetch true persistent coin balance directly from Cloud Firestore
            if (!isAdmin && !parsed.id.startsWith('guest_')) {
              getUserCoinsFromFirestore(parsed.id).then((fsCoins) => {
                if (typeof fsCoins === 'number') {
                  const finalCoins = Math.max(parsed.coins || 100, fsCoins);
                  if (finalCoins !== parsed.coins) {
                    parsed.coins = finalCoins;
                    setUser({ ...parsed, coins: finalCoins });
                    localStorage.setItem('atoviewer_user', JSON.stringify({ ...parsed, coins: finalCoins }));
                  }
                }
              }).catch(() => {});
            }

            // Verify & sync latest stats with server cache (without overwriting higher coins)
            apiFetch('/api/user', {
              headers: { 
                'x-user-id': parsed.id,
                'x-user-coins': String(parsed.coins || 100)
              }
            })
              .then((data) => {
                if (data?.success && data?.user) {
                  const updatedUser = data.user;
                  if (updatedUser.email?.toLowerCase().trim() === ADMIN_EMAIL || updatedUser.isAdmin) {
                    updatedUser.coins = ADMIN_UNLIMITED_COINS;
                    updatedUser.isAdmin = true;
                  } else {
                    // CRITICAL: Preserve client's earned coins across server refresh
                    updatedUser.coins = Math.max(parsed.coins || 100, updatedUser.coins || 100);
                  }
                  setUser(updatedUser);
                  localStorage.setItem('atoviewer_user', JSON.stringify(updatedUser));
                  saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins, updatedUser.email);
                }
              })
              .catch(() => {});
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Failed to parse saved user:', err);
        }
      }

      // 3. No active saved session -> present clean Google Login screen
      setUser(null);
      setLoading(false);
    };

    initAuth();
  }, []);

  // Sync Firebase Auth state when Firebase user is present
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && fbUser.email) {
        try {
          const syncedUser = await syncFirebaseUserWithFirestore(fbUser);
          setUser(syncedUser);
          localStorage.setItem('atoviewer_user', JSON.stringify(syncedUser));

          // Also inform server API session
          await apiFetch('/api/auth/firebase-login', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-user-id': fbUser.uid
            },
            body: JSON.stringify({
              uid: fbUser.uid,
              email: fbUser.email,
              name: fbUser.displayName || syncedUser.name,
              avatar: fbUser.photoURL || syncedUser.avatar
            })
          });
        } catch (err) {
          console.error('Failed to sync Firebase user session:', err);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore wallet subscription to keep coins in sync across tabs and refreshes
  useEffect(() => {
    if (!user?.id || user.id.startsWith('guest_') || user.isAdmin) return;
    const unsub = subscribeToUserCoins(user.id, (realtimeCoins) => {
      setUser(prev => {
        if (!prev) return null;
        if (prev.coins !== realtimeCoins && !prev.isAdmin) {
          const finalVal = Math.max(prev.coins, realtimeCoins);
          localStorage.setItem('atoviewer_user', JSON.stringify({ ...prev, coins: finalVal }));
          return { ...prev, coins: finalVal };
        }
        return prev;
      });
    });
    return () => unsub();
  }, [user?.id]);

  const handleUpdateUser = (updatedUser: User) => {
    if (updatedUser.email?.toLowerCase().trim() === 'krja462@gmail.com' || updatedUser.isAdmin || updatedUser.id.includes('krja462')) {
      updatedUser.coins = 999999999;
      updatedUser.isAdmin = true;
    }
    setUser(updatedUser);
    localStorage.setItem('atoviewer_user', JSON.stringify(updatedUser));
    // Persist coins directly to Firestore
    if (updatedUser.id && !updatedUser.id.startsWith('guest_')) {
      saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins, updatedUser.email);
      // Also sync wallet balance with backend session cache
      apiFetch('/api/user/sync-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: updatedUser.coins })
      }).catch(() => {});
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('atoviewer_user');
      await logOut();
      await apiFetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      localStorage.removeItem('atoviewer_user');
      setUser(null);
    }
  };

  const handleResetAccounts = async () => {
    if (!window.confirm('Do you want to refresh and reset all logged-in Google accounts? You will be prompted to select any Google account on next login.')) return;

    try {
      localStorage.removeItem('atoviewer_user');
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('atoviewer_watched_') || k.startsWith('atoviewer_user')) {
          localStorage.removeItem(k);
        }
      });
      await logOut();
      await apiFetch('/api/auth/reset-accounts', { method: 'POST' });
      await apiFetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Reset accounts error:', err);
      localStorage.removeItem('atoviewer_user');
      setUser(null);
    }
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    if (loggedInUser.email?.toLowerCase().trim() === 'krja462@gmail.com' || loggedInUser.id.includes('krja462') || loggedInUser.isAdmin) {
      loggedInUser.coins = 999999999;
      loggedInUser.isAdmin = true;
    }
    localStorage.setItem('atoviewer_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
  };

  const handleClaimCheckin = async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/api/wallet/checkin', { 
        method: 'POST',
        headers: { 'x-user-id': user.id }
      });
      if (data?.success) {
        handleUpdateUser(data.user);
        alert(data.message);
      } else {
        alert(data?.message || 'Check-in failed');
      }
    } catch (err) {
      console.error('Checkin failed', err);
    }
  };

  const handleWatchAd = async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/api/wallet/reward-ad', { 
        method: 'POST',
        headers: { 'x-user-id': user.id }
      });
      if (data?.success) {
        handleUpdateUser(data.user);
        alert(data.message);
      } else {
        alert(data?.message || 'Ad reward failed');
      }
    } catch (err) {
      console.error('Ad reward failed', err);
    }
  };

  const handleAppRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);

    // Refresh user balance if logged in
    if (user?.id) {
      try {
        const res = await apiFetch('/api/user', {
          headers: { 'x-user-id': user.id }
        });
        if (res?.success && res?.user) {
          handleUpdateUser(res.user);
        }
      } catch (err) {
        console.warn('Silent refresh user error:', err);
      }
    }

    // Check service worker updates smoothly
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      } catch {}
    }

    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200 font-medium tracking-wide">Connecting to AtoViewer Network...</p>
      </div>
    );
  }

  // Mandatory Google Login Guard: User cannot open or enter the app without logging in
  if (!user) {
    if (showInstallScreen) {
      return (
        <PreLoginInstallScreen onSkip={() => setShowInstallScreen(false)} />
      );
    }
    return (
      <>
        <OfflineBanner
          isOnline={isOnline}
          isReconnected={isReconnected}
          onRefresh={handleAppRefresh}
          isRefreshing={isRefreshing}
        />
        <SplashScreen 
          onLoginSuccess={handleLoginSuccess} 
          onOpenInstallScreen={() => setShowInstallScreen(true)}
        />
        <PWAInstallBanner />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Offline Status & Reconnection Banner */}
      <OfflineBanner
        isOnline={isOnline}
        isReconnected={isReconnected}
        onRefresh={handleAppRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Top Navbar & Drawer Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        coins={user.coins}
        streak={user.streak}
        onOpenCreate={() => {
          setActiveTab('campaigns');
          setIsCreateModalOpen(true);
        }}
        user={user}
        onLogout={handleLogout}
        onRefresh={handleAppRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area (Home Feed or Campaign Page) */}
      <main className="flex-1 pb-24">
        {activeTab === 'home' && (
          <HomeWatchFeed
            user={user}
            onCoinEarned={handleUpdateUser}
            setActiveTab={setActiveTab}
            onClaimCheckin={handleClaimCheckin}
            onWatchAd={handleWatchAd}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'campaigns' && (
          <Campaigns
            user={user}
            onCampaignCreated={handleUpdateUser}
            isCreateModalOpen={isCreateModalOpen}
            onCloseCreateModal={() => setIsCreateModalOpen(false)}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
          />
        )}

        {activeTab === 'users' && (
          <AdminUsers
            user={user}
            setActiveTab={setActiveTab}
          />
        )}
      </main>

      {/* In-App PWA Install Banner */}
      <PWAInstallBanner />

    </div>
  );
}
