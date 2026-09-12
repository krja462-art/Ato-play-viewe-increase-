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
    const initAuth = async () => {
      // 1. Check if user just returned from Firebase Google Redirect
      try {
        const redirectUser = await checkRedirectResult();
        if (redirectUser) {
          const synced = await syncFirebaseUserWithFirestore(redirectUser);
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
          const parsed = JSON.parse(savedUserStr);
          if (parsed && parsed.id) {
            setUser(parsed);
            // Verify & sync latest stats
            apiFetch('/api/user', {
              headers: { 'x-user-id': parsed.id }
            })
              .then((data) => {
                if (data?.success && data?.user) {
                  setUser(data.user);
                  localStorage.setItem('atoviewer_user', JSON.stringify(data.user));
                }
              })
              .catch(() => {});
          }
        } catch (err) {
          console.warn('Failed to parse saved user:', err);
        }
      }
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
    setUser(updatedUser);
    localStorage.setItem('atoviewer_user', JSON.stringify(updatedUser));
    // Persist coins directly to Firestore
    if (updatedUser.id && !updatedUser.id.startsWith('guest_')) {
      saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins);
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
