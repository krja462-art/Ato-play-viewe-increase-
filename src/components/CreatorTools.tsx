import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Clock,
  AlertTriangle,
  UserCheck,
  Sparkles,
  Plus,
  X,
  Radio,
  Filter
} from 'lucide-react';
import { User, Campaign, FollowLog } from '../types';
import {
  getMyCampaignsFromFirestore,
  getPublicCampaignsFromFirestore,
  getCreatorFollowLogsFromFirestore,
  reportFakeFollowInFirestore
} from '../lib/firebase';
import {
  fetchLiveAtoPlayFollowerCount,
  extractVideoMetadata
} from '../lib/api';

interface CreatorToolsProps {
  user?: User | null;
  onOpenCreateModal?: () => void;
}

interface ChannelSummary {
  channelName: string;
  channelHandle: string;
  channelAvatar: string;
  channelUrl: string;
  channelId?: string;
  liveFollowerCount: number | null;
  isRealAtoPlay: boolean;
}

export const CreatorTools: React.FC<CreatorToolsProps> = ({ user, onOpenCreateModal }) => {
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [followLogs, setFollowLogs] = useState<FollowLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingLive, setRefreshingLive] = useState<boolean>(false);

  // Channel Link / @username search state
  const [channelSearchInput, setChannelSearchInput] = useState<string>('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected campaign filter ('all' or specific campaign.id)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');

  // Follower list filter ('all' | 'active' | 'reported') & follower name search
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'reported'>('all');
  const [followerQuery, setFollowerQuery] = useState<string>('');

  // Live channel summary state
  const [channelSummary, setChannelSummary] = useState<ChannelSummary | null>(null);

  // Reporting state: two-step confirmation per logId
  const [confirmingLogId, setConfirmingLogId] = useState<string | null>(null);
  const [reportingLogId, setReportingLogId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const formatTimeAgo = (isoString: string) => {
    if (!isoString) return 'Recently';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recently';
    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatExactDateTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Merge server & Firestore follow logs without duplicates
  const mergeFollowLogs = (serverLogs: FollowLog[], firestoreLogs: FollowLog[], campaignsMap: Map<string, Campaign>): FollowLog[] => {
    const map = new Map<string, FollowLog>();
    const addLog = (l: FollowLog) => {
      if (!l) return;
      const key = l.campaignId && l.followerUserId ? `${l.campaignId}_${l.followerUserId}` : l.id;
      const existing = map.get(key);
      const camp = campaignsMap.get(l.campaignId);
      const resolvedTitle = l.campaignTitle || camp?.channelName || camp?.title || 'AtoPlay Channel';
      if (!existing) {
        map.set(key, { ...l, campaignTitle: resolvedTitle });
      } else {
        map.set(key, {
          ...existing,
          ...l,
          id: existing.id || l.id,
          status: existing.status === 'reported' || l.status === 'reported' ? 'reported' : 'active',
          followerUsername: l.followerUsername || existing.followerUsername,
          followerName: l.followerName || existing.followerName,
          followerAvatar: l.followerAvatar || existing.followerAvatar,
          followerEmail: l.followerEmail || existing.followerEmail,
          campaignTitle: resolvedTitle
        });
      }
    };
    serverLogs.forEach(addLog);
    firestoreLogs.forEach(addLog);
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // Fetch live AtoPlay channel metadata & follower count
  const refreshLiveChannelCount = useCallback(async (
    targetUrl?: string,
    targetChannelId?: string,
    fallbackName?: string,
    fallbackAvatar?: string,
    fallbackCount?: number
  ) => {
    setRefreshingLive(true);
    try {
      const urlToCheck = targetUrl || channelSummary?.channelUrl || '';
      const idToCheck = targetChannelId || channelSummary?.channelId || '';

      if (urlToCheck || idToCheck) {
        const [liveRes, metaRes] = await Promise.all([
          fetchLiveAtoPlayFollowerCount(urlToCheck, idToCheck).catch(() => null),
          urlToCheck ? extractVideoMetadata(urlToCheck).catch(() => null) : Promise.resolve(null)
        ]);
        if (liveRes && (liveRes.isRealAtoPlay || typeof liveRes.count === 'number')) {
          setChannelSummary(prev => ({
            channelName: liveRes.channelName || metaRes?.channelName || fallbackName || prev?.channelName || user?.channelName || user?.name || 'My AtoPlay Channel',
            channelHandle: (user?.atoPlayUsername || liveRes.channelName || metaRes?.channelName || fallbackName || prev?.channelHandle || '').replace(/^@+/, ''),
            channelAvatar: metaRes?.thumbnailUrl || fallbackAvatar || prev?.channelAvatar || user?.channelImage || user?.avatar || '',
            channelUrl: idToCheck
              ? `https://atoplay.com/channels/${idToCheck}`
              : (urlToCheck || prev?.channelUrl || 'https://atoplay.com'),
            channelId: liveRes.channelId || idToCheck || prev?.channelId,
            liveFollowerCount: typeof liveRes.count === 'number' ? liveRes.count : (fallbackCount ?? prev?.liveFollowerCount ?? 0),
            isRealAtoPlay: Boolean(liveRes.isRealAtoPlay)
          }));
          return;
        }
      }
    } catch (err) {
      console.warn('Could not refresh live AtoPlay follower count:', err);
    } finally {
      setRefreshingLive(false);
    }
  }, [channelSummary?.channelUrl, channelSummary?.channelId, user]);

  // Load creator's campaigns and follower logs (or searched channel's logs)
  const loadFollowersData = useCallback(async (searchQ: string = activeSearchQuery) => {
    setLoading(true);
    setSearchError(null);
    try {
      // 1. Fetch user's campaigns + public campaigns from Firestore & backend
      const [myFsCampaigns, publicFsCampaigns, apiRes] = await Promise.all([
        user?.id ? getMyCampaignsFromFirestore(user.id).catch(() => [] as Campaign[]) : Promise.resolve([] as Campaign[]),
        getPublicCampaignsFromFirestore().catch(() => [] as Campaign[]),
        fetch(
          `/api/my-followers?${new URLSearchParams({
            ...(user?.id ? { creatorId: user.id } : {}),
            ...(searchQ ? { q: searchQ } : {})
          }).toString()}`,
          {
            headers: user?.id ? { 'x-user-id': user.id } : {}
          }
        )
          .then(r => r.json())
          .catch(() => ({ success: false, logs: [], campaigns: [] }))
      ]);

      const serverLogs: FollowLog[] = Array.isArray(apiRes?.logs) ? apiRes.logs : [];
      const serverCampaigns: Campaign[] = Array.isArray(apiRes?.campaigns) ? apiRes.campaigns : [];

      // Combine campaigns map
      const campaignMap = new Map<string, Campaign>();
      myFsCampaigns.forEach(c => campaignMap.set(c.id, c));
      publicFsCampaigns.forEach(c => {
        if (!campaignMap.has(c.id)) campaignMap.set(c.id, c);
      });
      serverCampaigns.forEach(c => {
        if (!campaignMap.has(c.id)) campaignMap.set(c.id, c);
      });

      const allCombinedCampaigns = Array.from(campaignMap.values());

      if (searchQ.trim()) {
        // Searching a specific channel URL or @username
        const cleanQ = searchQ.toLowerCase().replace(/^@+/, '').trim();
        const matchedCampaigns = allCombinedCampaigns.filter(c => {
          const cUrl = (c.videoUrl || '').toLowerCase();
          const cName = (c.channelName || '').toLowerCase().replace(/^@+/, '');
          const cUser = (c.userName || '').toLowerCase().replace(/^@+/, '');
          const cTitle = (c.title || '').toLowerCase();
          const cChanId = (c.channelId || '').toLowerCase();
          return (
            cUrl.includes(cleanQ) ||
            (cChanId.length > 4 && cleanQ.includes(cChanId)) ||
            cName.includes(cleanQ) ||
            cUser.includes(cleanQ) ||
            cTitle.includes(cleanQ)
          );
        });

        setMyCampaigns(matchedCampaigns);
        const matchedIds = matchedCampaigns.map(c => c.id);
        const matchedCreatorId = matchedCampaigns[0]?.userId;

        const firestoreLogs = (matchedCreatorId || matchedIds.length > 0)
          ? await getCreatorFollowLogsFromFirestore(matchedCreatorId, matchedIds)
          : [];

        const merged = mergeFollowLogs(serverLogs, firestoreLogs, campaignMap);
        setFollowLogs(merged);

        // Fetch live AtoPlay channel info for the searched query
        const primaryCamp = matchedCampaigns.find(c => c.campaignType === 'follower') || matchedCampaigns[0];
        const isUrlSearch = /^https?:\/\//i.test(searchQ.trim()) || searchQ.toLowerCase().includes('atoplay.com');

        if (isUrlSearch || primaryCamp) {
          const urlCandidate = isUrlSearch ? searchQ.trim() : (primaryCamp?.videoUrl || '');
          const chanIdCandidate = primaryCamp?.channelId || '';
          const [liveRes, metaRes] = await Promise.all([
            fetchLiveAtoPlayFollowerCount(urlCandidate, chanIdCandidate).catch(() => null),
            urlCandidate ? extractVideoMetadata(urlCandidate).catch(() => null) : Promise.resolve(null)
          ]);
          setChannelSummary({
            channelName: liveRes?.channelName || metaRes?.channelName || primaryCamp?.channelName || primaryCamp?.userName || 'Searched AtoPlay Channel',
            channelHandle: (liveRes?.channelName || metaRes?.channelName || primaryCamp?.channelName || cleanQ).replace(/^@+/, ''),
            channelAvatar: metaRes?.thumbnailUrl || primaryCamp?.thumbnailUrl || '',
            channelUrl: chanIdCandidate
              ? `https://atoplay.com/channels/${chanIdCandidate}`
              : (urlCandidate || 'https://atoplay.com'),
            channelId: liveRes?.channelId || chanIdCandidate || undefined,
            liveFollowerCount: typeof liveRes?.count === 'number'
              ? liveRes.count
              : (typeof metaRes?.channelFollowers === 'number'
                ? metaRes.channelFollowers
                : (primaryCamp?.channelFollowers ?? merged.filter(l => l.status !== 'reported').length)),
            isRealAtoPlay: Boolean(liveRes?.isRealAtoPlay || metaRes?.channelFollowers !== undefined)
          });
        } else {
          setChannelSummary({
            channelName: `@${cleanQ}`,
            channelHandle: cleanQ,
            channelAvatar: '',
            channelUrl: 'https://atoplay.com',
            liveFollowerCount: merged.filter(l => l.status !== 'reported').length,
            isRealAtoPlay: false
          });
          if (merged.length === 0) {
            setSearchError(`No campaign followers found for "${searchQ}". Paste your full AtoPlay channel or video link to check live AtoPlay follower counts.`);
          }
        }
      } else {
        // Default: Logged-in user's own campaigns & followers
        const creatorCampaigns = allCombinedCampaigns.filter(c => c.userId === user?.id);
        setMyCampaigns(creatorCampaigns);

        const campaignIds = creatorCampaigns.map(c => c.id);
        const firestoreLogs = await getCreatorFollowLogsFromFirestore(user?.id, campaignIds);
        const merged = mergeFollowLogs(serverLogs, firestoreLogs, campaignMap);
        setFollowLogs(merged);

        // Determine creator's primary channel details from their follower campaigns or user profile
        const primaryFollowerCamp =
          creatorCampaigns.find(c => c.campaignType === 'follower' && (c.channelId || c.videoUrl)) ||
          creatorCampaigns[0];

        const initialName =
          user?.channelName ||
          user?.atoPlayUsername ||
          primaryFollowerCamp?.channelName ||
          primaryFollowerCamp?.userName ||
          user?.name ||
          'My AtoPlay Channel';
        const initialHandle = (
          user?.atoPlayUsername ||
          user?.channelName ||
          primaryFollowerCamp?.channelName ||
          user?.name ||
          'creator'
        ).replace(/^@+/, '');
        const initialAvatar =
          user?.channelImage ||
          user?.avatar ||
          primaryFollowerCamp?.thumbnailUrl ||
          '';
        const initialUrl = primaryFollowerCamp?.channelId
          ? `https://atoplay.com/channels/${primaryFollowerCamp.channelId}`
          : (primaryFollowerCamp?.videoUrl || 'https://atoplay.com');
        const savedFollowers =
          typeof primaryFollowerCamp?.channelFollowers === 'number'
            ? primaryFollowerCamp.channelFollowers
            : null;

        setChannelSummary({
          channelName: initialName,
          channelHandle: initialHandle,
          channelAvatar: initialAvatar,
          channelUrl: initialUrl,
          channelId: primaryFollowerCamp?.channelId,
          liveFollowerCount: savedFollowers,
          isRealAtoPlay: Boolean(primaryFollowerCamp?.channelId || user?.channelImage)
        });

        // Trigger non-blocking live follower count check if we have a campaign URL or channel handle
        if (primaryFollowerCamp?.videoUrl || primaryFollowerCamp?.channelId || user?.atoPlayUsername) {
          refreshLiveChannelCount(
            primaryFollowerCamp?.videoUrl,
            primaryFollowerCamp?.channelId,
            initialName,
            initialAvatar,
            savedFollowers ?? undefined
          );
        }
      }
    } catch (err) {
      console.warn('Error loading followers tracker:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeSearchQuery]);

  useEffect(() => {
    loadFollowersData(activeSearchQuery);
  }, [user?.id, activeSearchQuery]);

  const handleChannelSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = channelSearchInput.trim();
    setSelectedCampaignId('all');
    setActiveSearchQuery(trimmed);
  };

  const handleResetToMyChannel = () => {
    setChannelSearchInput('');
    setSelectedCampaignId('all');
    setSearchError(null);
    setActiveSearchQuery('');
  };

  // Report a user who unfollowed
  const handleReportUnfollow = async (log: FollowLog) => {
    if (log.status === 'reported') return;

    // Step 1: Ask for confirmation on first tap
    if (confirmingLogId !== log.id) {
      setConfirmingLogId(log.id);
      return;
    }

    setConfirmingLogId(null);
    setReportingLogId(log.id);
    setBannerMessage(null);

    try {
      const targetCamp = myCampaigns.find(c => c.id === log.campaignId);
      const channelUrl = targetCamp?.channelId
        ? `https://atoplay.com/channels/${targetCamp.channelId}`
        : (targetCamp?.videoUrl || channelSummary?.channelUrl || 'https://atoplay.com');
      const channelTitle = targetCamp?.channelName || targetCamp?.title || log.campaignTitle || channelSummary?.channelName || 'AtoPlay Channel';

      const [apiRes] = await Promise.allSettled([
        fetch('/api/follow/report-fake', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.id ? { 'x-user-id': user.id } : {})
          },
          body: JSON.stringify({
            logId: log.id,
            followerUserId: log.followerUserId,
            followerEmail: log.followerEmail,
            followerUsername: log.followerUsername || log.followerName,
            campaignId: log.campaignId,
            creatorId: log.creatorId || user?.id,
            channelUrl,
            channelTitle
          })
        }).then(r => r.json()),
        reportFakeFollowInFirestore(log.id, log.followerUserId, {
          channelUrl,
          channelTitle,
          followerEmail: log.followerEmail,
          followerUsername: log.followerUsername || log.followerName,
          campaignId: log.campaignId
        })
      ]);

      // Optimistically mark as reported in UI
      const nowIso = new Date().toISOString();
      setFollowLogs(prev =>
        prev.map(item =>
          item.id === log.id ? { ...item, status: 'reported', reportedAt: nowIso } : item
        )
      );

      const handleLabel = log.followerUsername ? `@${log.followerUsername.replace(/^@+/, '')}` : (log.followerName || 'User');
      setBannerMessage({
        type: 'success',
        text: `Reported ${handleLabel} for unfollowing. 30 bonus coins have been deducted from their wallet and a warning notice was sent.`
      });
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: 'Could not submit report right now. Please check your connection and try again.'
      });
    } finally {
      setReportingLogId(null);
    }
  };

  // Filtered follower logs
  const filteredLogs = useMemo(() => {
    return followLogs.filter(log => {
      if (selectedCampaignId !== 'all' && log.campaignId !== selectedCampaignId) {
        return false;
      }
      if (statusFilter === 'active' && log.status === 'reported') {
        return false;
      }
      if (statusFilter === 'reported' && log.status !== 'reported') {
        return false;
      }
      if (followerQuery.trim()) {
        const q = followerQuery.toLowerCase().replace(/^@+/, '').trim();
        const uName = (log.followerUsername || '').toLowerCase();
        const dName = (log.followerName || '').toLowerCase();
        const email = (log.followerEmail || '').toLowerCase();
        const cTitle = (log.campaignTitle || '').toLowerCase();
        return uName.includes(q) || dName.includes(q) || email.includes(q) || cTitle.includes(q);
      }
      return true;
    });
  }, [followLogs, selectedCampaignId, statusFilter, followerQuery]);

  const totalAppFollowers = followLogs.length;
  const activeFollowsCount = followLogs.filter(l => l.status !== 'reported').length;
  const reportedFollowsCount = followLogs.filter(l => l.status === 'reported').length;

  return (
    <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-5 space-y-5">
      {/* Top Header & Live Channel Search Bar */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
                  Channel Followers Tracker
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                  Live AtoPlay Sync
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 mt-0.5">
                Dekhein kis-kis user ne aapke AtoPlay channel ko follow kiya hai aur unfollowers ko report karein.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadFollowersData(activeSearchQuery)}
            disabled={loading}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 active:scale-95 text-xs font-bold text-zinc-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh List</span>
          </button>
        </div>

        {/* Search any AtoPlay Channel Link or @username */}
        <form onSubmit={handleChannelSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={channelSearchInput}
              onChange={(e) => setChannelSearchInput(e.target.value)}
              placeholder="Paste AtoPlay channel/video link or @username to check followers..."
              className="w-full min-h-[44px] pl-10 pr-9 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
            />
            {channelSearchInput && (
              <button
                type="button"
                onClick={() => {
                  setChannelSearchInput('');
                  if (activeSearchQuery) handleResetToMyChannel();
                }}
                className="w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-700 flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Search className="w-4 h-4" />
              <span>Check Channel</span>
            </button>
            {activeSearchQuery && (
              <button
                type="button"
                onClick={handleResetToMyChannel}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                My Channel
              </button>
            )}
          </div>
        </form>

        {searchError && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Channel Profile & Live Follower Count Overview Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div className="flex items-center space-x-3.5 min-w-0">
            {channelSummary?.channelAvatar ? (
              <img
                src={channelSummary.channelAvatar}
                alt={channelSummary.channelName}
                className="w-14 h-14 rounded-2xl object-cover border border-zinc-200 shadow-2xs shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-extrabold text-xl flex items-center justify-center shrink-0 shadow-xs">
                {(channelSummary?.channelName || user?.name || 'A').charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 truncate">
                  {channelSummary?.channelName || user?.channelName || user?.name || 'My AtoPlay Channel'}
                </h2>
                {activeSearchQuery ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Searched Channel
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                    Your Channel
                  </span>
                )}
              </div>

              <p className="text-xs font-semibold text-blue-600 truncate mt-0.5">
                @{(channelSummary?.channelHandle || user?.atoPlayUsername || user?.name || 'atoplay_creator').replace(/^@+/, '')}
              </p>

              {channelSummary?.channelUrl && channelSummary.channelUrl !== 'https://atoplay.com' && (
                <a
                  href={channelSummary.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-blue-600 mt-1 transition-colors"
                >
                  <span>Open on AtoPlay</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Live AtoPlay Channel Follower Counter */}
          <div className="flex items-center justify-between sm:justify-end gap-3 bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Total Live AtoPlay Followers
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-zinc-900 tabular-nums">
                  {channelSummary?.liveFollowerCount !== null && channelSummary?.liveFollowerCount !== undefined
                    ? channelSummary.liveFollowerCount.toLocaleString()
                    : activeFollowsCount.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-emerald-600">Followers</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                refreshLiveChannelCount(
                  channelSummary?.channelUrl,
                  channelSummary?.channelId,
                  channelSummary?.channelName,
                  channelSummary?.channelAvatar,
                  channelSummary?.liveFollowerCount ?? undefined
                )
              }
              disabled={refreshingLive}
              title="Sync live follower count from AtoPlay"
              className="w-10 h-10 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-100 active:scale-95 text-zinc-700 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs"
            >
              <RefreshCw className={`w-4 h-4 ${refreshingLive ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3-Column Metrics Strip */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/60">
            <span className="text-[11px] font-bold text-blue-800 block">Total Followed</span>
            <span className="text-lg sm:text-xl font-black text-blue-950 tabular-nums mt-0.5 block">
              {totalAppFollowers}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
            <span className="text-[11px] font-bold text-emerald-800 block">Active Followers</span>
            <span className="text-lg sm:text-xl font-black text-emerald-950 tabular-nums mt-0.5 block">
              {activeFollowsCount}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/60">
            <span className="text-[11px] font-bold text-rose-800 block">Reported Unfollows</span>
            <span className="text-lg sm:text-xl font-black text-rose-950 tabular-nums mt-0.5 block">
              {reportedFollowsCount}
            </span>
          </div>
        </div>

        {/* Campaign Filter Selector (if creator has multiple campaigns) */}
        {myCampaigns.length > 1 && (
          <div className="pt-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-bold text-zinc-500 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" />
              Campaign:
            </span>
            <button
              type="button"
              onClick={() => setSelectedCampaignId('all')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedCampaignId === 'all'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              All Campaigns ({followLogs.length})
            </button>
            {myCampaigns.map((camp) => {
              const count = followLogs.filter(l => l.campaignId === camp.id).length;
              return (
                <button
                  key={camp.id}
                  type="button"
                  onClick={() => setSelectedCampaignId(camp.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 max-w-[200px] truncate ${
                    selectedCampaignId === camp.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {camp.channelName || camp.title} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Feedback Banner for Report Unfollow */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-semibold flex items-start justify-between gap-3 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Followers List Section */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs overflow-hidden">
        {/* Filter Bar & Follower Search */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              All ({totalAppFollowers})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Active ({activeFollowsCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('reported')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'reported'
                  ? 'bg-white text-rose-700 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Reported ({reportedFollowsCount})
            </button>
          </div>

          {/* Search inside followers list */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={followerQuery}
              onChange={(e) => setFollowerQuery(e.target.value)}
              placeholder="Filter follower @username..."
              className="w-full min-h-[38px] pl-8 pr-8 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-blue-600"
            />
            {followerQuery && (
              <button
                type="button"
                onClick={() => setFollowerQuery('')}
                className="text-zinc-400 hover:text-zinc-700 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Follower Cards List */}
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-20 rounded-2xl bg-zinc-100 animate-pulse border border-zinc-200/60"
              />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 sm:p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-sm sm:text-base font-extrabold text-zinc-900">
                {followLogs.length === 0
                  ? 'Abhi tak koi campaign follower record nahi hua hai'
                  : 'No followers match your filter'}
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {followLogs.length === 0
                  ? 'Jab bhi koi user aapke AtoPlay Follower Campaign ko follow karke verify karega, uska AtoPlay photo, @username aur follow time yahan turant dikhega.'
                  : 'Try switching the filter tab above or clearing your search text.'}
              </p>
            </div>
            {followLogs.length === 0 && onOpenCreateModal && (
              <button
                type="button"
                onClick={onOpenCreateModal}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create Follower Campaign</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredLogs.map((log) => {
              const cleanHandle = (log.followerUsername || '').trim().replace(/^@+/, '');
              const displayName = log.followerName || cleanHandle || 'AtoPlay Follower';
              const isReported = log.status === 'reported';
              const isConfirming = confirmingLogId === log.id;
              const isReporting = reportingLogId === log.id;

              return (
                <div
                  key={log.id}
                  className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-colors ${
                    isReported ? 'bg-rose-50/30' : 'hover:bg-zinc-50/80'
                  }`}
                >
                  {/* Left: Follower AtoPlay Avatar, @username, Name & Follow Timestamp */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {log.followerAvatar ? (
                        <img
                          src={log.followerAvatar}
                          alt={displayName}
                          className="w-12 h-12 rounded-2xl object-cover border border-zinc-200 shadow-2xs"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center shadow-2xs">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`w-3.5 h-3.5 rounded-full border-2 border-white absolute -bottom-0.5 -right-0.5 ${
                          isReported ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        title={isReported ? 'Reported Unfollow' : 'Verified Follower'}
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-extrabold text-zinc-900 truncate">
                          {displayName}
                        </span>
                        {cleanHandle && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60 truncate">
                            @{cleanHandle}
                          </span>
                        )}
                        {!isReported ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Followed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            Reported (-30 Coins)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-600">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          {formatTimeAgo(log.timestamp)}
                          {formatExactDateTime(log.timestamp) ? ` (${formatExactDateTime(log.timestamp)})` : ''}
                        </span>
                        {log.campaignTitle && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-zinc-600 truncate max-w-[200px]">
                              Channel: {log.campaignTitle}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Report Unfollow Action Button */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {isReported ? (
                      <div className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-100/80 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Unfollow Reported (-30 Coins)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        {isConfirming && (
                          <button
                            type="button"
                            onClick={() => setConfirmingLogId(null)}
                            className="min-h-[42px] px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isReporting}
                          onClick={() => handleReportUnfollow(log)}
                          className={`min-h-[42px] flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            isConfirming
                              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isReporting
                              ? 'Reporting...'
                              : isConfirming
                                ? 'Confirm Report (-30 Coins)'
                                : 'Report Unfollow'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Creator Protection Notice */}
      <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/70 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 space-y-1">
          <p className="font-bold">Creator Anti-Unfollow Protection</p>
          <p className="text-blue-900/80 leading-relaxed">
            Agar koi user 30 bonus coins lene ke baad aapka AtoPlay channel unfollow kar deta hai, to aap uske naam ke aage <strong>Report Unfollow</strong> button daba sakte hain. Report hote hi uske wallet se 30 coins deduct ho jayenge aur 3 warnings par uska follow bonus block ho jayega.
          </p>
        </div>
      </div>
    </div>
  );
};
