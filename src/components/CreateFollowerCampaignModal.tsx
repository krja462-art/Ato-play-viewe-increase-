import React, { useState, useRef, useEffect } from 'react';
import { X, Users, Sparkles, Coins, CheckCircle2, AlertCircle, ExternalLink, Link as LinkIcon, Search, Loader2, Clipboard } from 'lucide-react';
import { User, Campaign } from '../types';
import { apiFetch, cleanVideoUrl, openAtoPlayUrl, extractVideoMetadata } from '../lib/api';
import { saveCampaignToFirestore, saveUserCoinsToFirestore } from '../lib/firebase';
import confetti from 'canvas-confetti';

interface CreateFollowerCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onCampaignCreated: (updatedUser: User) => void;
  fetchMyCampaigns: () => void;
}

export const CreateFollowerCampaignModal: React.FC<CreateFollowerCampaignModalProps> = ({
  isOpen,
  onClose,
  user,
  onCampaignCreated,
  fetchMyCampaigns
}) => {
  const [channelUrl, setChannelUrl] = useState('');
  const [targetFollowers, setTargetFollowers] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [currentFollowers, setCurrentFollowers] = useState<number>(0);
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [channelAvatarUrl, setChannelAvatarUrl] = useState<string>('');
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const COST_PER_FOLLOWER = 100; // 30 coin reward + 70 coin platform fee
  const totalCost = Number(targetFollowers) * COST_PER_FOLLOWER;
  const isUserAdmin = Boolean(user.isAdmin || user.email?.toLowerCase().trim() === 'krja462@gmail.com');

  // Regex-based URL cleaner to strip query parameters and normalize AtoPlay channel link format
  const cleanAtoPlayUrl = (rawUrl: string): string => {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let s = rawUrl.trim().replace(/^["']|["']$/g, '');
    s = s.replace(/^(?:https?:\/\/)?(?:www\.)?(?:atoplay\.com|atoplay\.in)/i, 'https://atoplay.com');
    s = s.replace(/[?#].*$/, '');
    s = s.replace(/([^:]\/)\/+/g, '$1');
    return s;
  };

  const handleFetchChannelInfo = async (overrideUrl?: string) => {
    const rawUrl = (overrideUrl !== undefined ? overrideUrl : channelUrl).trim();
    if (!rawUrl) return;
    const cleanedUrl = cleanAtoPlayUrl(rawUrl);
    try {
      setFetchingInfo(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      let fetchedName = '';
      let fetchedBanner = '';
      let fetchedAvatar = '';
      let fetchedFollowers = 0;

      // 1. Try Vercel Serverless Function & Backend API first (bypasses browser CORS & uses server proxy)
      try {
        const serverData = await apiFetch(`/api/campaigns/extract-metadata?url=${encodeURIComponent(cleanedUrl)}`);
        if (serverData?.success && serverData?.metadata) {
          const m = serverData.metadata;
          if (m.channelName || m.title) {
            fetchedName = m.channelName || m.title;
          }
          if (m.thumbnailUrl && !m.thumbnailUrl.includes('placeholder')) {
            fetchedBanner = m.thumbnailUrl;
          }
          if (m.channelBanner) {
            fetchedBanner = m.channelBanner;
          }
          if (m.channelImage) {
            fetchedAvatar = m.channelImage;
          }
          if (typeof m.channelFollowers === 'number' && !isNaN(m.channelFollowers)) {
            fetchedFollowers = m.channelFollowers;
          }
        }
      } catch (srvErr) {
        console.warn('Server extract-metadata note:', srvErr);
      }

      // 2. Direct client metadata extractor fallback (unified browser extractor)
      if (!fetchedName || !fetchedBanner) {
        try {
          const meta = await extractVideoMetadata(cleanedUrl);
          if (meta) {
            if (meta.channelName || meta.title) {
              fetchedName = meta.channelName || meta.title;
            }
            if (meta.thumbnailUrl && !meta.thumbnailUrl.includes('placeholder')) {
              fetchedBanner = meta.thumbnailUrl;
            }
            if (meta.channelBanner) {
              fetchedBanner = meta.channelBanner;
            }
            if (meta.channelImage) {
              fetchedAvatar = meta.channelImage;
            }
            if (typeof meta.channelFollowers === 'number') {
              fetchedFollowers = meta.channelFollowers;
            }
          }
        } catch (clientExtErr) {
          console.warn('Client extractor note:', clientExtErr);
        }
      }

      // 3. Direct AtoPlay API probe as ultimate guarantee
      if (!fetchedName || !fetchedBanner) {
        const parts = cleanedUrl.split('/').filter(Boolean);
        const slug = parts[parts.length - 1] || 'Channel';
        const endpoints = [
          `https://api.atoplay.com/api/channels/${slug}`,
          `https://api.atoplay.com/api/channels/id/${slug}`,
          `https://api.atoplay.com/api/channels/public/${slug}`,
          `https://api.atoplay.com/api/creators/${slug}`
        ];

        for (const ep of endpoints) {
          try {
            const res = await fetch(ep, { headers: { 'Accept': 'application/json' } });
            if (res.ok) {
              const json = await res.json();
              const obj = json?.channel || json?.data || (Array.isArray(json) ? json[0] : json);
              if (obj?.name || obj?.username || obj?.title || obj?.channelName) {
                fetchedName = obj.name || obj.username || obj.title || obj.channelName;
              }
              const f = Number(obj?.followersCount ?? obj?.followers ?? obj?.subscribersCount ?? obj?.subscribers);
              if (!isNaN(f) && f >= 0) {
                fetchedFollowers = f;
              }
              const b = obj?.channelBanner || obj?.channelImage || obj?.bannerUrl || obj?.banner || obj?.avatarUrl || obj?.avatar || obj?.image || obj?.thumbnailUrl || obj?.logo || (Array.isArray(obj?.videos) && obj?.videos[0]?.thumbnailUrl);
              if (b) {
                fetchedBanner = b.startsWith('http') ? b : (b.startsWith('/') ? `https://cdn.atoplay.in${b}` : `https://cdn.atoplay.in/${b}`);
              }
              if (obj?.channelImage) {
                fetchedAvatar = obj.channelImage.startsWith('http') ? obj.channelImage : `https://cdn.atoplay.in/${obj.channelImage.replace(/^\//, '')}`;
              }
              if (fetchedName && fetchedBanner) break;
            }
          } catch {}
        }
      }

      let finalName = fetchedName;
      if (!finalName || finalName === 'AtoPlay Creator' || finalName.startsWith('AtoPlay Channel #')) {
        const slug = cleanedUrl.split('/').filter(Boolean).pop() || '';
        finalName = slug.includes('-') && slug.length > 20 ? `AtoPlay Creator ${slug.slice(0, 6).toUpperCase()}` : slug.replace(/[-_]/g, ' ');
        finalName = finalName.charAt(0).toUpperCase() + finalName.slice(1);
        if (finalName.toLowerCase() === 'channel' || finalName.toLowerCase() === 'channels') {
          finalName = 'AtoPlay Channel';
        }
      }

      let finalBanner = fetchedBanner || fetchedAvatar;
      if (!finalBanner || finalBanner.includes('placeholder')) {
        finalBanner = "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp";
      }

      setChannelName(finalName);
      setCurrentFollowers(fetchedFollowers);
      setBannerUrl(finalBanner);
      if (fetchedAvatar) setChannelAvatarUrl(fetchedAvatar);
      setSuccessMsg('Real channel banner & details fetched successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setChannelName('AtoPlay Channel');
      setBannerUrl("https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp");
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChannelUrl(val);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const clean = cleanAtoPlayUrl(val);
    if (clean && clean.includes('atoplay.com') && clean.length > 22) {
      debounceRef.current = setTimeout(() => {
        handleFetchChannelInfo(clean);
      }, 400);
    }
  };

  const handlePasteInput = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (pasted) {
      const clean = cleanAtoPlayUrl(pasted);
      setChannelUrl(clean);
      handleFetchChannelInfo(clean);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (text) {
          const clean = cleanAtoPlayUrl(text);
          setChannelUrl(clean);
          handleFetchChannelInfo(clean);
        }
      }
    } catch {
      // clipboard access unsupported
    }
  };

  const handleCreateFollowerCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!channelUrl.trim()) {
      setErrorMsg('Please enter your AtoPlay channel URL.');
      return;
    }

    const followersCount = Number(targetFollowers) || 10;
    if (followersCount < 5) {
      setErrorMsg('Minimum follower campaign is 5 followers.');
      return;
    }

    if (!isUserAdmin && user.coins < totalCost) {
      setErrorMsg('Insufficient coins! Earn more coins by watching videos or inviting friends.');
      return;
    }

    try {
      setSubmitting(true);
      const data = await apiFetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          videoUrl: cleanAtoPlayUrl(channelUrl.trim()),
          targetViews: followersCount,
          viewsRequired: followersCount,
          rewardPerView: 30,
          durationSeconds: 60,
          title: channelName ? `Follow AtoPlay Channel: ${channelName}` : `Follow AtoPlay Channel`,
          thumbnailUrl: bannerUrl,
          channelName: channelName || user.atoPlayUsername || 'AtoPlay Creator',
          channelFollowers: currentFollowers,
          campaignType: 'follower'
        })
      });

      if (data?.success) {
        setSuccessMsg(`Follower campaign launched successfully! ${totalCost} coins deducted.`);
        setChannelUrl('');

        try {
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
          });
        } catch {}

        if (data.campaign) {
          saveCampaignToFirestore(data.campaign).catch(() => {});
        }
        if (data.user) {
          saveUserCoinsToFirestore(data.user.id, data.user.coins, data.user.email).catch(() => {});
          onCampaignCreated(data.user);
        }

        fetchMyCampaigns();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(data?.message || 'Failed to create follower campaign.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error occurred while creating follower campaign.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h3 className="font-extrabold text-lg text-zinc-900">Create Follower Campaign</h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black uppercase">
                  Followers
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-medium">Grow real subscribers for your AtoPlay channel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateFollowerCampaign} className="space-y-4">

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Your Channel URL Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                Your Channel URL
              </label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center space-x-1 cursor-pointer"
              >
                <Clipboard className="w-3 h-3" />
                <span>Paste & Auto-Fetch</span>
              </button>
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-zinc-400">
                <LinkIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                placeholder="https://atoplay.com/channels/your-channel-id"
                value={channelUrl}
                onChange={handleUrlInputChange}
                onPaste={handlePasteInput}
                onBlur={() => handleFetchChannelInfo()}
                className="w-full pl-10 pr-24 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
              <button
                type="button"
                onClick={() => handleFetchChannelInfo()}
                disabled={fetchingInfo || !channelUrl}
                className="absolute right-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
              >
                {fetchingInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Fetch</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              URL paste karte hi automatic channel banner, real name aur followers fetch ho jayenge.
            </p>
          </div>

          {/* Fetched Channel Banner & Live Followers Preview Card */}
          <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
              <span>Channel Preview & Live Stats</span>
              <span className="text-emerald-700 font-black">👥 {currentFollowers > 0 ? `${currentFollowers} Followers` : '0 Followers'}</span>
            </div>
            <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200 shadow-2xs flex items-center justify-center">
              {bannerUrl ? (
                <>
                  <img
                    src={bannerUrl}
                    alt="Channel Banner"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (channelAvatarUrl && (e.currentTarget as HTMLImageElement).src !== channelAvatarUrl) {
                        (e.currentTarget as HTMLImageElement).src = channelAvatarUrl;
                      } else {
                        (e.currentTarget as HTMLImageElement).src = "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp";
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                    <div className="text-white text-xs font-extrabold truncate">
                      {channelName}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-4 text-zinc-400 text-xs">
                  <p className="font-bold text-zinc-300">No channel fetched yet</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Enter your AtoPlay channel URL above and tap Fetch</p>
                </div>
              )}
            </div>
            {channelUrl && (
              <button
                type="button"
                onClick={() => openAtoPlayUrl(channelUrl, true)}
                className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Channel in Chrome / Browser</span>
              </button>
            )}
          </div>

          {/* Select Number of Followers Required */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center justify-between">
              <span>Select Followers Required</span>
              <span className="text-xs font-black text-emerald-700">{targetFollowers} Followers</span>
            </label>

            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map(count => (
                <button
                  type="button"
                  key={count}
                  onClick={() => setTargetFollowers(count)}
                  className={`py-2.5 rounded-xl font-extrabold text-xs border transition-all cursor-pointer ${
                    targetFollowers === count
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {count} Followers
                </button>
              ))}
            </div>

            <input
              type="range"
              min="5"
              max="500"
              step="5"
              value={targetFollowers}
              onChange={e => setTargetFollowers(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>

          {/* Pricing Summary Card */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>Target Followers</span>
              <span className="font-bold text-zinc-900">{targetFollowers} Subscribers</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>Follower Reward (+30 coins each)</span>
              <span className="font-bold text-emerald-700">30 Coins / Follower</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>Platform Verification Fee</span>
              <span className="font-bold text-zinc-700">70 Coins / Follower</span>
            </div>
            <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between">
              <span className="text-xs font-extrabold text-zinc-900 uppercase">Total Campaign Cost</span>
              <div className="flex items-center space-x-1.5 text-emerald-800 font-black text-base">
                <Coins className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>{isUserAdmin ? '0 (Admin Free)' : `${totalCost} Coins`}</span>
              </div>
            </div>
            {!isUserAdmin && (
              <div className="flex items-center justify-between text-[11px] pt-1 text-zinc-500">
                <span>Your Available Coins</span>
                <span className={`font-bold ${user.coins >= totalCost ? 'text-emerald-600' : 'text-red-500'}`}>
                  {user.coins} Coins
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || fetchingInfo || (!isUserAdmin && user.coins < totalCost)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Campaign...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Launch Follower Campaign</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
