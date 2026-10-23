import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Campaign, format4CharId, ActiveWatchState } from '../types';
import { Play, CheckCircle2, Clock, ArrowLeft, Video, ExternalLink, RefreshCw, Award, Coins, AlertCircle, ShieldCheck, Key, UserPlus, Sparkles, Users } from 'lucide-react';
import { RewardPopupModal } from './RewardPopupModal';
import { SessionExpiredModal } from './SessionExpiredModal';
import { FollowChannelModal } from './FollowChannelModal';
import { FollowerRewardModal } from './FollowerRewardModal';
import { Warning4SecModal } from './Warning4SecModal';
import { AtoPlayBadge } from './AtoPlayBadge';
import { playCoinCelebrationSound } from '../utils/audio';
import { triggerWatchCompleteCelebration } from '../utils/confetti';
import { apiFetch, getWatchedIds, addWatchedId, cleanVideoUrl, openAtoPlayUrl } from '../lib/api';
import { 
  updateCampaignViewsInFirestore, 
  saveUserCoinsToFirestore,
  getPublicCampaignsFromFirestore,
  purgeStarterCampaignsFromFirestore,
  clearAllCampaignsFromFirestore
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
  const [videoStarted, setVideoStarted] = useState(false);
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
  const [isCheckingFollow, setIsCheckingFollow] = useState(false);
  const [followAutoCredited, setFollowAutoCredited] = useState(false);
  const [followCheckMessage, setFollowCheckMessage] = useState<string | null>(null);
  const followPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Dedicated Follow System Modal State
  const [followModalCampaign, setFollowModalCampaign] = useState<Campaign | null>(null);
  const [followedCampaignIds, setFollowedCampaignIds] = useState<Set<string>>(new Set());

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

  // Home Section (Video Views vs Followers) & 4-second Anti-Cheat Follower State
  const [homeSection, setHomeSection] = useState<'video' | 'follower'>('video');
  const [selectedFollowCampaign, setSelectedFollowCampaign] = useState<Campaign | null>(null);
  const [showFollowerRewardModal, setShowFollowerRewardModal] = useState(false);
  const [showWarning4SecModal, setShowWarning4SecModal] = useState(false);
  const [warningElapsed, setWarningElapsed] = useState(2);
  const followLeftTimeRef = useRef<number | null>(null);
  const activeFollowTargetRef = useRef<Campaign | null>(null);

  useEffect(() => {
    const handleFocus = () => {
      if (followLeftTimeRef.current && activeFollowTargetRef.current) {
        const elapsed = Date.now() - followLeftTimeRef.current;
        followLeftTimeRef.current = null;
        const camp = activeFollowTargetRef.current;
        activeFollowTargetRef.current = null;

        if (elapsed < 4000) {
          setWarningElapsed(Math.round(elapsed / 1000));
          setShowWarning4SecModal(true);
        } else {
          setSelectedFollowCampaign(camp);
          setShowFollowerRewardModal(true);
        }
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleStartFollowTask = (camp: Campaign) => {
    activeFollowTargetRef.current = camp;
    followLeftTimeRef.current = Date.now();
    openAtoPlayUrl(camp.videoUrl || 'https://atoplay.com', true);
  };

  const isVerifyingRef = useRef(false);
  isVerifyingRef.current = verifying;

  const userFollowedChannelRef = useRef(false);
  userFollowedChannelRef.current = userFollowedChannel;

  // Track if user actually switched away / minimized the app
  const hasLeftAppRef = useRef(false);
  const wasBackgroundedRef = useRef(false);
  const isExpiringRef = useRef(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const watchedLocal = getWatchedIds(user.id);
      const watchedArray = Array.from(watchedLocal);

      // User requested: "Home page per jitne campaign dikha rha usn sabko htao firebase se bhi htao"
      const wipedKey = 'atoplay_home_campaigns_wiped_v3';
      if (!localStorage.getItem(wipedKey)) {
        await clearAllCampaignsFromFirestore().catch(() => {});
        await apiFetch('/api/campaigns/clear-all', { method: 'POST' }).catch(() => {});
        localStorage.removeItem('atoviewer_campaigns');
        localStorage.setItem(wipedKey, 'true');
      }

      // Ensure dummy/starter campaigns are purged from Firestore & local storage
      purgeStarterCampaignsFromFirestore().catch(() => {});
      try {
        localStorage.removeItem('atoviewer_campaigns');
      } catch {}

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
        if (c.id === 'camp_starter_1' || c.id === 'camp_starter_2' || String(c.userId || '').startsWith('creator_starter')) return false;
        const reqViews = Number(c.viewsRequired ?? c.targetViews ?? 10);
        const compViews = Number(c.viewsCompleted ?? c.completedViews ?? 0);
        if (c.status !== 'active' || compViews >= reqViews) return false;
        if (c.userId === user.id) return false; // creator's own campaign
        if (watchedLocal.has(c.id)) return false; // watched locally by this user
        if (c.completedUserIds && Array.isArray(c.completedUserIds) && c.completedUserIds.includes(user.id)) return false; // watched on server/Firestore
        if (c.followedUserIds && Array.isArray(c.followedUserIds) && c.followedUserIds.includes(user.id)) return false; // followed on server/Firestore
        if (followedCampaignIds.has(c.id)) return false; // followed locally by this user
        return true;
      });

      // Sort newest first
      publicFiltered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const cleanedPublic = publicFiltered.map(c => {
        let type = c.campaignType;
        const url = (c.videoUrl || '').toLowerCase();
        const title = (c.title || '').toLowerCase();
        if (type !== 'follower' && (url.includes('/channel') || url.includes('/channels/') || url.includes('/@') || title.includes('follow'))) {
          type = 'follower';
        }
        return {
          ...c,
          campaignType: type || 'video',
          videoUrl: cleanVideoUrl(c.videoUrl || '')
        };
      });

      setCampaigns(cleanedPublic);

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

  const fetchFollowedCampaigns = useCallback(async () => {
    try {
      const data = await apiFetch('/api/user/followed-campaigns', {
        headers: { 'x-user-id': user.id }
      });
      if (data?.success && Array.isArray(data.followedCampaignIds)) {
        setFollowedCampaignIds(new Set(data.followedCampaignIds));
      }
    } catch (e) {
      console.warn('Error fetching followed campaigns:', e);
    }
  }, [user.id]);

  useEffect(() => {
    fetchCampaigns();
    fetchFollowedCampaigns();
    // Cleanly reset any open modal or video screen and return to clean home feed
    setShowExpiredModal(false);
    setExpiredCampaign(null);
    setExpiredElapsed(0);
    setShowRewardModal(false);
    setRewardData(null);
    setFollowModalCampaign(null);
    setShowFollowerRewardModal(false);
    setSelectedCampaign(null);
    setIsPlaying(false);
    setVideoStarted(false);
    setIsCompleted(false);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    isExpiringRef.current = false;
    isVerifyingRef.current = false;
    hasLeftAppRef.current = false;
    wasBackgroundedRef.current = false;
    localStorage.removeItem(STORAGE_KEY);
    document.title = 'AtoPlay Booster - Video Promotion Exchange';
  }, [user.id, refreshTrigger, fetchFollowedCampaigns]);

  const handleFollowSuccess = (campaignId: string, earnedCoins: number, updatedUser: User) => {
    setFollowedCampaignIds(prev => new Set([...prev, campaignId]));
    addWatchedId(user.id, campaignId);
    onCoinEarned(updatedUser);
    saveUserCoinsToFirestore(user.id, updatedUser.coins, user.email).catch(() => {});
    // Permanently remove from home feed view immediately
    setCampaigns(prev => prev.filter(c => c.id !== campaignId));
  };

  // Invalidate and expire session both locally and on backend when returned < 60s
  const handleExpireSession = useCallback((
    sId: string,
    sToken: string,
    elapsed: number,
    camp: Campaign | null
  ) => {
    // Prevent duplicate triggers
    if (isExpiringRef.current) return;
    isExpiringRef.current = true;

    localStorage.removeItem(STORAGE_KEY);
    setIsPlaying(false);
    setVideoStarted(false);
    setSelectedCampaign(null);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    setTimeLeft(60);
    hasLeftAppRef.current = false;
    wasBackgroundedRef.current = false;
    document.title = 'AtoPlay Booster - Video Promotion Exchange';

    // Dismiss any celebratory reward modal if it was open
    setShowRewardModal(false);
    setRewardData(null);

    // Open Expired Notification modal IMMEDIATELY
    setExpiredElapsed(elapsed);
    setExpiredCampaign(camp);
    setShowExpiredModal(true);

    // Tell backend to destroy the security token asynchronously in background
    apiFetch('/api/watch/expire-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sId,
        sessionToken: sToken,
        reason: 'premature_app_resume'
      })
    }).catch(err => {
      console.error('Failed to report expired session to backend', err);
    }).finally(() => {
      isExpiringRef.current = false;
    });
  }, []);

  // Cleanly close Session Expired modal and reset all watch state to clean home feed
  const handleCloseSessionExpired = useCallback(() => {
    isExpiringRef.current = false;
    isVerifyingRef.current = false;
    hasLeftAppRef.current = false;
    wasBackgroundedRef.current = false;
    setShowExpiredModal(false);
    setExpiredCampaign(null);
    setExpiredElapsed(0);
    setSelectedCampaign(null);
    setIsPlaying(false);
    setVideoStarted(false);
    setIsCompleted(false);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    localStorage.removeItem(STORAGE_KEY);
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Cleanly close Reward modal and reset all watch state to clean home feed
  const handleCloseRewardModal = useCallback(() => {
    setShowRewardModal(false);
    setRewardData(null);
    setSelectedCampaign(null);
    setIsPlaying(false);
    setIsCompleted(false);
    setVideoStarted(false);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    isExpiringRef.current = false;
    isVerifyingRef.current = false;
    hasLeftAppRef.current = false;
    wasBackgroundedRef.current = false;
    localStorage.removeItem(STORAGE_KEY);
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Background Follower Check Function (Auto-credits 30 coins if AtoPlay follower count increased)
  const triggerBackgroundFollowCheck = useCallback(async (camp: Campaign, beforeCount?: number) => {
    if (!camp || followAutoCredited) return;
    try {
      setIsCheckingFollow(true);
      setFollowCheckMessage('AtoPlay API se creator ke real follower count check ho rahe hain...');

      const res = await apiFetch('/api/follow/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          campaignId: camp.id,
          countBefore: beforeCount ?? channelCountBefore
        })
      });

      if (res?.success && res.verified) {
        // Follower increased on AtoPlay! Auto credit 30 coins!
        setFollowAutoCredited(true);
        setUserFollowedChannel(true);
        setIsCheckingFollow(false);
        setFollowCheckMessage(`🎉 AtoPlay API Verified! Followers increased from ${res.countBefore} to ${res.countAfter} (+1)! +30 Coins credited to your wallet!`);
        
        try {
          playCoinCelebrationSound();
        } catch {}

        if (res.user) {
          saveUserCoinsToFirestore(res.user.id, res.user.coins, res.user.email).catch(() => {});
          onCoinEarned(res.user);
        } else {
          const updated = { ...user, coins: user.coins + 30 };
          saveUserCoinsToFirestore(updated.id, updated.coins, updated.email).catch(() => {});
          onCoinEarned(updated);
        }

        setFollowedCampaignIds(prev => new Set([...prev, camp.id]));

        if (followPollingRef.current) {
          clearInterval(followPollingRef.current);
          followPollingRef.current = null;
        }
      } else if (res?.alreadyFollowed) {
        setFollowAutoCredited(true);
        setUserFollowedChannel(true);
        setIsCheckingFollow(false);
        setFollowCheckMessage('You have already claimed 30 coins for following this creator channel.');
      } else {
        setFollowCheckMessage(`AtoPlay check: Follower count did not increase yet (${res?.countBefore ?? channelCountBefore ?? '?'} -> ${res?.countAfter ?? '?'}). Please follow the creator channel on AtoPlay!`);
        setIsCheckingFollow(false);
      }
    } catch (err) {
      console.warn('Background follow check error:', err);
      setIsCheckingFollow(false);
    }
  }, [user, channelCountBefore, followAutoCredited, onCoinEarned]);

  const handleFollowFromWatchScreen = () => {
    if (!selectedCampaign || followAutoCredited) return;

    // 1. Open AtoPlay channel or video page in external tab
    const followUrl = selectedCampaign.channelId 
      ? `https://atoplay.com/channels/${selectedCampaign.channelId}`
      : cleanVideoUrl(selectedCampaign.videoUrl);
    try {
      window.open(followUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error('Failed to open external follow link:', e);
    }

    // 2. Mark intention to follow and initiate background check
    setUserFollowedChannel(true);
    setIsCheckingFollow(true);
    setFollowCheckMessage('AtoPlay par Follow karne ke baad background me follower count verify hoga...');

    // 3. Clear any existing polling
    if (followPollingRef.current) {
      clearInterval(followPollingRef.current);
    }

    // 4. Poll every 4.5 seconds for up to 5 attempts (background verification)
    let attempts = 0;
    followPollingRef.current = setInterval(() => {
      attempts++;
      triggerBackgroundFollowCheck(selectedCampaign);
      if (attempts >= 5) {
        if (followPollingRef.current) {
          clearInterval(followPollingRef.current);
          followPollingRef.current = null;
        }
      }
    }, 4500);
  };

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

      // If user already received follow coins automatically in background, don't double-claim on watch verify
      const isFollowClaimed = followAutoCredited ? false : (didFollow !== undefined ? didFollow : userFollowedChannelRef.current);

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
        triggerWatchCompleteCelebration();
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
              setVideoStarted(true);
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
      if (document.hidden || document.visibilityState === 'hidden') {
        hasLeftAppRef.current = true;
        wasBackgroundedRef.current = true;
      }
    };

    const handleWindowBlur = () => {
      hasLeftAppRef.current = true;
      wasBackgroundedRef.current = true;
    };

    // Immediate resume handler: executes on the exact instant user returns to the app
    const checkAndProcessResume = () => {
      // Check if visible in foreground and not currently processing
      if (
        document.visibilityState === 'visible' &&
        !document.hidden &&
        !isVerifyingRef.current &&
        !isExpiringRef.current
      ) {
        const elapsed = (Date.now() - startTime) / 1000;

        // If user returned after tapping follow on AtoPlay, trigger background check right away
        if (userFollowedChannel && !followAutoCredited && selectedCampaign) {
          triggerBackgroundFollowCheck(selectedCampaign);
        }

        // Check if user returned after leaving app or backgrounding
        if (wasBackgroundedRef.current || hasLeftAppRef.current) {
          if (elapsed >= 60) {
            // Success: 60s completed! Claim coins with single-use security token
            isVerifyingRef.current = true;
            setIsPlaying(false);
            setTimeLeft(0);
            verifyWatchSession(selectedCampaign.id, sessionId, sessionToken, selectedCampaign);
          } else {
            // Expired: User returned BEFORE 60 seconds!
            isExpiringRef.current = true;
            handleExpireSession(sessionId, sessionToken, elapsed, selectedCampaign);
          }
        }
      }
    };

    // Frame-based monitor: wakes up instantly as soon as tab restores to foreground
    let animFrameId: number;
    const frameLoop = () => {
      if (document.visibilityState === 'visible' && !document.hidden) {
        if (wasBackgroundedRef.current || hasLeftAppRef.current) {
          checkAndProcessResume();
        }
      }
      animFrameId = requestAnimationFrame(frameLoop);
    };
    animFrameId = requestAnimationFrame(frameLoop);

    // Keep page title informative while backgrounded & perform continuous check
    const timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 60 - Math.floor(elapsed));
      setTimeLeft(remaining);

      if (document.hidden || document.visibilityState === 'hidden') {
        hasLeftAppRef.current = true;
        wasBackgroundedRef.current = true;
        if (remaining > 0) {
          document.title = `(${remaining}s) Watching in External Browser - AtoPlay`;
        } else {
          document.title = `(🎉 60s Complete! Return to claim) AtoPlay`;
        }
      } else {
        // App is visible in foreground! Check if user came back from external browser
        if (wasBackgroundedRef.current || hasLeftAppRef.current) {
          checkAndProcessResume();
        }
      }
    }, 500);

    const onVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        handleVisibilityHidden();
      } else {
        checkAndProcessResume();
      }
    };

    // Attach lifecycle events across Android Chrome, iOS Safari, PWA, and desktop
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', checkAndProcessResume);
    window.addEventListener('pageshow', checkAndProcessResume);
    document.addEventListener('resume', checkAndProcessResume);

    return () => {
      cancelAnimationFrame(animFrameId);
      clearInterval(timerInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', checkAndProcessResume);
      window.removeEventListener('pageshow', checkAndProcessResume);
      document.removeEventListener('resume', checkAndProcessResume);
      document.title = 'AtoPlay Booster - Video Promotion Exchange';
    };
  }, [isPlaying, startTime, isCompleted, sessionId, sessionToken, selectedCampaign, verifyWatchSession, handleExpireSession]);

  // Select a campaign to view its details/watch screen without starting timer yet
  const handleSelectCampaign = (camp: Campaign) => {
    setSelectedCampaign(camp);
    setVideoStarted(false);
    setIsPlaying(false);
    setTimeLeft(60);
    setStartTime(null);
    setSessionId(null);
    setSessionToken(null);
    setErrorStatus(null);
    setUserFollowedChannel(false);
    setIsCheckingFollow(false);
    setFollowAutoCredited(false);
    setFollowCheckMessage(null);
    if (followPollingRef.current) {
      clearInterval(followPollingRef.current);
      followPollingRef.current = null;
    }
  };

  // Start video playback: Starts 60s countdown and opens AtoPlay directly
  const handleStartWatch = async (targetCamp: Campaign) => {
    if (!targetCamp) return;
    try {
      setStartingSession(true);
      setErrorStatus(null);
      setUserFollowedChannel(false);
      setIsCheckingFollow(false);
      setFollowAutoCredited(false);
      setFollowCheckMessage(null);
      if (followPollingRef.current) {
        clearInterval(followPollingRef.current);
        followPollingRef.current = null;
      }

      // Step 1: Start secure session on server with crypto token, timestamp & countBefore
      const data = await apiFetch('/api/watch/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ campaignId: targetCamp.id })
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
        campaign: targetCamp,
        startTime: now,
        durationSeconds: 60,
        userId: user.id,
        countBefore: countBefore,
        userClickedFollow: false
      };

      // Step 2: Persist token to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));

      isExpiringRef.current = false;
      isVerifyingRef.current = false;
      hasLeftAppRef.current = false;
      wasBackgroundedRef.current = false;

      setSelectedCampaign(targetCamp);
      setSessionId(data.sessionId);
      setSessionToken(data.sessionToken);
      setTimeLeft(60);
      setStartTime(now);
      setVideoStarted(true);
      setIsPlaying(true);
      setIsCompleted(false);

      // Step 3: Open AtoPlay video in external browser / custom tab
      try {
        const safeUrl = cleanVideoUrl(targetCamp.videoUrl);
        openAtoPlayUrl(safeUrl);
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

  const startVideoPlaybackAndTimer = () => {
    if (selectedCampaign) {
      handleStartWatch(selectedCampaign);
    }
  };

  // User explicitly cancels or leaves watch screen
  const handleAbortAndLeave = async () => {
    if (!videoStarted) {
      setSelectedCampaign(null);
      return;
    }

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

    if (followPollingRef.current) {
      clearInterval(followPollingRef.current);
      followPollingRef.current = null;
    }
    setIsCheckingFollow(false);
    setFollowAutoCredited(false);
    setFollowCheckMessage(null);

    localStorage.removeItem(STORAGE_KEY);
    setSelectedCampaign(null);
    setVideoStarted(false);
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
      const safeUrl = cleanVideoUrl(selectedCampaign.videoUrl);
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
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
    if (followPollingRef.current) {
      clearInterval(followPollingRef.current);
      followPollingRef.current = null;
    }
    setIsCheckingFollow(false);
    setFollowAutoCredited(false);
    setFollowCheckMessage(null);
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
        handleStartWatch(nextCamp);
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

  const videoCampaigns = campaigns.filter(c => c.campaignType !== 'follower');
  const followerCampaigns = campaigns.filter(c => c.campaignType === 'follower' || campaigns.length === 0);

  // Main Home Feed Listing
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 mb-20 bg-white min-h-screen">
      
      {/* Home Section Segmented Control: Video Views vs Followers */}
      <div className="flex rounded-xl bg-zinc-100 p-1 border border-zinc-200/80">
        <button
          onClick={() => setHomeSection('video')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
            homeSection === 'video'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Video className="w-4 h-4 text-blue-600" />
          <span>Video Views</span>
        </button>

        <button
          onClick={() => setHomeSection('follower')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
            homeSection === 'follower'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Follower Campaigns</span>
        </button>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
            {homeSection === 'video' ? "Available Videos" : "AtoPlay Channels to Follow"}
          </h2>
          <p className="text-xs text-zinc-500">
            {homeSection === 'video' 
              ? "Watch for 60 seconds to earn coins for your channel campaigns" 
              : "Open channel, follow on AtoPlay & earn coins"}
          </p>
        </div>
        <button
          onClick={() => setActiveTab('campaigns')}
          className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-xs transition-colors cursor-pointer"
        >
          + Promote
        </button>
      </div>

      {homeSection === 'follower' ? (
        <div className="space-y-3">
          {campaigns.filter(c => c.campaignType === 'follower').length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200/80 p-8 space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800">No follower campaigns active</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Be the first to promote your channel followers to real AtoPlay creators.
              </p>
              <button
                onClick={() => setActiveTab('campaigns')}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <span>+ Create Follower Campaign</span>
              </button>
            </div>
          ) : (
            campaigns.filter(c => c.campaignType === 'follower').map((camp) => {
              const shortId = format4CharId(camp.displayId, camp.id);
              return (
                <div
                  key={camp.id}
                  className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs hover:shadow-xs transition-all p-4 space-y-3"
                >
                  {/* Channel Banner Preview */}
                  {camp.thumbnailUrl && (
                    <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200 shadow-2xs">
                      <img
                        src={camp.thumbnailUrl}
                        alt="Channel Banner"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
                        }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2.5">
                        <div className="text-white text-xs font-semibold truncate">
                          {camp.channelName || camp.userName || 'AtoPlay Creator'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {!camp.thumbnailUrl && (
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm border border-emerald-100">
                          👥
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-sm text-zinc-900">{camp.channelName || camp.userName || 'AtoPlay Creator'}</h3>
                        <p className="text-xs text-zinc-500">{camp.title || 'Grow Channel Followers'}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 tabular-nums">
                      +30 Coins
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Follow channel to earn reward</span>
                    <span className="font-mono text-xs">#{shortId}</span>
                  </div>

                  <button
                    onClick={() => handleStartFollowTask(camp)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs shadow-xs flex items-center justify-center space-x-2 cursor-pointer transition-transform"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Follow Channel (+30 Coins)</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : campaigns.filter(c => c.campaignType !== 'follower').length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200/80 p-8 space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Video className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800">No videos available right now</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            All current campaigns have been watched or none are available. Click refresh or promote your own video.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setActiveTab('campaigns')}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
            >
              <span>+ Promote Video</span>
            </button>
            <button
              onClick={fetchCampaigns}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-700 font-semibold text-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.filter(c => c.campaignType !== 'follower').map((camp) => {
            const shortId = format4CharId(camp.displayId, camp.id);

            return (
              <div
                key={camp.id}
                onClick={() => !startingSession && handleStartWatch(camp)}
                className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs hover:shadow-xs hover:border-zinc-300 transition-all p-3 sm:p-4 cursor-pointer group"
              >
                {/* Top Row: Thumbnail + Info */}
                <div className="flex items-start space-x-3 sm:space-x-4">
                  {/* High Quality 16:9 Thumbnail */}
                  <div className="relative w-28 sm:w-36 aspect-video rounded-xl bg-zinc-950 overflow-hidden shrink-0 shadow-2xs border border-zinc-200/80">
                    <AtoPlayBadge size="sm" className="absolute top-1 left-1 z-10" />

                    <img
                      src={camp.thumbnailUrl}
                      alt={camp.title}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.includes('unsplash.com')) {
                          target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9px] font-semibold tabular-nums">
                      1:00
                    </div>
                  </div>

                  {/* Title & Creator & ID */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h3 className="font-semibold text-xs sm:text-sm text-zinc-900 group-hover:text-blue-600 line-clamp-2 leading-snug transition-colors">
                      {camp.title}
                    </h3>
                    
                    <div className="flex items-center flex-wrap gap-1.5 text-xs text-zinc-500 pt-0.5">
                      <span className="font-mono text-zinc-400 text-[11px]">
                        #{shortId}
                      </span>
                      <span className="text-zinc-300" aria-hidden="true">·</span>
                      <span className="text-[11px] text-zinc-600 truncate max-w-[130px]">
                        {camp.userName || 'Creator'}
                      </span>
                      {typeof camp.channelFollowers === 'number' && (
                        <>
                          <span className="text-zinc-300" aria-hidden="true">·</span>
                          <span className="text-[10px] text-zinc-400">
                            {camp.channelFollowers} Followers
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Verified Badge & Watch Button */}
                <div className="flex items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-zinc-100">
                  <div className="flex items-center space-x-2 text-xs text-zinc-500">
                    <span className="inline-flex items-center text-[11px] text-blue-600 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                      60s Watch
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span className="text-[11px] font-semibold text-zinc-700 tabular-nums">
                      +{camp.coinsReward || 60} Coins
                    </span>
                  </div>

                  {/* Watch Video Button */}
                  <button 
                    disabled={startingSession}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartWatch(camp);
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-95 cursor-pointer flex items-center space-x-1.5 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span>Watch (60s)</span>
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
        onClose={handleCloseRewardModal}
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
          handleCloseRewardModal();
          setActiveTab('campaigns');
        }}
        user={user}
        onCoinEarned={onCoinEarned}
      />

      {/* Session Expired Modal (If restored and < 60s) */}
      <SessionExpiredModal
        isOpen={showExpiredModal}
        onClose={handleCloseSessionExpired}
        elapsedSeconds={expiredElapsed}
        campaign={expiredCampaign}
        onRetry={() => {
          isExpiringRef.current = false;
          isVerifyingRef.current = false;
          hasLeftAppRef.current = false;
          wasBackgroundedRef.current = false;
          setShowExpiredModal(false);
          localStorage.removeItem(STORAGE_KEY);
          if (expiredCampaign) {
            handleSelectCampaign(expiredCampaign);
          }
        }}
      />

      {/* Follow Channel Modal (+30 Coins via AtoPlay API Follow Verification) */}
      <FollowChannelModal
        isOpen={Boolean(followModalCampaign)}
        onClose={() => setFollowModalCampaign(null)}
        campaign={followModalCampaign}
        user={user}
        onFollowSuccess={handleFollowSuccess}
        apiFetch={apiFetch}
      />

      {/* Follower Reward Modal */}
      {showFollowerRewardModal && selectedFollowCampaign && (
        <FollowerRewardModal
          isOpen={showFollowerRewardModal}
          onClose={() => {
            setShowFollowerRewardModal(false);
            setSelectedFollowCampaign(null);
            fetchCampaigns();
          }}
          campaign={selectedFollowCampaign}
          user={user}
          countBefore={selectedFollowCampaign.initialFollowers ?? selectedFollowCampaign.channelFollowers ?? 0}
          onCoinEarned={onCoinEarned}
          onFollowSuccess={handleFollowSuccess}
        />
      )}

      {/* 4-Second Rule Warning Notice Modal */}
      {showWarning4SecModal && (
        <Warning4SecModal
          isOpen={showWarning4SecModal}
          onClose={() => setShowWarning4SecModal(false)}
          elapsedSeconds={warningElapsed}
        />
      )}


      {/* Celebration Pop Reward Modal (60s Completed) */}
      <RewardPopupModal
        isOpen={showRewardModal}
        onClose={handleCloseRewardModal}
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
          handleCloseRewardModal();
          setActiveTab('campaigns');
        }}
        user={user}
        onCoinEarned={onCoinEarned}
      />

      {/* Session Expired Modal (< 60s completed) */}
      <SessionExpiredModal
        isOpen={showExpiredModal}
        onClose={handleCloseSessionExpired}
        elapsedSeconds={expiredElapsed}
        campaign={expiredCampaign}
        onReopenVideo={() => {
          isExpiringRef.current = false;
          isVerifyingRef.current = false;
          hasLeftAppRef.current = false;
          wasBackgroundedRef.current = false;
          setShowExpiredModal(false);
          localStorage.removeItem(STORAGE_KEY);
          if (expiredCampaign) {
            handleStartWatch(expiredCampaign);
          }
        }}
        onRetry={() => {
          isExpiringRef.current = false;
          isVerifyingRef.current = false;
          hasLeftAppRef.current = false;
          wasBackgroundedRef.current = false;
          setShowExpiredModal(false);
          localStorage.removeItem(STORAGE_KEY);
          if (expiredCampaign) {
            handleStartWatch(expiredCampaign);
          }
        }}
      />
    </div>
  );
};
