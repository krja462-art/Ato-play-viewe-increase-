import React, { useState, useEffect } from 'react';
import { User } from './types';
import { Navbar } from './components/Navbar';
import { HomeWatchFeed } from './components/HomeWatchFeed';
import { Campaigns } from './components/Campaigns';
import { SplashScreen } from './components/SplashScreen';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { 
  auth, 
  logOut, 
  onAuthStateChanged, 
  checkRedirectResult, 
  syncFirebaseUserWithFirestore, 
  saveUserCoinsToFirestore 
} from './lib/firebase';
import { apiFetch } from './lib/api';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
            if (parsed.email?.toLowerCase().trim() === ADMIN_EMAIL || parsed.id.includes('krja462') || parsed.isAdmin) {
              parsed.coins = ADMIN_UNLIMITED_COINS;
              parsed.isAdmin = true;
            }
            setUser(parsed);
            // Verify & sync latest stats
            apiFetch('/api/user', {
              headers: { 'x-user-id': parsed.id }
            })
              .then((data) => {
                if (data?.success && data?.user) {
                  const updatedUser = data.user;
                  if (updatedUser.email?.toLowerCase().trim() === ADMIN_EMAIL || updatedUser.isAdmin) {
                    updatedUser.coins = ADMIN_UNLIMITED_COINS;
                    updatedUser.isAdmin = true;
                  }
                  setUser(updatedUser);
                  localStorage.setItem('atoviewer_user', JSON.stringify(updatedUser));
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

      // 3. Pre-load Admin session for krja462@gmail.com with Unlimited Coins
      const adminDefaultUser: User = {
        id: 'g_krja462_gmail_com',
        name: 'Admin (KRJA)',
        email: ADMIN_EMAIL,
        coins: ADMIN_UNLIMITED_COINS,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: 30,
        lastCheckIn: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        referralsCount: 25,
        referralEarnings: 6250,
        referralCode: 'REF-KRJA',
        isAdmin: true
      };
      setUser(adminDefaultUser);
      localStorage.setItem('atoviewer_user', JSON.stringify(adminDefaultUser));
      saveUserCoinsToFirestore(adminDefaultUser.id, ADMIN_UNLIMITED_COINS, ADMIN_EMAIL);

      // Inform server
      apiFetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': adminDefaultUser.id },
        body: JSON.stringify({
          uid: adminDefaultUser.id,
          email: ADMIN_EMAIL,
          name: adminDefaultUser.name,
          avatar: adminDefaultUser.avatar
        })
      }).catch(() => {});

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

  const handleLoginSuccess = (loggedInUser: User) => {
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
    return (
      <>
        <SplashScreen onLoginSuccess={handleLoginSuccess} />
        <PWAInstallBanner />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      
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
        onUserUpdate={handleUpdateUser}
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
      </main>

      {/* In-App PWA Install Banner */}
      <PWAInstallBanner />

    </div>
  );
}
