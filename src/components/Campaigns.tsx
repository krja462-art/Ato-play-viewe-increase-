import React, { useState, useEffect, useRef } from 'react';
import { Campaign, User, format4CharId } from '../types';
import { Plus, MoreVertical, Clock, Trash2, Coins, AlertCircle, Sparkles, X, Video, ExternalLink, Check, Search, ShieldCheck } from 'lucide-react';
import { AtoPlayBadge } from './AtoPlayBadge';
import { apiFetch } from '../lib/api';
import { saveCampaignToFirestore, deleteCampaignInFirestore, saveUserCoinsToFirestore } from '../lib/firebase';

interface CampaignsProps {
  user: User;
  onCampaignCreated: (updatedUser: User) => void;
  isCreateModalOpen?: boolean;
  onCloseCreateModal?: () => void;
  onOpenCreateModal?: () => void;
}

export const Campaigns: React.FC<CampaignsProps> = ({ 
  user, 
  onCampaignCreated,
  isCreateModalOpen,
  onCloseCreateModal,
  onOpenCreateModal
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (isCreateModalOpen !== undefined) {
      setIsModalOpen(isCreateModalOpen);
      if (isCreateModalOpen) {
        setErrorMsg(null);
        setSuccessMsg(null);
      }
    }
  }, [isCreateModalOpen]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (onCloseCreateModal) onCloseCreateModal();
  };

  // Form state
  const [videoUrl, setVideoUrl] = useState('');
  const [targetViews, setTargetViews] = useState(10); // Minimum 10 views (800 coins required)
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Video metadata preview state
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    title: string;
    thumbnailUrl: string;
    displayId: string;
  } | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Coin Economics: 80 coins/view (60 reward + 20 fee)
  const COST_PER_VIEW = 80;
  const REWARD_PER_VIEW = 60;
  const PLATFORM_FEE = 20;
  const totalCost = Number(targetViews) * COST_PER_VIEW;

  // View Presets
  const VIEW_PRESETS = [
    { views: 10, cost: 800 },
    { views: 20, cost: 1600 },
    { views: 50, cost: 4000 },
    { views: 100, cost: 8000 }
  ];

  // Helper to validate complete URL before requesting extraction
  const isValidVideoUrl = (url: string) => {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const hostname = parsed.hostname;
      // Must have at least one dot and a TLD of at least 2 chars
      if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(hostname) && hostname !== 'localhost') {
        return false;
      }
      return parsed.pathname.length > 1 || parsed.search.length > 1;
    } catch {
      return false;
    }
  };

  const fetchMyCampaigns = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/campaigns?filter=my', {
        headers: { 'x-user-id': user.id }
      });
      if (data?.success && Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error('Failed to load campaigns', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyCampaigns();
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [user.id]);

  // Fetch real video metadata on demand
  const handleFetchMetadata = async (urlToFetch?: string) => {
    const url = (urlToFetch || videoUrl).trim();
    if (!isValidVideoUrl(url)) return;

    try {
      setFetchingPreview(true);
      setErrorMsg(null);
      const data = await apiFetch(`/api/campaigns/extract-metadata?url=${encodeURIComponent(url)}`);
      if (data?.success && data?.metadata) {
        setPreviewData(data.metadata);
        setCustomTitle(data.metadata.title);
      }
    } catch {
      // Silently continue with standard fallback
    } finally {
      setFetchingPreview(false);
    }
  };

  // Debounced auto-fetch preview when typing or pasting a complete valid URL
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setVideoUrl(newUrl);
    setPreviewData(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (isValidVideoUrl(newUrl)) {
      debounceTimerRef.current = setTimeout(() => {
        handleFetchMetadata(newUrl);
      }, 700);
    }
  };

  const activeRunningCampaign = campaigns.find(
    c => c.status === 'active' && ((c.viewsCompleted ?? c.completedViews ?? 0) < (c.viewsRequired ?? c.targetViews ?? 10))
  );

  const isUserAdmin = Boolean(user.isAdmin || user.email?.toLowerCase().trim() === 'krja462@gmail.com');

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!videoUrl) {
      setErrorMsg('Please enter a valid AtoPlay video URL');
      return;
    }

    const views = Number(targetViews) || 10;
    if (views < 10) {
      setErrorMsg('Minimum campaign is 10 views (800 coins required).');
      return;
    }

    if (views > 1000) {
      setErrorMsg('Maximum 1000 views allowed per campaign.');
      return;
    }

    // Check if user's balance >= totalCost. If not, show alert: "Insufficient coins! Watch more videos to earn."
    if (!isUserAdmin && user.coins < totalCost) {
      alert('Insufficient coins! Watch more videos to earn.');
      setErrorMsg('Insufficient coins! Watch more videos to earn.');
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
          videoUrl: videoUrl.trim(),
          targetViews: views,
          viewsRequired: views,
          rewardPerView: 60,
          durationSeconds: 60,
          title: customTitle || previewData?.title,
          thumbnailUrl: previewData?.thumbnailUrl
        })
      });

      if (data?.success) {
        setSuccessMsg(`Campaign launched successfully! ${totalCost} coins deducted.`);
        setVideoUrl('');
        setPreviewData(null);
        setCustomTitle('');
        setIsModalOpen(false);

        // Sync campaign to Firestore
        if (data.campaign) {
          saveCampaignToFirestore(data.campaign).catch(e => console.warn('Firestore campaign save error:', e));
        }

        // Deduct totalCost and sync coins
        if (data.user) {
          saveUserCoinsToFirestore(data.user.id, data.user.coins).catch(e => console.warn('Firestore user coins error:', e));
          onCampaignCreated(data.user);
        }

        fetchMyCampaigns();
      } else {
        if (data?.message?.includes('Insufficient coins')) {
          alert('Insufficient coins! Watch more videos to earn.');
        }
        setErrorMsg(data?.message || 'Failed to create campaign');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while creating campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? Remaining views will be refunded at 80 coins/view.')) return;

    try {
      const data = await apiFetch(`/api/campaigns/${id}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': user.id }
      });
      if (data?.success) {
        deleteCampaignInFirestore(id).catch(e => console.warn('Firestore campaign delete error:', e));
        if (data.user) {
          saveUserCoinsToFirestore(data.user.id, data.user.coins).catch(e => console.warn('Firestore user coins error:', e));
          onCampaignCreated(data.user);
        }
        setCampaigns(campaigns.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete campaign', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 mb-28 bg-white min-h-screen relative">
      
      {/* Top Header info */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">My Campaigns</h1>
          <p className="text-xs text-zinc-500">Manage your active AtoPlay video promotion campaigns</p>
        </div>

        <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-extrabold shadow-xs">
          <Coins className="w-3.5 h-3.5 text-yellow-600" />
          <span>{user.coins.toLocaleString()} Coins</span>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center space-x-2">
          <span>✅ {successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Active Campaign Running Notice */}
      {activeRunningCampaign && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-start space-x-3">
          <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-extrabold text-blue-950">
              Active Campaign In Progress: "{activeRunningCampaign.title}"
            </p>
            <p className="text-blue-700 leading-relaxed">
              Progress: <strong>{activeRunningCampaign.completedViews} of {activeRunningCampaign.targetViews} views completed</strong>. As per policy, you can launch your next campaign once this current campaign reaches all {activeRunningCampaign.targetViews} views.
            </p>
          </div>
        </div>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-500">Loading your campaigns...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-zinc-200 p-8 space-y-4">
          <Video className="w-12 h-12 text-zinc-300 mx-auto" />
          <div className="space-y-1">
            <p className="font-bold text-zinc-800 text-sm">No campaigns created yet</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Tap the center <strong>+ Create</strong> button in the bottom navigation bar to boost your AtoPlay video views.
            </p>
          </div>
          <button
            onClick={() => {
              setIsModalOpen(true);
              if (onOpenCreateModal) onOpenCreateModal();
            }}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all hover:scale-102 cursor-pointer inline-flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create Campaign</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100 shadow-sm overflow-hidden">
          {campaigns.map(camp => {
            const reqViews = camp.viewsRequired ?? camp.targetViews ?? 10;
            const compViews = camp.viewsCompleted ?? camp.completedViews ?? 0;
            const progress = Math.min(100, Math.round((compViews / reqViews) * 100));
            const isCompleted = compViews >= reqViews || camp.status === 'completed';

            return (
              <div key={camp.id} className="p-4 flex items-center space-x-4 relative hover:bg-zinc-50 transition-colors">
                
                {/* Stretched Thumbnail on left */}
                <div className="w-28 sm:w-36 aspect-video rounded-xl bg-zinc-950 overflow-hidden shrink-0 border border-zinc-200 shadow-xs relative">
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
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9px] font-bold">
                    60s
                  </div>
                </div>

                {/* Info section: Title in blue, ID below, Progress bar */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm sm:text-base text-blue-600 truncate">
                      {camp.title}
                    </h3>
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-zinc-500 font-mono">
                    <span>ID: <span className="font-extrabold text-zinc-700">{format4CharId(camp.displayId, camp.id)}</span></span>
                    <span className="text-zinc-300">•</span>
                    <span className="text-emerald-700 font-sans font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Reward: 60 Coins/view
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>{compViews}/{reqViews} {isCompleted ? 'views (Completed ✓)' : 'views'}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400">{progress}%</span>
                    </div>

                    <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-600'}`} 
                        style={{ width: `${progress}%` }} 
                      />
                    </div>
                  </div>
                </div>

                {/* 3-dot Menu on right */}
                <div className="relative shrink-0">
                  <button 
                    onClick={() => setActiveMenuId(activeMenuId === camp.id ? null : camp.id)}
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {activeMenuId === camp.id && (
                    <div className="absolute right-0 top-10 w-40 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 z-30">
                      <button
                        onClick={() => {
                          setActiveMenuId(null);
                          handleDeleteCampaign(camp.id);
                        }}
                        className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 font-semibold cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Campaign</span>
                      </button>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal Popup for Creating Campaign */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-lg text-zinc-900">Create Video Campaign</h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Campaign Alert within Modal */}
            {activeRunningCampaign && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 space-y-1.5">
                <div className="flex items-center space-x-2 font-bold text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Active Campaign Limit (1 Active Campaign at a Time)</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  You already have an active campaign <strong>"{activeRunningCampaign.title}"</strong> ({activeRunningCampaign.completedViews}/{activeRunningCampaign.targetViews} views completed). You can only launch your next campaign after this one finishes.
                </p>
              </div>
            )}

            <form onSubmit={handleCreateCampaign} className="space-y-5">
              
              {/* URL Input with Live Extract */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between">
                  <span>AtoPlay / Video URL</span>
                  {fetchingPreview && (
                    <span className="text-blue-600 text-[11px] font-semibold flex items-center space-x-1 lowercase">
                      <Search className="w-3 h-3 animate-spin" />
                      <span>fetching details...</span>
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    placeholder="https://atoplay.com/video/... or https://youtu.be/..."
                    value={videoUrl}
                    onChange={handleUrlChange}
                    className="w-full px-4 py-3.5 pr-24 rounded-2xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchMetadata()}
                    disabled={fetchingPreview || !videoUrl}
                    className="absolute right-2 top-2 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {fetchingPreview ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Real video thumbnail and title will be extracted automatically from the page.
                </p>
              </div>

              {/* Real Video Preview Card (Shows extracted Title & Stretched Thumbnail) */}
              {previewData && (
                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-600">
                    <span className="flex items-center space-x-1 text-emerald-600 font-extrabold">
                      <Check className="w-3.5 h-3.5" />
                      <span>Real Video Data Extracted</span>
                    </span>
                    <span className="font-mono text-zinc-400">ID: {previewData.displayId}</span>
                  </div>

                  {/* Stretched Live Thumbnail */}
                  <div className="relative w-full aspect-video rounded-xl bg-zinc-950 overflow-hidden border border-zinc-200 shadow-xs">
                    {/* AtoPlay Official Video Thumbnail Badge */}
                    <AtoPlayBadge size="md" className="absolute top-2 left-2 z-10" />

                    <img 
                      src={previewData.thumbnailUrl} 
                      alt="Preview" 
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
                  </div>

                  {/* Editable Title */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-500 uppercase">Video Title</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* Number of views selector (presets + custom slider & input) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-zinc-900">Number of Views</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      step={5}
                      value={targetViews}
                      onChange={e => setTargetViews(Math.max(10, Math.min(1000, Number(e.target.value) || 10)))}
                      className="w-20 px-2.5 py-1 text-right font-extrabold text-blue-600 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <span className="text-xs font-bold text-zinc-500">Views</span>
                  </div>
                </div>

                {/* Preset Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VIEW_PRESETS.map(preset => (
                    <button
                      key={preset.views}
                      type="button"
                      onClick={() => setTargetViews(preset.views)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        targetViews === preset.views
                          ? 'border-blue-600 bg-blue-50/80 text-blue-700 font-extrabold ring-1 ring-blue-600'
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-semibold'
                      }`}
                    >
                      <div className="text-xs font-bold">{preset.views} Views</div>
                      <div className="text-[11px] text-zinc-500">{preset.cost.toLocaleString()} coins</div>
                    </button>
                  ))}
                </div>
                
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={5}
                  value={targetViews}
                  onChange={e => setTargetViews(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />

                <div className="flex justify-between text-[11px] text-zinc-400 font-semibold">
                  <span>Min: 10 Views (800 coins)</span>
                  <span>500 Views</span>
                  <span>Max: 1000 Views</span>
                </div>
              </div>

              {/* Total Cost Calculation (shown in real-time) */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
                  <span>Viewer Reward (60 coins × {targetViews} views)</span>
                  <span className="font-bold text-zinc-900">{(targetViews * REWARD_PER_VIEW).toLocaleString()} Coins</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
                  <span>Platform Fee (20 coins × {targetViews} views)</span>
                  <span className="font-bold text-zinc-900">{(targetViews * PLATFORM_FEE).toLocaleString()} Coins</span>
                </div>
                <div className="h-px bg-zinc-200" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-blue-700 font-bold uppercase tracking-wider">Total Campaign Cost</p>
                    <p className="text-base font-extrabold text-zinc-900">{totalCost.toLocaleString()} Coins</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-zinc-500 font-bold uppercase">Your Balance</p>
                    <p className={`text-base font-extrabold ${isUserAdmin ? 'text-amber-600' : (user.coins >= totalCost ? 'text-emerald-600' : 'text-red-600')}`}>
                      {isUserAdmin ? '∞ Unlimited Coins (Admin)' : `${user.coins.toLocaleString()} Coins`}
                    </p>
                  </div>
                </div>

                {/* Insufficient coins warning (only shown for non-admin) */}
                {!isUserAdmin && user.coins < totalCost && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>Insufficient coins! Watch more videos to earn.</span>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-transform cursor-pointer disabled:opacity-50 ${
                    !isUserAdmin && user.coins < totalCost
                      ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30 hover:scale-102'
                  }`}
                >
                  {submitting 
                    ? 'Creating Campaign...' 
                    : (isUserAdmin 
                        ? 'Launch Campaign (Admin Free / Unlimited)' 
                        : `Promote / Submit (${totalCost.toLocaleString()} Coins)`)}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
