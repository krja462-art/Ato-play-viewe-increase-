import React, { useState, useEffect, useCallback } from 'react';
import { User } from './types';
import { Navbar } from './components/Navbar';
import { HomeWatchFeed } from './components/HomeWatchFeed';
import { Campaigns } from './components/Campaigns';
import { AdminUsers } from './components/AdminUsers';
import { AIVideoAssistant } from './components/AIVideoAssistant';
import { CreatorStudioTools } from './components/CreatorStudioTools';
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
  getRedirectResult,
  checkRedirectResult, 
  syncFirebaseUserWithFirestore, 
  saveUserCoinsToFirestore,
  saveUserAtoPlayProfileToFirestore,
  getUserCoinsFromFirestore,
  subscribeToUserCoins,
  fetchUserNotificationsFromFirestore,
  subscribeToUserNotificationsInFirestore,
  markNotificationReadInFirestore
} from './lib/firebase';
import { apiFetch, isRealAtoPlayAvatarUrl } from './lib/api';
import { FollowReportWarningModal, UserWarningNotification } from './components/FollowReportWarningModal';
import { RealCoin } from './components/RealCoin';
import { playCoinCelebrationSound } from './utils/audio';
import { triggerWatchCompleteCelebration } from './utils/confetti';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeWarningNotif, setActiveWarningNotif] = useState<UserWarningNotification | null>(null);
  const [showInstallScreen, setShowInstallScreen] = useState(false);
  const [missionBonusToast, setMissionBonusToast] = useState<{
    coins: number;
    titles: string[];
    key: number;
  } | null>(null);

  const { isOnline, isReconnected } = useOnlineStatus();
  useTheme(); // Initialize and apply documentElement dark class

  const handleTabChange = (newTab: string) => {
    if (newTab !== activeTab) {
      if (typeof window !== 'undefined') {
        window.history.pushState({ tab: newTab }, '', `/?tab=${newTab}`);
      }
      setActiveTab(newTab);
    }
    // Always trigger refresh & modal reset whenever home tab is selected or tapped
    if (newTab === 'home') {
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleOpenCreateModal = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'create' }, '', window.location.href);
    }
    setActiveTab('campaigns');
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  useEffect(() => {
    const handlePopState = () => {
      if (isCreateModalOpen) {
        setIsCreateModalOpen(false);
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isCreateModalOpen, activeTab]);

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

  // Unified Auth Initialization Lifecycle:
  // 1. Explicitly await getRedirectResult(auth) FIRST before any UI rendering or onAuthStateChanged listeners
  //    to prevent race conditions that lead to the 'missing initial state' error.
  // 2. Only after getRedirectResult resolves, attach onAuthStateChanged and restore/sync session before setLoading(false).
  useEffect(() => {
    const ADMIN_EMAIL = 'krja462@gmail.com';
    const ADMIN_UNLIMITED_COINS = 999999999;
    let isMounted = true;
    let unsubscribeAuth: (() => void) | null = null;

    const syncAuthenticatedFirebaseUser = async (fbUser: any): Promise<User | null> => {
      try {
        let syncedUser = await syncFirebaseUserWithFirestore(fbUser);
        if (syncedUser.email?.toLowerCase().trim() === ADMIN_EMAIL || syncedUser.id.includes('krja462')) {
          syncedUser.coins = ADMIN_UNLIMITED_COINS;
          syncedUser.isAdmin = true;
        }

        if (isMounted) {
          setUser(syncedUser);
          localStorage.setItem('atoviewer_user', JSON.stringify(syncedUser));
        }

        // Sync with server API session in background
        const res = await apiFetch('/api/auth/firebase-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': syncedUser.id,
            'x-user-email': syncedUser.email
          },
          body: JSON.stringify({
            uid: syncedUser.id,
            email: syncedUser.email,
            name: fbUser.displayName || syncedUser.name,
            avatar: fbUser.photoURL || syncedUser.avatar,
            coins: syncedUser.coins,
            atoPlayUsername: syncedUser.atoPlayUsername,
            channelName: syncedUser.channelName,
            channelImage: syncedUser.channelImage
          })
        });

        if (res?.success && res?.user) {
          const srvUser = res.user;
          const candidateImage = syncedUser.channelImage || srvUser.channelImage || '';
          const hasAtoPlay = isRealAtoPlayAvatarUrl(candidateImage) && Boolean(
            syncedUser.atoPlayUsername || srvUser.atoPlayUsername || syncedUser.channelName || srvUser.channelName
          );
          const mergedAtoPlayUsername = hasAtoPlay ? (syncedUser.atoPlayUsername || srvUser.atoPlayUsername || '') : '';
          const mergedChannelName = hasAtoPlay ? (syncedUser.channelName || srvUser.channelName || mergedAtoPlayUsername) : '';
          const mergedChannelImage = hasAtoPlay ? candidateImage : '';
          const mergedChannelBanner = hasAtoPlay ? (syncedUser.channelBanner || srvUser.channelBanner || '') : '';
          const mergedCoins = syncedUser.isAdmin ? ADMIN_UNLIMITED_COINS : Math.max(syncedUser.coins || 0, srvUser.coins || 0);

          syncedUser = {
            ...syncedUser,
            id: syncedUser.id,
            coins: mergedCoins,
            atoPlayUsername: mergedAtoPlayUsername,
            channelName: mergedChannelName,
            channelImage: mergedChannelImage,
            channelBanner: mergedChannelBanner,
            name: hasAtoPlay ? (mergedChannelName || mergedAtoPlayUsername || syncedUser.name) : (fbUser.displayName || syncedUser.name),
            avatar: hasAtoPlay ? mergedChannelImage : (fbUser.photoURL || syncedUser.avatar)
          };

          if (isMounted) {
            setUser(syncedUser);
            localStorage.setItem('atoviewer_user', JSON.stringify(syncedUser));
          }

          if (hasAtoPlay) {
            saveUserAtoPlayProfileToFirestore(syncedUser.id, {
              atoPlayUsername: mergedAtoPlayUsername,
              channelName: mergedChannelName,
              channelImage: mergedChannelImage,
              channelBanner: mergedChannelBanner,
              name: syncedUser.name,
              avatar: syncedUser.avatar,
              email: syncedUser.email
            }).catch(() => {});
          }
        }
        return syncedUser;
      } catch (err) {
        console.error('Failed to sync Firebase user session:', err);
        return null;
      }
    };

    const initAuth = async () => {
      setLoading(true);

      // STEP 1: Explicitly handle signInWithRedirect via getRedirectResult at the very start of initialization
      // and wait for it to complete BEFORE proceeding to onAuthStateChanged or rendering the main interface.
      let redirectUser: any = null;
      try {
        redirectUser = await checkRedirectResult();
        if (!redirectUser) {
          const directRedirect = await getRedirectResult(auth).catch(() => null);
          redirectUser = directRedirect?.user || null;
        }
      } catch (err) {
        console.warn('Redirect result check:', err);
      }

      if (redirectUser && redirectUser.email) {
        await syncAuthenticatedFirebaseUser(redirectUser);
        if (isMounted) {
          setLoading(false);
        }
      }

      // STEP 2: Attach onAuthStateChanged listener only AFTER getRedirectResult has settled
      unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
        if (!isMounted) return;

        if (fbUser && fbUser.email) {
          // Avoid duplicate sync if manual login is actively in-flight or if redirectUser just synced this exact user
          if (typeof window !== 'undefined' && (window as any).__atoplayLoginInFlight) {
            setLoading(false);
            return;
          }
          if (redirectUser && redirectUser.uid === fbUser.uid) {
            redirectUser = null; // already synced in Step 1
            setLoading(false);
            return;
          }
          await syncAuthenticatedFirebaseUser(fbUser);
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        // STEP 3: No active Firebase Auth user after getRedirectResult & onAuthStateChanged — check localStorage session
        const savedUserStr = localStorage.getItem('atoviewer_user');
        if (savedUserStr) {
          try {
            const parsed: User = JSON.parse(savedUserStr);
            if (parsed && parsed.id) {
              const isGuest = String(parsed.id).startsWith('guest_');
              const isAdmin = !isGuest && (parsed.email?.toLowerCase().trim() === ADMIN_EMAIL || parsed.id.includes('krja462') || parsed.isAdmin);
              if (isAdmin) {
                parsed.coins = ADMIN_UNLIMITED_COINS;
                parsed.isAdmin = true;
              }
              setUser(parsed);
              setLoading(false);

              if (!isAdmin && !isGuest) {
                getUserCoinsFromFirestore(parsed.id).then((fsCoins) => {
                  if (typeof fsCoins === 'number' && isMounted) {
                    const finalCoins = Math.max(parsed.coins || 100, fsCoins);
                    if (finalCoins !== parsed.coins) {
                      parsed.coins = finalCoins;
                      setUser({ ...parsed, coins: finalCoins });
                      localStorage.setItem('atoviewer_user', JSON.stringify({ ...parsed, coins: finalCoins }));
                    }
                  }
                }).catch(() => {});

                apiFetch('/api/user', {
                  headers: {
                    'x-user-id': parsed.id,
                    'x-user-coins': String(parsed.coins || 100)
                  }
                })
                  .then((data) => {
                    if (data?.success && data?.user && isMounted) {
                      const updatedUser = data.user;
                      if (updatedUser.email?.toLowerCase().trim() === ADMIN_EMAIL || updatedUser.isAdmin) {
                        updatedUser.coins = ADMIN_UNLIMITED_COINS;
                        updatedUser.isAdmin = true;
                      } else {
                        updatedUser.coins = Math.max(parsed.coins || 100, updatedUser.coins || 100);
                      }
                      setUser(updatedUser);
                      localStorage.setItem('atoviewer_user', JSON.stringify(updatedUser));
                      saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins, updatedUser.email);
                    }
                  })
                  .catch(() => {});
              }
              return;
            }
          } catch (err) {
            console.warn('Failed to parse saved user:', err);
          }
        }

        // STEP 4: No redirect user, no Firebase session, and no saved local session — render login / splash interface
        setLoading(false);
      });
    };

    initAuth();

    return () => {
      isMounted = false;
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
    };
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

  // Check and subscribe in real-time for fake follow warning notifications for active user
  useEffect(() => {
    if (!user || !user.id) return;
    let isMounted = true;

    const checkServerNotifications = async (includeFirestore = false) => {
      try {
        const res = await apiFetch('/api/user/notifications', {
          headers: { 'x-user-id': user.id }
        });
        if (res?.success && res.notifications?.length > 0 && isMounted) {
          setActiveWarningNotif(res.notifications[0]);
          return;
        }

        if (includeFirestore) {
          const fNotifs = await fetchUserNotificationsFromFirestore(user.id, user.email);
          if (fNotifs && fNotifs.length > 0 && isMounted) {
            setActiveWarningNotif(fNotifs[0]);
          }
        }
      } catch (err) {
        console.warn('Error checking warning notifications:', err);
      }
    };

    checkServerNotifications(true);
    const unsubRealtime = subscribeToUserNotificationsInFirestore(user.id, (incomingNotif) => {
      if (isMounted && incomingNotif && incomingNotif.read === false) {
        setActiveWarningNotif(incomingNotif);
      }
    });
    const interval = setInterval(() => checkServerNotifications(false), 20000);

    return () => {
      isMounted = false;
      unsubRealtime();
      clearInterval(interval);
    };
  }, [user?.id, user?.email]);

  const handleDismissWarning = async (notifId: string) => {
    setActiveWarningNotif(null);
    try {
      await apiFetch('/api/user/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ id: notifId })
      }).catch(() => {});

      await markNotificationReadInFirestore(notifId, user?.id).catch(() => {});
    } catch (e) {
      console.warn('Error dismissing warning notification:', e);
    }
  };

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

  // Global listener for Daily Mission completions (auto-credits studio missions & shows celebration banner)
  useEffect(() => {
    const onMissionUpdated = (e: Event) => {
      const customEvt = e as CustomEvent;
      const detail = customEvt.detail;
      if (!detail || !detail.newlyEarnedBonusCoins || detail.newlyEarnedBonusCoins <= 0) {
        return;
      }

      const bonusCoins: number = detail.newlyEarnedBonusCoins;
      const completedTitles: string[] = Array.isArray(detail.newlyCompletedTitles)
        ? detail.newlyCompletedTitles
        : ['Daily Mission Completed!'];

      // If triggered from AI Assistant or Campaigns tab (not HomeWatchFeed which already adds watch/follow mission bonus), credit user wallet here
      const isStudioCompletion = completedTitles.some((t) => t.includes('Creator Studio Task'));
      if (isStudioCompletion) {
        try {
          playCoinCelebrationSound();
        } catch {}
        triggerWatchCompleteCelebration();

        setUser((prev) => {
          if (!prev) return null;
          const nextCoins = prev.isAdmin ? 999999999 : (prev.coins || 0) + bonusCoins;
          const updated: User = { ...prev, coins: nextCoins };
          localStorage.setItem('atoviewer_user', JSON.stringify(updated));
          if (updated.id && !updated.id.startsWith('guest_')) {
            saveUserCoinsToFirestore(updated.id, updated.coins, updated.email);
            apiFetch('/api/user/sync-wallet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ coins: updated.coins })
            }).catch(() => {});
          }
          return updated;
        });
      }

      setMissionBonusToast({
        coins: bonusCoins,
        titles: completedTitles,
        key: Date.now()
      });
    };

    window.addEventListener('atoplay-mission-updated', onMissionUpdated);
    return () => window.removeEventListener('atoplay-mission-updated', onMissionUpdated);
  }, []);

  useEffect(() => {
    if (!missionBonusToast) return;
    const t = setTimeout(() => {
      setMissionBonusToast(null);
    }, 3600);
    return () => clearTimeout(t);
  }, [missionBonusToast]);

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
      if (data?.success && data.user) {
        handleUpdateUser(data.user);
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
      if (data?.success && data.user) {
        handleUpdateUser(data.user);
      }
    } catch (err) {
      console.error('Ad reward failed', err);
    }
  };

  const handleAppRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);

    // Refresh user balance from both Cloud Firestore and server API if logged in
    if (user?.id) {
      try {
        let bestCoins = user.coins || 100;
        if (!user.isAdmin && !user.id.startsWith('guest_')) {
          const fsCoins = await getUserCoinsFromFirestore(user.id).catch(() => null);
          if (typeof fsCoins === 'number') {
            bestCoins = Math.max(bestCoins, fsCoins);
          }
        }
        const res = await apiFetch('/api/user', {
          headers: { 
            'x-user-id': user.id,
            'x-user-coins': String(bestCoins)
          }
        });
        if (res?.success && res?.user) {
          const updated = {
            ...res.user,
            coins: user.isAdmin ? 999999999 : Math.max(bestCoins, res.user.coins || 100)
          };
          handleUpdateUser(updated);
        } else if (bestCoins !== user.coins) {
          handleUpdateUser({ ...user, coins: bestCoins });
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
        <p className="text-blue-200 font-medium tracking-wide">Loading AtoPlay Booster Studio...</p>
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
        setActiveTab={handleTabChange}
        coins={user.coins}
        streak={user.streak}
        onOpenCreate={handleOpenCreateModal}
        user={user}
        onLogout={handleLogout}
        onRefresh={handleAppRefresh}
        isRefreshing={isRefreshing}
        onUserUpdate={handleUpdateUser}
      />

      {/* Daily Mission Auto-Credited Bonus Toast Banner */}
      {missionBonusToast && (
        <div
          key={missionBonusToast.key}
          className="fixed inset-x-0 top-16 z-50 flex justify-center pointer-events-none px-4 animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div className="inline-flex items-center space-x-3 px-4 py-3 rounded-2xl bg-zinc-900/95 text-white shadow-2xl border border-amber-400/50 max-w-md">
            <RealCoin size="md" />
            <div className="text-left">
              <p className="text-xs font-extrabold text-amber-300 uppercase tracking-wide">
                Daily Mission Auto-Credited!
              </p>
              <p className="text-xs sm:text-sm font-bold text-white">
                {missionBonusToast.titles.join(' • ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area (Home Feed or Campaign Page) */}
      <main className="flex-1 pb-24">
        {activeTab === 'home' && (
          <HomeWatchFeed
            user={user}
            onCoinEarned={handleUpdateUser}
            setActiveTab={handleTabChange}
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
            onCloseCreateModal={handleCloseCreateModal}
            onOpenCreateModal={handleOpenCreateModal}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'ai-assistant' && (
          <AIVideoAssistant user={user} />
        )}

        {activeTab === 'studio' && (
          <CreatorStudioTools userId={user.id} />
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

      {/* Account Warning Modal for Reported Followers */}
      <FollowReportWarningModal
        notification={activeWarningNotif}
        onDismiss={handleDismissWarning}
      />

    </div>
  );
}
