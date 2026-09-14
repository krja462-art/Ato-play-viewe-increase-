import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Campaign, format4CharId, ActiveWatchState } from '../types';
import { Play, CheckCircle2, Clock, ArrowLeft, Video, ExternalLink, RefreshCw, Award, Coins, AlertCircle, ShieldCheck, Key, UserPlus, Sparkles } from 'lucide-react';
import { RewardPopupModal } from './RewardPopupModal';
import { SessionExpiredModal } from './SessionExpiredModal';
import { AtoPlayBadge } from './AtoPlayBadge';
import { apiFetch, getWatchedIds, addWatchedId } from '../lib/api';
import { 
  updateCampaignViewsInFirestore, 
  saveUserCoinsToFirestore,
  getPublicCampaignsFromFirestore,
  seedStarterCampaignsToFirestore
} from '../lib/firebase';

interface HomeWatchFeedProps {
  user: User;
  onCoinEarned: (updatedUser: User) => void;
  setActiveTab: (tab: string) => void;
  onClaimCheckin: () => void;
  onWatchAd: () => void;
  refreshTrigger?: number;
}

const STORAGE_KEY = 'atoplay_active_watch_session';

export const HomeWatchFeed: React.FC<HomeWatchFeedProps> = ({
  user,
  onCoinEarned,
  setActiveTab,
  refreshTrigger
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Watch + Follow Unified Task Flow State
  const [userFollowedChannel, setUserFollowedChannel] = useState(false);
  const [channelCountBefore, setChannelCountBefore] = useState<number | undefined>(undefined);

  // Pop notification celebration modal state
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardData, setRewardData] = useState<{
    earnedCoins: number;
    newBalance: number;
    campaign: Campaign | null;
    baseCoins?: number;
    bonusCoins?: number;
    followedBonus?: boolean;
    message?: string;
    countBefore?: number;
    countAfter?: number;
  } | null>(null);

  // Expired session notification modal state (when returned < 60s)
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [expiredElapsed, setExpiredElapsed] = useState(0);
  const [expiredCampaign, setExpiredCampaign] = useState<Campaign | null>(null);

  const isVerifyingRef = useRef(false);
  isVerifyingRef.current = verifying;

  const userFollowedChannelRef = useRef(false);
  userFollowedChannelRef.current = userFollowedChannel;

  // Track if user actually switched away / minimized the app
  const hasLeftAppRef = useRef(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const watchedLocal = getWatchedIds(user.id);
      const watchedArray = Array.from(watchedLocal);

      // Ensure starters exist in Firestore
      seedStarterCampaignsToFirestore().catch(() => {});

      // 1. Fetch from server API
      let serverCampaigns: Campaign[] = [];
      try {
        const data = await apiFetch('/api/campaigns', {
          headers: { 
            'x-user-id': user.id,
            'x-watched-ids': watchedArray.join(',')
          }
        });
        if (data?.success && Array.isArray(data.campaigns)) {
          serverCampaigns = data.campaigns;
        }
      } catch (err) {
        console.warn('apiFetch /api/campaigns error:', err);
      }

      // 2. Fetch live public campaigns from Firestore
      let firestoreCampaigns: Campaign[] = [];
      try {
        firestoreCampaigns = await getPublicCampaignsFromFirestore(user.id);
      } catch (err) {
        console.warn('Firestore getPublicCampaigns error:', err);
      }

      // 3. Merge server and Firestore campaigns into Map by campaign.id
      const map = new Map<string, Campaign>();
      for (const c of serverCampaigns) {
        map.set(c.id, c);
      }
      for (const c of firestoreCampaigns) {
        if (!map.has(c.id)) {
          map.set(c.id, c);
        } else {
          const existing = map.get(c.id)!;
          const mergedCompletedUserIds = Array.from(new Set([
            ...(existing.completedUserIds || []),
            ...(c.completedUserIds || [])
          ]));
          map.set(c.id, {
            ...existing,
            ...c,
            viewsCompleted: Math.max(existing.viewsCompleted ?? 0, c.viewsCompleted ?? 0),
            completedViews: Math.max(existing.completedViews ?? 0, c.completedViews ?? 0),
            completedUserIds: mergedCompletedUserIds
          });
        }
      }

      // 4. Strict Public Home Video Rules:
      // - "har user home page dusre user ke campaign dikhe":
      //   c.userId !== user.id (only other users' campaigns)
      // - "ek bar jo user 60 s dekh le us user ke page se hat":
      //   !watchedLocal.has(c.id) && !c.completedUserIds?.includes(user.id)
      // - "baki all user ke page per dikhe":
      //   remains visible for all other users who haven't completed it yet
      // - active status & remaining views:
      //   c.status === 'active' && viewsCompleted < viewsRequired
      const publicFiltered = Array.from(map.values()).filter(c => {
        const reqViews = Number(c.viewsRequired ?? c.targetViews ?? 10);
        const compViews = Number(c.viewsCompleted ?? c.completedViews ?? 0);
        if (c.status !== 'active' || compViews >= reqViews) return false;
        if (c.userId === user.id) return false; // creator's own campaign
        if (watchedLocal.has(c.id)) return false; // watched locally by this user
        if (c.completedUserIds && Array.isArray(c.completedUserIds) && c.completedUserIds.includes(user.id)) return false; // watched on server/Firestore
        return true;
      });

      // Sort newest first
      publicFiltered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setCampaigns(publicFiltered);

      // Background sync all active firestore campaigns to server in-memory store
      if (firestoreCampaigns.length > 0) {
        apiFetch('/api/campaigns/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaigns: firestoreCampaigns })
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load campaigns', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [user.id, refreshTrigger]);

  // Invalidate and expire session both locally and on backend when returned < 60s
  const handleExpireSession = useCallback(async (
    sId: string,
    sToken: string,
    elapsed: number,
    camp: Campaign | null
  ) => {
    // Prevent duplicate triggers
    localStorage.removeItem(STORAGE_KEY);
    setIsPlaying(false);
    setSelectedCampaign(null);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    setTimeLeft(60);
    hasLeftAppRef.current = false;
    document.title = 'AtoPlay Booster - Video Promotion Exchange';

    // Tell backend to destroy the security token immediately
    try {
      await apiFetch('/api/watch/expire-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sId,
          sessionToken: sToken,
          reason: 'premature_app_resume'
        })
      });
    } catch (err) {
      console.error('Failed to report expired session to backend', err);
    }

    // Open Expired Notification modal
    setExpiredElapsed(elapsed);
    setExpiredCampaign(camp);
    setShowExpiredModal(true);
  }, []);

  // Direct backend verification method (verifies token, 60s elapsed, & follow bonus on server)
  const verifyWatchSession = useCallback(async (
    cId: string,
    sId: string,
    sToken: string,
    camp: Campaign,
    didFollow?: boolean
  ) => {
    if (isVerifyingRef.current) return;
    try {
      setVerifying(true);
      setErrorStatus(null);

      const isFollowClaimed = didFollow !== undefined ? didFollow : userFollowedChannelRef.current;

      const data = await apiFetch('/api/watch/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          campaignId: cId,
          sessionId: sId,
          sessionToken: sToken,
          watchDuration: 60,
          userClickedFollow: isFollowClaimed
        })
      });

      if (data?.success) {
        const earned = data.earnedCoins || (data.followed ? 90 : 60);
        if (data.user) {
          saveUserCoinsToFirestore(data.user.id, data.user.coins, data.user.email).catch(e => console.warn('Firestore user coins sync error:', e));
          onCoinEarned(data.user);
        }
        updateCampaignViewsInFirestore(cId, user.id, data.campaign?.viewsCompleted, data.campaign?.status === 'completed')
          .catch(e => console.warn('Firestore campaign view sync error:', e));

        // Immediately register watched ID in persistent local storage
        addWatchedId(user.id, cId);

        setIsCompleted(true);
        setIsPlaying(false);
        setTimeLeft(0);
        localStorage.removeItem(STORAGE_KEY);
        hasLeftAppRef.current = false;
        setCampaigns(prev => prev.filter(c => c.id !== cId));
        
        // Restore document title
        document.title = 'AtoPlay Booster - Video Promotion Exchange';

        // Trigger celebratory Pop Notification modal with exact user messaging & breakdown
        setRewardData({
          earnedCoins: earned,
          newBalance: data.user?.coins ?? (user.coins + earned),
          campaign: camp,
          baseCoins: data.baseCoins ?? 60,
          bonusCoins: data.bonusCoins ?? (data.followed ? 30 : 0),
          followedBonus: Boolean(data.followed),
          message: data.message,
          countBefore: data.countBefore,
          countAfter: data.countAfter
        });
        setShowRewardModal(true);
      } else {
        // If server expired session due to < 60s or anti-cheat
        if (data.expired) {
          localStorage.removeItem(STORAGE_KEY);
          setIsPlaying(false);
          setSelectedCampaign(null);
          setStartTime(null);
          setSessionId(null);
          setSessionToken(null);
          hasLeftAppRef.current = false;
          
          setExpiredElapsed(data.elapsedSeconds || 0);
          setExpiredCampaign(camp);
          setShowExpiredModal(true);
        } else {
          setErrorStatus(data.message || 'Verification failed.');
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (err) {
      console.error('Watch verification network error', err);
      setErrorStatus('Network error while claiming reward. Please check your connection.');
    } finally {
      setVerifying(false);
    }
  }, [user.id, onCoinEarned]);

  // 1. Recover active watch session on initial mount / app launch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: ActiveWatchState = JSON.parse(stored);
        if (parsed && parsed.userId === user.id && parsed.sessionId && parsed.startTime) {
          const elapsed = (Date.now() - parsed.startTime) / 1000;
          // Valid within 15-minute window
          if (elapsed < 15 * 60) {
            if (elapsed >= 60) {
              // 60s completed while app was closed or in background!
              setSelectedCampaign(parsed.campaign);
              setSessionId(parsed.sessionId);
              setSessionToken(parsed.sessionToken);
              setStartTime(parsed.startTime);
              setTimeLeft(0);
              setIsPlaying(false);
              verifyWatchSession(parsed.campaign.id, parsed.sessionId, parsed.sessionToken, parsed.campaign);
            } else {
              // User reopened app BEFORE 60 seconds were completed!
              // Requirement: "Agar 60 seconds se kam waqt hua ho, toh reward claim na ho aur session expire ho jaye."
              handleExpireSession(parsed.sessionId, parsed.sessionToken, elapsed, parsed.campaign);
            }
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse stored watch session', e);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user.id, verifyWatchSession, handleExpireSession]);

  // 2. onResume Lifecycle Hook & Background Tracking
  // Triggered when user returns to app from external browser/custom tab
  useEffect(() => {
    if (!isPlaying || !startTime || isCompleted || !sessionId || !sessionToken || !selectedCampaign) {
      return;
    }

    // App minimized / backgrounded handler
    const handleVisibilityHidden = () => {
      if (document.hidden) {
        hasLeftAppRef.current = true;
      }
    };

    const handleWindowBlur = () => {
      hasLeftAppRef.current = true;
    };

    // onResume handler: User resumes / returns to app
    const handleOnResume = () => {
      // Check if visible
      if (document.visibilityState === 'visible' && !isVerifyingRef.current) {
        const elapsed = (Date.now() - startTime) / 1000;

        // If user returned after switching to external browser (or after at least 3 seconds)
        if (hasLeftAppRef.current || (Date.now() - startTime) > 3000) {
          if (elapsed >= 60) {
            // Success: 60s completed! Claim coins with single-use security token
            setIsPlaying(false);
            setTimeLeft(0);
            verifyWatchSession(selectedCampaign.id, sessionId, sessionToken, selectedCampaign);
          } else {
            // Expired: User returned BEFORE 60 seconds!
            // Requirement: "Agar 60 seconds se kam waqt hua ho, toh reward claim na ho aur session expire ho jaye."
            handleExpireSession(sessionId, sessionToken, elapsed, selectedCampaign);
          }
        }
      }
    };

    // Keep page title informative while backgrounded
    const timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 60 - Math.floor(elapsed));
      setTimeLeft(remaining);

      if (document.hidden) {
        if (remaining > 0) {
          document.title = `(${remaining}s) Watching in External Browser - AtoPlay`;
        } else {
          document.title = `(🎉 60s Complete! Return to claim) AtoPlay`;
        }
      }
    }, 1000);

    document.addEventListener('visibilitychange', handleVisibilityHidden);
    document.addEventListener('visibilitychange', handleOnResume);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleOnResume);
    window.addEventListener('pageshow', handleOnResume);

    return () => {
      clearInterval(timerInterval);
      document.removeEventListener('visibilitychange', handleVisibilityHidden);
      document.removeEventListener('visibilitychange', handleOnResume);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleOnResume);
      window.removeEventListener('pageshow', handleOnResume);
      document.title = 'AtoPlay Booster - Video Promotion Exchange';
    };
  }, [isPlaying, startTime, isCompleted, sessionId, sessionToken, selectedCampaign, verifyWatchSession, handleExpireSession]);

  // Start secure watch session
  const handleSelectAndWatch = async (camp: Campaign) => {
    try {
      setStartingSession(true);
      setErrorStatus(null);
      setUserFollowedChannel(false);

      // Step 1: Start secure session on server with crypto token, timestamp & countBefore
      const data = await apiFetch('/api/watch/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ campaignId: camp.id })
      });

      if (!data?.success) {
        alert(data?.message || 'Could not start watch session. Please try again.');
        return;
      }

      const now = data.startTime || Date.now();
      const countBefore = data.countBefore;
      setChannelCountBefore(countBefore);

      const newSession: ActiveWatchState = {
        sessionId: data.sessionId,
        sessionToken: data.sessionToken,
        campaign: camp,
        startTime: now,
        durationSeconds: 60,
        userId: user.id,
        countBefore: countBefore,
        userClickedFollow: false
      };

      // Step 2: Persist token to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));

      setSessionId(data.sessionId);
      setSessionToken(data.sessionToken);
      setSelectedCampaign(camp);
      setTimeLeft(60);
      setStartTime(now);
      setIsPlaying(true);
      setIsCompleted(false);
      hasLeftAppRef.current = false;

      // Step 3: Open AtoPlay video in external browser / custom tab
      try {
        window.open(camp.videoUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('Popup open error:', e);
      }
    } catch (err) {
      console.error('Failed to start watch session', err);
      alert('Network error while starting watch session. Please try again.');
    } finally {
      setStartingSession(false);
    }
  };

  // User explicitly cancels or leaves watch screen
  const handleAbortAndLeave = async () => {
    if (timeLeft > 0 && !isCompleted) {
      const confirmLeave = confirm(
        `Watch session is active (${timeLeft}s remaining)! If you leave now, the session will expire with ZERO coins. Leave now?`
      );
      if (!confirmLeave) return;

      if (sessionId && sessionToken) {
        apiFetch('/api/watch/abort-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, sessionToken })
        }).catch(() => {});
      }
    }

    localStorage.removeItem(STORAGE_KEY);
    setSelectedCampaign(null);
    setIsPlaying(false);
    setIsCompleted(false);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    setErrorStatus(null);
    setUserFollowedChannel(false);
    hasLeftAppRef.current = false;
    document.title = 'AtoPlay Booster - Video Promotion Exchange';
    fetchCampaigns();
  };

  const handleOpenBrowserAgain = () => {
    if (selectedCampaign) {
      hasLeftAppRef.current = true;
      window.open(selectedCampaign.videoUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Manual verify button handler if user stayed in app or returned manually
  const handleManualCheckReward = () => {
    if (!startTime || !sessionId || !sessionToken || !selectedCampaign) return;
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= 60) {
      verifyWatchSession(selectedCampaign.id, sessionId, sessionToken, selectedCampaign, userFollowedChannel);
    } else {
      handleExpireSession(sessionId, sessionToken, elapsed, selectedCampaign);
    }
  };

  // Auto-load next video after claiming reward
  const handleWatchNextVideo = () => {
    setShowRewardModal(false);
    const finishedId = rewardData?.campaign?.id;
    setSelectedCampaign(null);
    setIsPlaying(false);
    setIsCompleted(false);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    setRewardData(null);
    setUserFollowedChannel(false);

    // Auto-load next available video card
    const remaining = campaigns.filter(c => c.id !== finishedId && !c.completedUserIds?.includes(user.id));
    if (remaining.length > 0) {
      const nextCamp = remaining[0];
      setTimeout(() => {
        handleSelectAndWatch(nextCamp);
      }, 300);
    } else {
      fetchCampaigns();
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center bg-white min-h-screen">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-600 font-medium">Loading Campaigns...</p>
      </div>
    );
  }

  // Active External Watch Screen (Shows security token details & 60s rule)
  if (selectedCampaign) {
    const elapsedNow = startTime ? Math.max(0, (Date.now() - startTime) / 1000) : 0;
    const progressPercent = Math.min(100, Math.round((elapsedNow / 60) * 100));
    const tokenPreview = sessionToken ? `${sessionToken.substring(0, 10)}...${sessionToken.slice(-6)}` : 'Validating...';

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 mb-28 bg-white min-h-screen">
        
        {/* Top Back Navigation */}
        <button
          onClick={handleAbortAndLeave}
          className="inline-flex items-center space-x-2 text-zinc-600 hover:text-zinc-900 font-semibold text-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Cancel & Back to Video List</span>
        </button>

        <div className="bg-white rounded-3xl overflow-hidden border border-zinc-200 shadow-xl space-y-6 p-4 sm:p-7">
          
          {/* External Browser Background Watch Banner */}
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-blue-900">
                  Video & Creator Channel Opened in External Tab
                </h4>
                <p className="text-xs text-blue-700">
                  Poore 60s video dekhein aur AtoPlay par creator channel ko Follow karein taaki total 90 coins credit ho.
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenBrowserAgain}
              className="px-4 py-2 rounded-xl bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <span>Re-open Video / Channel</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unified Reward Task Breakdown Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border border-amber-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-black text-amber-900 uppercase tracking-wide">
                  Earn: 60 Coins (Watch) + 30 Coins (Follow Bonus) = 90 Coins Total
                </span>
              </div>
              <span className="text-xs font-black text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded-full border border-amber-300">
                Max 90 Coins
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Task 1: 60s Watch */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                timeLeft === 0 
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                  : 'bg-white border-zinc-200 text-zinc-800'
              }`}>
                <div className="space-y-0.5">
                  <div className="font-bold flex items-center space-x-1.5">
                    {timeLeft === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-600 animate-spin" />
                    )}
                    <span>1. Watch 60s Video</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {timeLeft === 0 ? '60s Time Met!' : `${timeLeft}s remaining`}
                  </div>
                </div>
                <span className="font-black text-emerald-600 text-xs">+60 Coins</span>
              </div>

              {/* Task 2: Follow Creator Channel */}
              <div 
                onClick={() => setUserFollowedChannel(prev => !prev)}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  userFollowedChannel 
                    ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200' 
                    : 'bg-white border-amber-300 hover:border-amber-400'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-bold flex items-center space-x-1.5 text-zinc-900">
                    <UserPlus className={`w-4 h-4 ${userFollowedChannel ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <span>2. Follow Creator Channel</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {userFollowedChannel ? '✅ Follow clicked on AtoPlay' : 'Tap to confirm you followed'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserFollowedChannel(prev => !prev);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                    userFollowedChannel 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {userFollowedChannel ? 'Followed ✓' : '+30 Bonus'}
                </button>
              </div>
            </div>

            {typeof channelCountBefore === 'number' && (
              <div className="text-[11px] text-zinc-600 flex items-center justify-between px-1 pt-1 border-t border-amber-200/50">
                <span>Creator: <strong className="text-zinc-900">{selectedCampaign.userName || 'AtoPlay Creator'}</strong></span>
                <span>Followers at start: <strong className="text-zinc-900">{channelCountBefore}</strong></span>
              </div>
            )}
          </div>

          {/* Real Video Thumbnail Banner */}
          <div className="relative w-full aspect-video sm:h-72 rounded-2xl overflow-hidden border border-zinc-200 shadow-md bg-zinc-950">
            {/* AtoPlay Official Video Badge */}
            <AtoPlayBadge size="md" className="absolute top-3 left-3 z-20 shadow-lg" />

            <img
              src={selectedCampaign.thumbnailUrl}
              alt={selectedCampaign.title}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('unsplash.com')) {
                  target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
                }
              }}
              className="w-full h-full object-cover"
            />
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-4 sm:p-6 text-white">
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider w-max mb-2 shadow-sm">
                <Play className="w-3 h-3 fill-current" />
                <span>External 60s Session Active</span>
              </div>
              <h2 className="font-extrabold text-base sm:text-xl line-clamp-2 text-white drop-shadow-sm">
                {selectedCampaign.title}
              </h2>
              <p className="text-xs text-zinc-300 font-mono pt-1">
                ID: #{format4CharId(selectedCampaign.displayId, selectedCampaign.id)} • Creator: {selectedCampaign.userName || 'AtoPlay Creator'}
              </p>
            </div>
          </div>

          {/* Token & Security Badge Card */}
          <div className="space-y-3 p-5 rounded-2xl bg-zinc-50 border border-zinc-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Clock className={`w-5 h-5 ${timeLeft === 0 ? 'text-emerald-600' : 'text-blue-600 animate-spin'}`} />
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">60s Watch Timer</p>
                    <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      Token Validated
                    </span>
                  </div>
                  <p className="text-sm sm:text-base font-extrabold text-zinc-900 pt-0.5">
                    {timeLeft > 0 ? (
                      <span>{timeLeft}s Remaining in Background <span className="text-xs text-zinc-500 font-normal">({progressPercent}%)</span></span>
                    ) : verifying ? (
                      <span className="text-blue-600 flex items-center space-x-1.5">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Validating single-use token on server...</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="text-emerald-600 flex items-center space-x-1">
                        <CheckCircle2 className="w-4 h-4 inline" />
                        <span>60 Seconds Complete! Coins Claimed 🎉</span>
                      </span>
                    ) : errorStatus ? (
                      <span className="text-red-600 flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4 inline" />
                        <span>{errorStatus}</span>
                      </span>
                    ) : (
                      <span className="text-emerald-600">60 Seconds Completed!</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-black">
                  90 Coins Reward
                </span>
              </div>
            </div>

            {/* Countdown Progress Bar */}
            <div className="w-full h-3.5 bg-zinc-200 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  timeLeft === 0 ? 'bg-emerald-500' : 'bg-blue-600'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Security Token Live Metadata */}
            <div className="p-3 bg-white rounded-xl border border-zinc-200 flex items-center justify-between text-xs font-mono text-zinc-600">
              <div className="flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-blue-600" />
                <span>Token: <span className="text-zinc-900 font-semibold">{tokenPreview}</span></span>
              </div>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-sans font-bold">
                Anti-Cheat Protected
              </span>
            </div>

            {/* Crucial Rule Notice */}
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1">
              <div className="font-extrabold flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>Strict Security Rule (Token Invalidation):</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                App par wapas switch karne par background time calculate hota hai. Agar 60 seconds se kam waqt hua, toh reward claim nahi hoga aur session expire ho jayega.
              </p>
            </div>

            {isCompleted && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center space-x-2.5">
                <Award className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Backend token verified! Coins have been securely added to your wallet.</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col items-center space-y-3">
            <button
              onClick={handleManualCheckReward}
              disabled={verifying}
              className={`w-full py-4 px-8 rounded-2xl font-extrabold text-sm sm:text-base shadow-lg transition-all ${
                timeLeft === 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30 ring-4 ring-emerald-100 hover:scale-102 cursor-pointer'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30 hover:scale-102 cursor-pointer'
              }`}
            >
              {timeLeft === 0 
                ? (userFollowedChannel ? 'Claim 90 Coins (Watch + Follow Complete! 🎉)' : 'Claim 60 Coins (Watch Complete! 🎉)') 
                : verifying 
                  ? 'Verifying Token & Follow Status...' 
                  : `Check & Claim Reward (${timeLeft}s remaining)`}
            </button>

            <button
              onClick={handleAbortAndLeave}
              className="text-xs text-red-500 hover:text-red-700 hover:underline transition-colors cursor-pointer font-semibold"
            >
              Cancel session (expire token now)
            </button>
          </div>

        </div>

        {/* Celebratory Pop Notification Modal (60s completed) */}
        <RewardPopupModal
          isOpen={showRewardModal}
          onClose={() => {
            setShowRewardModal(false);
            setSelectedCampaign(null);
            setIsPlaying(false);
            setIsCompleted(false);
            setStartTime(null);
            setSessionId(null);
            setSessionToken(null);
            fetchCampaigns();
          }}
          earnedCoins={rewardData?.earnedCoins || 60}
          newBalance={rewardData?.newBalance || user.coins}
          campaign={rewardData?.campaign || selectedCampaign}
          baseCoins={rewardData?.baseCoins ?? 60}
          bonusCoins={rewardData?.bonusCoins ?? 30}
          followedBonus={rewardData?.followedBonus}
          message={rewardData?.message}
          countBefore={rewardData?.countBefore}
          countAfter={rewardData?.countAfter}
          onWatchNext={handleWatchNextVideo}
          onPromoteVideo={() => {
            setShowRewardModal(false);
            setSelectedCampaign(null);
            setIsPlaying(false);
            setIsCompleted(false);
            setStartTime(null);
            setSessionId(null);
            setSessionToken(null);
            setActiveTab('campaigns');
          }}
        />

        {/* Session Expired Modal (< 60s completed) */}
        <SessionExpiredModal
          isOpen={showExpiredModal}
          onClose={() => {
            setShowExpiredModal(false);
            setExpiredCampaign(null);
            setExpiredElapsed(0);
            fetchCampaigns();
          }}
          elapsedSeconds={expiredElapsed}
          campaign={expiredCampaign}
          onRetry={() => {
            setShowExpiredModal(false);
            if (expiredCampaign) {
              handleSelectAndWatch(expiredCampaign);
            }
          }}
        />

      </div>
    );
  }

  // Main Home Feed Listing
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 mb-20 bg-white min-h-screen">
      
      {/* Section Header */}
      <div className="flex items-center justify-between px-1 pt-2">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-zinc-900">
            Active Campaign Videos
          </h2>
          <p className="text-xs text-zinc-500">
            Watch any video for 60 seconds in external browser to earn 60 coins
          </p>
        </div>
        <button
          onClick={() => setActiveTab('campaigns')}
          className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs transition-colors cursor-pointer"
        >
          + Promote Video
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200 p-8 space-y-3 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Video className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-zinc-800">No Videos in Feed</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Filhal koi video campaign uplabdh nahi hai. Aap apna khud ka video promote karne ke liye "+ Promote Video" par click karein.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setActiveTab('campaigns')}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              <span>+ Promote Video</span>
            </button>
            <button
              onClick={fetchCampaigns}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {campaigns.map((camp) => {
            const shortId = format4CharId(camp.displayId, camp.id);
            return (
              <div
                key={camp.id}
                onClick={() => !startingSession && handleSelectAndWatch(camp)}
                className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs hover:shadow-md transition-all p-3 sm:p-4 cursor-pointer group"
              >
                {/* Top Row: Thumbnail + Info */}
                <div className="flex items-start space-x-3 sm:space-x-4">
                  {/* High Quality 16:9 Thumbnail */}
                  <div className="relative w-28 sm:w-36 aspect-video rounded-xl bg-zinc-950 overflow-hidden shrink-0 shadow-xs border border-zinc-200">
                    {/* AtoPlay Official Video Thumbnail Badge */}
                    <AtoPlayBadge size="sm" className="absolute top-1 left-1 z-10" />

                    <img
                      src={camp.thumbnailUrl}
                      alt={camp.title}
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.includes('unsplash.com')) {
                          target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/85 text-white text-[9px] font-black tracking-wider">
                      60s
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Title & Creator & 4-Char ID */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h3 className="font-bold text-sm sm:text-base text-zinc-900 group-hover:text-blue-600 line-clamp-2 leading-snug transition-colors">
                      {camp.title}
                    </h3>
                    
                    <div className="flex items-center flex-wrap gap-1.5 text-xs text-zinc-500 pt-0.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-800 font-mono text-[10px] font-extrabold border border-zinc-200">
                        ID: #{shortId}
                      </span>
                      <span className="text-[11px] text-zinc-500 truncate max-w-[130px]">
                        • {camp.userName || 'Creator'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Unified Reward Task Flow Badge */}
                <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border border-amber-200 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1.5 text-xs text-amber-900 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-[11px] sm:text-xs">
                      Earn: <span className="font-extrabold text-zinc-900">60 Coins (Watch)</span> + <span className="font-extrabold text-emerald-700">30 Coins (Follow Bonus)</span> = <span className="font-black text-amber-700">90 Coins Total</span>
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Verified Badge & Watch Action Button (2/100 Views removed as requested) */}
                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-zinc-100">
                  <div className="flex items-center space-x-1.5">
                    <span className="inline-flex items-center text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200/60">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600 mr-1" />
                      60s Verified
                    </span>
                  </div>

                  <button 
                    disabled={startingSession}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectAndWatch(camp);
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-95 cursor-pointer flex items-center space-x-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span>Watch & Earn (90 Coins)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Celebratory Pop Notification Modal */}
      <RewardPopupModal
        isOpen={showRewardModal}
        onClose={() => {
          setShowRewardModal(false);
          setSelectedCampaign(null);
          setIsPlaying(false);
          setIsCompleted(false);
          setStartTime(null);
          setSessionId(null);
          setSessionToken(null);
          fetchCampaigns();
        }}
        earnedCoins={rewardData?.earnedCoins || 60}
        newBalance={rewardData?.newBalance || user.coins}
        campaign={rewardData?.campaign || null}
        baseCoins={rewardData?.baseCoins ?? 60}
        bonusCoins={rewardData?.bonusCoins ?? 30}
        followedBonus={rewardData?.followedBonus}
        message={rewardData?.message}
        countBefore={rewardData?.countBefore}
        countAfter={rewardData?.countAfter}
        onWatchNext={handleWatchNextVideo}
        onPromoteVideo={() => {
          setShowRewardModal(false);
          setSelectedCampaign(null);
          setIsPlaying(false);
          setIsCompleted(false);
          setStartTime(null);
          setSessionId(null);
          setSessionToken(null);
          setActiveTab('campaigns');
        }}
      />

      {/* Session Expired Modal (If restored and < 60s) */}
      <SessionExpiredModal
        isOpen={showExpiredModal}
        onClose={() => {
          setShowExpiredModal(false);
          setExpiredCampaign(null);
          setExpiredElapsed(0);
          fetchCampaigns();
        }}
        elapsedSeconds={expiredElapsed}
        campaign={expiredCampaign}
        onRetry={() => {
          setShowExpiredModal(false);
          if (expiredCampaign) {
            handleSelectAndWatch(expiredCampaign);
          }
        }}
      />

    </div>
  );
};
