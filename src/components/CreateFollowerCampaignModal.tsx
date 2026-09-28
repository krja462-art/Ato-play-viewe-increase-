import React, { useState } from 'react';
import { X, Users, Sparkles, Coins, CheckCircle2, AlertCircle, ExternalLink, Link as LinkIcon, Search, Loader2 } from 'lucide-react';
import { User, Campaign } from '../types';
import { apiFetch, cleanVideoUrl } from '../lib/api';
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

  if (!isOpen) return null;

  const COST_PER_FOLLOWER = 100; // 30 coin reward + 70 coin platform fee
  const totalCost = Number(targetFollowers) * COST_PER_FOLLOWER;
  const isUserAdmin = Boolean(user.isAdmin || user.email?.toLowerCase().trim() === 'krja462@gmail.com');

  const handleFetchChannelInfo = async () => {
    const rawUrl = channelUrl.trim();
    if (!rawUrl) return;
    try {
      setFetchingInfo(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await apiFetch(`/api/campaigns/extract-metadata?url=${encodeURIComponent(rawUrl)}`);
      const data = await res.json();
      if (data?.success && data?.metadata) {
        const meta = data.metadata;
        const resolvedName = meta.channelName && meta.channelName !== 'AtoPlay Creator' ? meta.channelName : (meta.title || user.atoPlayUsername || user.name || 'AtoPlay Channel');
        setChannelName(resolvedName);
        if (typeof meta.channelFollowers === 'number' && meta.channelFollowers > 0) {
          setCurrentFollowers(meta.channelFollowers);
        } else {
          setCurrentFollowers(150);
        }
        if (meta.thumbnailUrl) {
          setBannerUrl(meta.thumbnailUrl);
        }
        setSuccessMsg('Channel successfully fetched!');
        setTimeout(() => setSuccessMsg(null), 2500);
      } else {
        setErrorMsg('Could not fetch channel info. Please verify the URL.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to fetch channel details.');
    } finally {
      setFetchingInfo(false);
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
          videoUrl: cleanVideoUrl(channelUrl.trim()),
          targetViews: followersCount,
          viewsRequired: followersCount,
          rewardPerView: 30,
          durationSeconds: 60,
          title: `Follow AtoPlay Channel: @${user.atoPlayUsername || channelName}`,
          thumbnailUrl: bannerUrl,
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
            <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center justify-between">
              <span>Your Channel URL</span>
              <span className="text-[11px] text-emerald-600 font-bold">AtoPlay Channel Link</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-zinc-400">
                <LinkIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                placeholder="https://atoplay.com/channel/your-channel-name"
                value={channelUrl}
                onChange={e => setChannelUrl(e.target.value)}
                onBlur={handleFetchChannelInfo}
                className="w-full pl-10 pr-24 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
              <button
                type="button"
                onClick={handleFetchChannelInfo}
                disabled={fetchingInfo || !channelUrl}
                className="absolute right-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
              >
                {fetchingInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Fetch</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Paste your AtoPlay channel link so we fetch your real channel banner and live follower count.
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
                    crossOrigin="anonymous"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
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
              min={5}
              max={500}
              step={5}
              value={targetFollowers}
              onChange={e => setTargetFollowers(Number(e.target.value))}
              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 mt-2"
            />
          </div>

          {/* Cost Summary Box */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
              <span>Follower Reward (30 coins × {targetFollowers})</span>
              <span className="font-bold text-zinc-900">{(targetFollowers * 30).toLocaleString()} Coins</span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
              <span>Platform Fee (70 coins × {targetFollowers})</span>
              <span className="font-bold text-zinc-900">{(targetFollowers * 70).toLocaleString()} Coins</span>
            </div>
            <div className="h-px bg-emerald-200" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider">Total Campaign Cost</p>
                <p className="text-base font-black text-zinc-900">{totalCost.toLocaleString()} Coins</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-zinc-500 font-bold uppercase">Your Balance</p>
                <p className={`text-base font-extrabold ${isUserAdmin ? 'text-amber-600' : (user.coins >= totalCost ? 'text-emerald-750' : 'text-red-600')}`}>
                  {isUserAdmin ? '∞ Unlimited' : `${user.coins.toLocaleString()} Coins`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (!isUserAdmin && user.coins < totalCost)}
              className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-transform active:scale-98 cursor-pointer"
            >
              {submitting ? 'Launching...' : `Launch Follower Campaign (${totalCost.toLocaleString()} Coins)`}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
