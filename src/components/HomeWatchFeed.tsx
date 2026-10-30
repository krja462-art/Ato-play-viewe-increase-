import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Campaign, FollowLog, format4CharId, ActiveWatchState } from '../types';
import { Play, CheckCircle2, Clock, ArrowLeft, Video, ExternalLink, RefreshCw, Award, AlertCircle, ShieldCheck, Key, UserPlus, Sparkles, Users, Loader2 } from 'lucide-react';
import { SessionExpiredModal } from './SessionExpiredModal';
import { Warning4SecModal } from './Warning4SecModal';
import { AtoPlayBadge } from './AtoPlayBadge';
import { RealCoin } from './RealCoin';
import { DailyMissionsCard } from './DailyMissionsCard';
import { recordDailyMissionAction } from '../utils/dailyMissions';
import { playCoinCelebrationSound } from '../utils/audio';
import { triggerWatchCompleteCelebration } from '../utils/confetti';
import { apiFetch, getWatchedIds, addWatchedId, addFollowedId, cleanVideoUrl, openAtoPlayUrl, fetchLiveAtoPlayFollowerCount, resolveCampaignType, getDeletedCampaignIds, isRealAtoPlayAvatarUrl } from '../lib/api';
import { 
  updateCampaignViewsInFirestore, 
  updateCampaignFollowersInFirestore,
  saveFollowLogToFirestore,
  saveUserCoinsToFirestore,
  getPublicCampaignsFromFirestore,
  purgeStarterCampaignsFromFirestore
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

  // Followed Campaign IDs Set
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

  // Animated on-screen "+60 Coins Added" / "+30 Coins Added" overlay state (replaces blocking Reward modals)
  const [videoCoinToast, setVideoCoinToast] = useState<{ coins: number; key: number } | null>(null);
  const coinToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Non-blocking toast notice when follow verification does not detect a follower increase
  const [followNoticeToast, setFollowNoticeToast] = useState<{ message: string; key: number } | null>(null);
  const followNoticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Home Section (Video Views vs Followers) & 4-second Anti-Cheat Follower State
  const [homeSection, setHomeSection] = useState<'video' | 'follower'>('video');
  const [showWarning4SecModal, setShowWarning4SecModal] = useState(false);
  const [warningElapsed, setWarningElapsed] = useState(2);
  const [verifyingFollowId, setVerifyingFollowId] = useState<string | null>(null);
  const followBaselineCountRef = useRef<number | undefined>(undefined);
  const followLeftTimeRef = useRef<number | null>(null);
  const activeFollowTargetRef = useRef<Campaign | null>(null);
  const isProcessingFollowReturnRef = useRef<boolean>(false);

  const showCoinAddedScreen = useCallback((coinsAmount: number) => {
    if (coinToastTimerRef.current) {
      clearTimeout(coinToastTimerRef.current);
    }
    setFollowNoticeToast(null);
    setVideoCoinToast({ coins: coinsAmount, key: Date.now() });
    coinToastTimerRef.current = setTimeout(() => {
      setVideoCoinToast(null);
    }, 2800);
  }, []);

  const showFollowNotice = useCallback((msg: string) => {
    if (followNoticeTimerRef.current) {
      clearTimeout(followNoticeTimerRef.current);
    }
    setFollowNoticeToast({ message: msg, key: Date.now() });
    followNoticeTimerRef.current = setTimeout(() => {
      setFollowNoticeToast(null);
    }, 3600);
  }, []);

  // Silent background verification when user returns from AtoPlay channel after >= 4s
  const verifyFollowSilentlyInBackground = useCallback(async (camp: Campaign, elapsedMs: number, initialBaseline?: number) => {
    const baseline = typeof initialBaseline === 'number'
      ? initialBaseline
      : (camp.channelFollowers ?? camp.initialFollowers ?? 0);

    try {
      const hasSyncedAtoPlay = Boolean((user.atoPlayUsername || user.channelName) && isRealAtoPlayAvatarUrl(user.channelImage));
      const syncedHandle = (user.atoPlayUsername || user.channelName || '').trim().replace(/^@+/, '');

      const requestBody = {
        campaignId: camp.id,
        countBefore: baseline,
        videoUrl: camp.videoUrl,
        channelName: camp.channelName || camp.userName,
        channelId: camp.channelId,
        creatorId: camp.userId,
        title: camp.title,
        thumbnailUrl: camp.thumbnailUrl,
        viewsRequired: camp.viewsRequired,
        viewsCompleted: camp.viewsCompleted,
        followerUsername: hasSyncedAtoPlay ? syncedHandle : '',
        visited4Sec: true,
        elapsedMs
      };

      let res = await apiFetch('/api/follow/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify(requestBody)
      });

      // If AtoPlay API took a moment to propagate the new follower, retry once silently in background
      if (!res?.verified && !res?.alreadyFollowed && !res?.restricted) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        res = await apiFetch('/api/follow/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.id
          },
          body: JSON.stringify(requestBody)
        });
      }

      const effectiveBefore = typeof res?.countBefore === 'number' ? res.countBefore : baseline;

      if (res?.verified === true && typeof res?.countAfter === 'number' && res.countAfter > effectiveBefore) {
        const bonus = res.earnedCoins || 30;
        const newCoins = (user.coins || 0) + bonus;
        const resolvedAfter = res.countAfter;

        try {
          playCoinCelebrationSound();
        } catch {}
        triggerWatchCompleteCelebration();

        const missionUpdate = recordDailyMissionAction(user.id, 'follow');
        const missionBonus = missionUpdate.newlyEarnedBonusCoins || 0;
        const baseUser: User = res.user || { ...user, coins: newCoins };
        const updatedUser: User = {
          ...baseUser,
          coins: (baseUser.coins || 0) + missionBonus
        };
        onCoinEarned(updatedUser);
        saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins, updatedUser.email).catch(() => {});

        const logToSave: FollowLog = {
          ...(res.followLog || {}),
          id: res.followLog?.id || `flog_${Date.now()}_${user.id.slice(-4)}`,
          campaignId: camp.id,
          creatorId: camp.userId,
          followerUserId: user.id,
          followerUsername: hasSyncedAtoPlay ? syncedHandle : '',
          followerEmail: user.email,
          followerAvatar: hasSyncedAtoPlay ? (user.channelImage || user.avatar) : user.avatar,
          followerName: hasSyncedAtoPlay ? (user.atoPlayUsername || user.channelName || syncedHandle || user.name) : user.name,
          timestamp: new Date().toISOString(),
          status: 'active',
          campaignTitle: camp.title
        };
        saveFollowLogToFirestore(logToSave).catch(() => {});
        updateCampaignFollowersInFirestore(camp.id, user.id, resolvedAfter).catch(() => {});

        setFollowedCampaignIds(prev => new Set([...prev, camp.id]));
        addFollowedId(user.id, camp.id);
        addWatchedId(user.id, camp.id);
        setCampaigns(prev => prev.filter(c => c.id !== camp.id));

        // Show +30 Coins Added (+ mission bonus if completed) on-screen celebration
        showCoinAddedScreen(bonus + missionBonus);
      } else if (res?.alreadyFollowed) {
        setFollowedCampaignIds(prev => new Set([...prev, camp.id]));
        addFollowedId(user.id, camp.id);
        addWatchedId(user.id, camp.id);
        setCampaigns(prev => prev.filter(c => c.id !== camp.id));
        showFollowNotice('You have already claimed +30 Coins for following this channel.');
      } else {
        showFollowNotice(
          res?.message || 'Follower increase not detected on AtoPlay yet. Please follow the channel to get +30 Coins!'
        );
      }
    } catch (err: any) {
      showFollowNotice(err?.message || 'Could not verify follow right now. Please try again.');
    } finally {
      setVerifyingFollowId(null);
      isProcessingFollowReturnRef.current = false;
    }
  }, [user, onCoinEarned, showCoinAddedScreen, showFollowNotice]);

  useEffect(() => {
    const handleReturnFromFollow = () => {
      if (document.hidden || document.visibilityState === 'hidden') return;
      if (isProcessingFollowReturnRef.current) return;
      if (followLeftTimeRef.current && activeFollowTargetRef.current) {
        const elapsed = Date.now() - followLeftTimeRef.current;
        if (elapsed < 500) return; // Ignore immediate focus bounce when opening external link

        isProcessingFollowReturnRef.current = true;
        followLeftTimeRef.current = null;
        const camp = activeFollowTargetRef.current;
        activeFollowTargetRef.current = null;

        if (elapsed < 4000) {
          setVerifyingFollowId(null);
          isProcessingFollowReturnRef.current = false;
          setWarningElapsed(Math.max(1, Math.round(elapsed / 1000)));
          setShowWarning4SecModal(true);
        } else {
          // Clearly indicate 'Verifying...' in the follower UI and verify silently in background
          setVerifyingFollowId(camp.id);
          verifyFollowSilentlyInBackground(camp, elapsed, followBaselineCountRef.current);
        }
      }
    };
    window.addEventListener('focus', handleReturnFromFollow);
    window.addEventListener('pageshow', handleReturnFromFollow);
    document.addEventListener('visibilitychange', handleReturnFromFollow);
    return () => {
      window.removeEventListener('focus', handleReturnFromFollow);
      window.removeEventListener('pageshow', handleReturnFromFollow);
      document.removeEventListener('visibilitychange', handleReturnFromFollow);
    };
  }, [verifyFollowSilentlyInBackground]);

  const handleStartFollowTask = (camp: Campaign) => {
    // Prevent double-tapping or multiple count triggers while verifying
    if (verifyingFollowId === camp.id || isProcessingFollowReturnRef.current) return;

    activeFollowTargetRef.current = camp;
    followLeftTimeRef.current = Date.now();
    const initialF = camp.channelFollowers ?? camp.initialFollowers ?? 0;
    followBaselineCountRef.current = initialF;

    // Register baseline session & fetch live AtoPlay follower count right when user opens channel
    apiFetch('/api/follow/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id
      },
      body: JSON.stringify({
        campaignId: camp.id,
        videoUrl: camp.videoUrl,
        channelId: camp.channelId,
        channelName: camp.channelName || camp.userName,
        countBefore: initialF,
        followerUsername: (user.atoPlayUsername || user.channelName || '').trim().replace(/^@+/, '')
      })
    }).then((data: any) => {
      if (data?.success && typeof data.countBefore === 'number') {
        followBaselineCountRef.current = data.countBefore;
        if (activeFollowTargetRef.current && activeFollowTargetRef.current.id === camp.id) {
          activeFollowTargetRef.current = {
            ...activeFollowTargetRef.current,
            channelFollowers: data.countBefore,
            channelId: data.channelId || activeFollowTargetRef.current.channelId
          };
        }
        setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, channelFollowers: data.countBefore } : c));
      }
    }).catch(() => {});

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
      if (campaigns.length === 0) {
        setLoading(true);
      }
      const watchedLocal = getWatchedIds(user.id);
      const watchedArray = Array.from(watchedLocal);
      const deletedSet = getDeletedCampaignIds();

      // Ensure dummy/starter campaigns are purged once per session
      purgeStarterCampaignsFromFirestore().catch(() => {});

      // 1 & 2. Fetch from server API and Firestore in parallel
      const [serverResult, firestoreResult] = await Promise.allSettled([
        apiFetch('/api/campaigns', {
          headers: { 
            'x-user-id': user.id,
            'x-watched-ids': watchedArray.join(',')
          }
        }),
        getPublicCampaignsFromFirestore(user.id)
      ]);

      let serverCampaigns: Campaign[] = [];
      if (serverResult.status === 'fulfilled' && serverResult.value?.success && Array.isArray(serverResult.value.campaigns)) {
        serverCampaigns = serverResult.value.campaigns;
      }

      let firestoreCampaigns: Campaign[] = [];
      if (firestoreResult.status === 'fulfilled' && Array.isArray(firestoreResult.value)) {
        firestoreCampaigns = firestoreResult.value;
      }

      // 3. Merge server and Firestore campaigns into Map by campaign.id, excluding deleted campaigns
      const map = new Map<string, Campaign>();
      for (const c of serverCampaigns) {
        if (!c || !c.id || deletedSet.has(c.id) || (c as any).status === 'deleted') continue;
        map.set(c.id, {
          ...c,
          campaignType: resolveCampaignType(c.campaignType, c.videoUrl)
        });
      }
      for (const c of firestoreCampaigns) {
        if (!c || !c.id || deletedSet.has(c.id) || (c as any).status === 'deleted') continue;
        if (!map.has(c.id)) {
          map.set(c.id, {
            ...c,
            campaignType: resolveCampaignType(c.campaignType, c.videoUrl)
          });
        } else {
          const existing = map.get(c.id)!;
          const mergedCompletedUserIds = Array.from(new Set([
            ...(existing.completedUserIds || []),
            ...(c.completedUserIds || [])
          ]));
          const resolvedType = resolveCampaignType(
            existing.campaignType === 'video' || c.campaignType === 'video' ? 'video' : (c.campaignType || existing.campaignType),
            c.videoUrl || existing.videoUrl
          );
          map.set(c.id, {
            ...existing,
            ...c,
            campaignType: resolvedType,
            viewsCompleted: Math.max(existing.viewsCompleted ?? 0, c.viewsCompleted ?? 0),
            completedViews: Math.max(existing.completedViews ?? 0, c.completedViews ?? 0),
            completedUserIds: mergedCompletedUserIds
          });
        }
      }

      // 4. Strict Public Home Video Rules:
      // - Hide creator's own campaigns from their own Home feed (they manage them in "My Campaigns" tab)
      // - Show all other users' active campaigns until completed (compViews >= reqViews) or deleted
      const publicFiltered = Array.from(map.values()).filter(c => {
        if (deletedSet.has(c.id) || (c as any).status === 'deleted') return false;
        if (c.id === 'camp_starter_1' || c.id === 'camp_starter_2' || String(c.userId || '').startsWith('creator_starter')) return false;
        const reqViews = Number(c.viewsRequired ?? c.targetViews ?? 10);
        const compViews = Number(c.viewsCompleted ?? c.completedViews ?? 0);
        // Do not remove campaigns from Home until views completed or deleted
        if (c.status !== 'active' || compViews >= reqViews) return false;

        // Hide creator's own campaigns from Home feed (visible only in My Campaigns tab)
        if (c.userId === user.id) return false;

        if (watchedLocal.has(c.id)) return false; // watched locally by this user
        if (c.completedUserIds && Array.isArray(c.completedUserIds) && c.completedUserIds.includes(user.id)) return false; // watched on server/Firestore
        if (c.followedUserIds && Array.isArray(c.followedUserIds) && c.followedUserIds.includes(user.id)) return false; // followed on server/Firestore
        if (followedCampaignIds.has(c.id)) return false; // followed locally by this user
        return true;
      });

      // Sort newest first
      publicFiltered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const cleanedPublic = publicFiltered.map(c => {
        const type = resolveCampaignType(c.campaignType, c.videoUrl);
        return {
          ...c,
          campaignType: type,
          userName: type === 'video' ? '' : c.userName,
          videoUrl: cleanVideoUrl(c.videoUrl || '')
        };
      });

      setCampaigns(cleanedPublic);
      setLoading(false);

      // Refresh live follower counts directly from AtoPlay API ONLY for follower campaigns (batched update)
      const followerCamps = cleanedPublic.filter(c => c.campaignType === 'follower').slice(0, 6);
      if (followerCamps.length > 0) {
        Promise.all(
          followerCamps.map(async (camp) => {
            try {
              const liveRes = await fetchLiveAtoPlayFollowerCount({
                videoUrl: camp.videoUrl,
                channelId: camp.channelId,
                channelName: camp.channelName || camp.userName
              });
              if (liveRes.isRealAtoPlay && typeof liveRes.count === 'number') {
                return {
                  id: camp.id,
                  channelFollowers: liveRes.count,
                  channelId: liveRes.channelId || camp.channelId,
                  channelName: liveRes.channelName || camp.channelName
                };
              }
            } catch {}
            return null;
          })
        ).then((results) => {
          const validUpdates = results.filter(Boolean) as Array<{ id: string; channelFollowers: number; channelId?: string; channelName?: string }>;
          if (validUpdates.length > 0) {
            const updateMap = new Map(validUpdates.map(u => [u.id, u]));
            const currentDeleted = getDeletedCampaignIds();
            setCampaigns(prev =>
              prev
                .filter(item => !currentDeleted.has(item.id))
                .map(item => {
                  const u = updateMap.get(item.id);
                  return u ? { ...item, ...u } : item;
                })
            );
          }
        }).catch(() => {});
      }

      // Background sync active firestore campaigns and deletedIds to server in-memory store
      const validFirestoreToSync = firestoreCampaigns.filter(c => c && !deletedSet.has(c.id) && (c as any).status !== 'deleted');
      if (validFirestoreToSync.length > 0 || deletedSet.size > 0) {
        apiFetch('/api/campaigns/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaigns: validFirestoreToSync,
            deletedIds: Array.from(deletedSet)
          })
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load campaigns', err);
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

  const prevRefreshTriggerRef = useRef(refreshTrigger);

  useEffect(() => {
    fetchCampaigns();
    fetchFollowedCampaigns();

    // Only reset modals and active watch state when user explicitly triggers a refresh
    if (prevRefreshTriggerRef.current !== refreshTrigger) {
      prevRefreshTriggerRef.current = refreshTrigger;
      setShowExpiredModal(false);
      setExpiredCampaign(null);
      setExpiredElapsed(0);
      setShowRewardModal(false);
      setRewardData(null);
      setVerifyingFollowId(null);
      isProcessingFollowReturnRef.current = false;
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
    }
  }, [user.id, refreshTrigger, fetchFollowedCampaigns]);

  const handleFollowSuccess = (campaignId: string, _earnedCoins: number, updatedUser: User) => {
    setVerifyingFollowId(null);
    isProcessingFollowReturnRef.current = false;
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

      const baseline = beforeCount ?? channelCountBefore ?? camp.channelFollowers ?? camp.initialFollowers ?? 0;
      const res = await apiFetch('/api/follow/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          campaignId: camp.id,
          countBefore: baseline,
          videoUrl: camp.videoUrl,
          channelName: camp.channelName || camp.userName,
          channelId: camp.channelId,
          creatorId: camp.userId,
          title: camp.title,
          thumbnailUrl: camp.thumbnailUrl,
          viewsRequired: camp.viewsRequired,
          viewsCompleted: camp.viewsCompleted,
          followerUsername: (user.atoPlayUsername || user.channelName || '').trim().replace(/^@+/, ''),
          visited4Sec: true
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
        triggerWatchCompleteCelebration();
        const missionUpdate = recordDailyMissionAction(user.id, 'follow');
        const missionBonus = missionUpdate.newlyEarnedBonusCoins || 0;
        showCoinAddedScreen(30 + missionBonus);

        if (res.user) {
          const updatedWithBonus = { ...res.user, coins: (res.user.coins || 0) + missionBonus };
          saveUserCoinsToFirestore(updatedWithBonus.id, updatedWithBonus.coins, updatedWithBonus.email).catch(() => {});
          onCoinEarned(updatedWithBonus);
        } else {
          const updated = { ...user, coins: user.coins + 30 + missionBonus };
          saveUserCoinsToFirestore(updated.id, updated.coins, updated.email).catch(() => {});
          onCoinEarned(updated);
        }

        const hasSyncedAtoPlay = Boolean((user.atoPlayUsername || user.channelName) && isRealAtoPlayAvatarUrl(user.channelImage));
        const syncedHandle = (user.atoPlayUsername || user.channelName || '').trim().replace(/^@+/, '');
        const logToSave: FollowLog = {
          ...(res.followLog || {}),
          id: res.followLog?.id || `flog_${Date.now()}_${user.id.slice(-4)}`,
          campaignId: camp.id,
          creatorId: camp.userId,
          followerUserId: user.id,
          followerUsername: hasSyncedAtoPlay ? syncedHandle : '',
          followerEmail: user.email,
          followerAvatar: hasSyncedAtoPlay ? (user.channelImage || user.avatar) : user.avatar,
          followerName: hasSyncedAtoPlay ? (user.atoPlayUsername || user.channelName || syncedHandle || user.name) : user.name,
          timestamp: new Date().toISOString(),
          status: 'active',
          campaignTitle: camp.title
        };
        saveFollowLogToFirestore(logToSave).catch(() => {});
        updateCampaignFollowersInFirestore(camp.id, user.id, res.countAfter).catch(() => {});
        setFollowedCampaignIds(prev => new Set([...prev, camp.id]));
        addFollowedId(user.id, camp.id);

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
    isVerifyingRef.current = true;
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
        try {
          playCoinCelebrationSound();
        } catch {}
        triggerWatchCompleteCelebration();
        const earned = data.earnedCoins || (data.followed ? 90 : 60);
        const missionUpdate = recordDailyMissionAction(user.id, 'watch');
        const missionBonus = missionUpdate.newlyEarnedBonusCoins || 0;
        if (data.user) {
          const updatedWithBonus = {
            ...data.user,
            coins: (data.user.coins || 0) + missionBonus
          };
          saveUserCoinsToFirestore(updatedWithBonus.id, updatedWithBonus.coins, updatedWithBonus.email).catch(e => console.warn('Firestore user coins sync error:', e));
          onCoinEarned(updatedWithBonus);
        } else if (missionBonus > 0) {
          const fallbackUser = { ...user, coins: (user.coins || 0) + earned + missionBonus };
          saveUserCoinsToFirestore(fallbackUser.id, fallbackUser.coins, fallbackUser.email).catch(() => {});
          onCoinEarned(fallbackUser);
        }
        updateCampaignViewsInFirestore(cId, user.id, data.campaign?.viewsCompleted, data.campaign?.status === 'completed')
          .catch(e => console.warn('Firestore campaign view sync error:', e));

        // Immediately register watched ID in persistent local storage
        addWatchedId(user.id, cId);

        setIsCompleted(false);
        setIsPlaying(false);
        setVideoStarted(false);
        setSelectedCampaign(null);
        setStartTime(null);
        setSessionId(null);
        setSessionToken(null);
        setTimeLeft(60);
        localStorage.removeItem(STORAGE_KEY);
        hasLeftAppRef.current = false;
        wasBackgroundedRef.current = false;
        setCampaigns(prev => prev.filter(c => c.id !== cId));
        
        // Restore document title
        document.title = 'AtoPlay Booster - Creator Community & AI Growth Studio';

        // Trigger animated on-screen "+60 Coins Added" toast that automatically fades out
        if (coinToastTimerRef.current) {
          clearTimeout(coinToastTimerRef.current);
        }
        setVideoCoinToast({ coins: earned + missionBonus, key: Date.now() });
        coinToastTimerRef.current = setTimeout(() => {
          setVideoCoinToast(null);
        }, 2800);
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
      isVerifyingRef.current = false;
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

    // If window already lost focus or became hidden when external tab opened before effect mounted
    if (document.hidden || document.visibilityState === 'hidden' || !document.hasFocus()) {
      hasLeftAppRef.current = true;
      wasBackgroundedRef.current = true;
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
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed < 0.6) return;

      // Check if visible in foreground and not currently processing
      if (
        document.visibilityState === 'visible' &&
        !document.hidden &&
        !isVerifyingRef.current &&
        !isExpiringRef.current
      ) {
        // If user returned after tapping follow on AtoPlay, trigger background check right away
        if (userFollowedChannel && !followAutoCredited && selectedCampaign) {
          triggerBackgroundFollowCheck(selectedCampaign);
        }

        // Check if user returned after leaving app or backgrounding
        if (wasBackgroundedRef.current || hasLeftAppRef.current) {
          if (elapsed >= 60) {
            // Success: 60s completed! Claim coins with single-use security token
            setIsPlaying(false);
            setTimeLeft(0);
            verifyWatchSession(selectedCampaign.id, sessionId, sessionToken, selectedCampaign);
          } else {
            // Expired: User returned BEFORE 60 seconds!
            handleExpireSession(sessionId, sessionToken, elapsed, selectedCampaign);
          }
        }
      }
    };

    // Keep page title informative while backgrounded & perform periodic check without 60fps loop
    const timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 60 - Math.floor(elapsed));
      setTimeLeft(prev => (prev !== remaining ? remaining : prev));

      if (document.hidden || document.visibilityState === 'hidden' || !document.hasFocus()) {
        hasLeftAppRef.current = true;
        wasBackgroundedRef.current = true;
        if (remaining > 0) {
          document.title = `(${remaining}s) Watching in External Browser - AtoPlay`;
        } else {
          document.title = `(🎉 60s Complete! Return to claim) AtoPlay`;
        }
      } else {
        // App is visible & focused in foreground! Check if user came back from external browser
        if (wasBackgroundedRef.current || hasLeftAppRef.current) {
          checkAndProcessResume();
        }
      }
    }, 500);

    const onVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        handleVisibilityHidden();
      } else {
        hasLeftAppRef.current = true;
        wasBackgroundedRef.current = true;
        checkAndProcessResume();
      }
    };

    const onFocusOrPageShow = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= 0.6) {
        hasLeftAppRef.current = true;
        wasBackgroundedRef.current = true;
        checkAndProcessResume();
      }
    };

    // Attach lifecycle events across Android Chrome, iOS Safari, PWA, and desktop
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', onFocusOrPageShow);
    window.addEventListener('pageshow', onFocusOrPageShow);
    document.addEventListener('resume', onFocusOrPageShow);

    return () => {
      clearInterval(timerInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', onFocusOrPageShow);
      window.removeEventListener('pageshow', onFocusOrPageShow);
      document.removeEventListener('resume', onFocusOrPageShow);
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
      setShowExpiredModal(false);
      setShowRewardModal(false);
      setErrorStatus(null);
      setUserFollowedChannel(false);
      setIsCheckingFollow(false);
      setFollowAutoCredited(false);
      setFollowCheckMessage(null);
      if (followPollingRef.current) {
        clearInterval(followPollingRef.current);
        followPollingRef.current = null;
      }

      const now = Date.now();
      const fallbackSessionId = `ws_${now}`;
      const fallbackToken = `sec_tok_${now}`;

      isExpiringRef.current = false;
      isVerifyingRef.current = false;
      hasLeftAppRef.current = false;
      wasBackgroundedRef.current = false;

      const initialSession: ActiveWatchState = {
        sessionId: fallbackSessionId,
        sessionToken: fallbackToken,
        campaign: targetCamp,
        startTime: now,
        durationSeconds: 60,
        userId: user.id,
        countBefore: targetCamp.channelFollowers,
        userClickedFollow: false
      };

      // Persist immediately & set active watch state before opening external link
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialSession));
      setSelectedCampaign(targetCamp);
      setSessionId(fallbackSessionId);
      setSessionToken(fallbackToken);
      setTimeLeft(60);
      setStartTime(now);
      setVideoStarted(true);
      setIsPlaying(true);
      setIsCompleted(false);

      // Open AtoPlay video in external browser / custom tab synchronously on user tap
      try {
        const safeUrl = cleanVideoUrl(targetCamp.videoUrl);
        openAtoPlayUrl(safeUrl);
      } catch (e) {
        console.error('Popup open error:', e);
      }

      // Sync official session token & baseline follower count with server in background
      apiFetch('/api/watch/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ campaignId: targetCamp.id })
      }).then((data) => {
        if (data?.success && data.sessionId && data.sessionToken) {
          setChannelCountBefore(data.countBefore);
          setSessionId(data.sessionId);
          setSessionToken(data.sessionToken);
          const updatedSession: ActiveWatchState = {
            ...initialSession,
            sessionId: data.sessionId,
            sessionToken: data.sessionToken,
            countBefore: data.countBefore
          };
          // Only update STORAGE_KEY if session is still active
          if (localStorage.getItem(STORAGE_KEY)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
          }
        }
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to start watch session', err);
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

  // Main Home Feed Listing
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 mb-20 bg-white min-h-screen relative scroll-smooth">
      
      {/* Animated On-Screen +30 Coin Add / +60 Coin Add Overlay (Auto-dismissing with 3D Real Coin) */}
      {videoCoinToast && (
        <div
          key={videoCoinToast.key}
          className="fixed inset-x-0 top-20 z-50 flex justify-center pointer-events-none px-4 animate-bounce"
        >
          <div className="inline-flex items-center space-x-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 text-white font-black text-base sm:text-lg shadow-2xl border-2 border-white/80">
            <RealCoin size="lg" />
            <span className="tabular-nums">+{videoCoinToast.coins} Coin Added!</span>
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
          </div>
        </div>
      )}

      {/* Non-blocking Follow Verification Notice Toast */}
      {followNoticeToast && (
        <div
          key={followNoticeToast.key}
          className="fixed inset-x-0 top-20 z-50 flex justify-center pointer-events-none px-4 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="inline-flex items-center space-x-2.5 px-4 py-3 rounded-2xl bg-zinc-900/95 text-white font-semibold text-xs sm:text-sm shadow-xl border border-zinc-700 max-w-md text-center">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{followNoticeToast.message}</span>
          </div>
        </div>
      )}
      
      {/* Fixed/Sticky Top Header on Home Feed: Daily Missions Card + Video/Follower Toggle Buttons */}
      <div className="sticky top-16 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pt-3 pb-3 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] space-y-2.5">
        {/* Collapsible Daily Missions Tracker Card at Top of Home Feed */}
        <DailyMissionsCard
          userId={user.id}
          onNavigateAction={(target) => {
            if (target === 'video') {
              setHomeSection('video');
            } else if (target === 'follower') {
              setHomeSection('follower');
            } else if (target === 'ai-assistant') {
              setActiveTab('ai-assistant');
            }
          }}
        />

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
        <div className="flex items-center justify-between px-1 pt-0.5">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">
              {homeSection === 'video' ? "Available Videos" : "AtoPlay Channels to Follow"}
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-500">
              {homeSection === 'video' 
                ? "Watch for 60 seconds to earn coins for your channel campaigns" 
                : "Open channel, follow on AtoPlay & earn coins"}
            </p>
          </div>
          <button
            onClick={() => setActiveTab('campaigns')}
            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-xs transition-colors cursor-pointer shrink-0"
          >
            + Promote
          </button>
        </div>
      </div>

      {/* Smoothly Scrollable Video & Follower Campaigns List Below Fixed Top Header */}
      <div className="pt-4">

      {homeSection === 'follower' ? (
        <div className="space-y-3">
          {campaigns.filter(c => c.campaignType === 'follower').length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200/80 p-8 space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800">No follower campaigns available right now</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Promote your AtoPlay channel in My Campaigns or check back soon for new channels to follow.
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
                          {camp.channelName || 'AtoPlay Channel'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {!camp.thumbnailUrl && (
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm border border-emerald-100">
                          <Users className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-sm text-zinc-900">{camp.channelName || 'AtoPlay Channel'}</h3>
                        <p className="text-xs text-zinc-500">{camp.title || 'Grow Channel Followers'}</p>
                      </div>
                    </div>
                    <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-900 bg-gradient-to-b from-amber-50 to-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-300/80 shadow-2xs tabular-nums">
                      <RealCoin size="sm" />
                      <span>+30 Coins</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    {verifyingFollowId === camp.id ? (
                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 font-bold border border-amber-200">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                        <span>Verifying...</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-emerald-700">
                        Subscribe on AtoPlay to claim reward
                      </span>
                    )}
                    <span className="font-mono text-xs text-zinc-400">#{shortId}</span>
                  </div>

                  <button
                    disabled={verifyingFollowId === camp.id}
                    onClick={() => handleStartFollowTask(camp)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed active:scale-95 text-white font-semibold text-xs shadow-xs flex items-center justify-center space-x-2 cursor-pointer transition-transform"
                  >
                    {verifyingFollowId === camp.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        <span>Follow Channel (+30 Coins)</span>
                      </>
                    )}
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
            All current campaigns have been watched or none are available. Click refresh or manage your campaigns in My Campaigns.
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

                  {/* Title & ID Only (No User Name, No Creator Controls) */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h3 className="font-semibold text-xs sm:text-sm text-zinc-900 group-hover:text-blue-600 line-clamp-2 leading-snug transition-colors">
                      {camp.title}
                    </h3>
                    
                    <div className="flex items-center flex-wrap gap-1.5 text-xs text-zinc-500 pt-0.5">
                      <span className="font-mono text-zinc-400 text-[11px]">
                        #{shortId}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Verified 60s Watch + 3D Real Coin Reward & Watch Action Button */}
                <div className="flex items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-zinc-100">
                  <div className="flex items-center space-x-2 text-xs text-zinc-500">
                    <span className="inline-flex items-center text-[11px] text-blue-600 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                      60s Watch
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-900 tabular-nums">
                      <RealCoin size="sm" />
                      <span>+{camp.coinsReward || 60} Coins</span>
                    </span>
                  </div>

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
      </div>

      {/* 4-Second Rule Warning Notice Modal */}
      {showWarning4SecModal && (
        <Warning4SecModal
          isOpen={showWarning4SecModal}
          onClose={() => setShowWarning4SecModal(false)}
          elapsedSeconds={warningElapsed}
        />
      )}

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
