import React, { useState, useEffect } from 'react';
import { User } from './types';
import { Navbar } from './components/Navbar';
import { HomeWatchFeed } from './components/HomeWatchFeed';
import { Campaigns } from './components/Campaigns';
import { SplashScreen } from './components/SplashScreen';
import { auth, logOut, onAuthStateChanged } from './lib/firebase';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sync Firebase Auth state continuously
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && fbUser.email) {
        try {
          // Sync with backend session
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
            setUser(data.user);
          } else {
            setUser(null);
          }
        } catch (err) {
          console.error('Failed to sync Firebase user session:', err);
          setUser(null);
        }
      } else {
        // Without Google login, user cannot access the app
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await logOut();
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleClaimCheckin = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/wallet/checkin', { 
        method: 'POST',
        headers: { 'x-user-id': user.id }
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        alert(data.message);
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error('Checkin failed', err);
    }
  };

  const handleWatchAd = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/wallet/reward-ad', { 
        method: 'POST',
        headers: { 'x-user-id': user.id }
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        alert(data.message);
      }
    } catch (err) {
      console.error('Ad reward failed', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-zinc-900 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-600 font-medium tracking-wide">Connecting to AtoPlay Network...</p>
      </div>
    );
  }

  // Mandatory Google Login Guard: User cannot open or enter the app without logging in
  if (!user) {
    return <SplashScreen onLoginSuccess={setUser} />;
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Top Navbar & Bottom Footer Navigation */}
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
      />

      {/* Main Content Area (Home Feed or Campaign Page) */}
      <main className="flex-1 pb-24">
        {activeTab === 'home' && (
          <HomeWatchFeed
            user={user}
            onCoinEarned={updated => setUser(updated)}
            setActiveTab={setActiveTab}
            onClaimCheckin={handleClaimCheckin}
            onWatchAd={handleWatchAd}
          />
        )}

        {activeTab === 'campaigns' && (
          <Campaigns
            user={user}
            onCampaignCreated={updated => setUser(updated)}
            isCreateModalOpen={isCreateModalOpen}
            onCloseCreateModal={() => setIsCreateModalOpen(false)}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
          />
        )}
      </main>

    </div>
  );
}
