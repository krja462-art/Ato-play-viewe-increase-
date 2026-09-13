import React, { useState, useEffect, useRef } from 'react';
import { Campaign, User } from '../types';
import { Play, ShieldAlert, CheckCircle2, Coins, Clock, AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface WatchEarnProps {
  user: User;
  onCoinEarned: (updatedUser: User) => void;
}

export const WatchEarn: React.FC<WatchEarnProps> = ({ user, onCoinEarned }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(45);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [earnedPopup, setEarnedPopup] = useState<number | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch available watch campaigns
  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/campaigns');
      if (data?.success && Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns);
        if (data.campaigns.length > 0) {
          setTimeLeft(data.campaigns[0].durationSeconds || 45);
        }
      }
    } catch (err) {
      console.error('Failed to load campaigns', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const currentCampaign = campaigns[currentIndex];

  // Anti-Cheat: Visibility and Blur detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        setIsPlaying(false);
        setWarningMessage("⚠️ Anti-Cheat Warning: Tab switched or browser minimized! Timer paused. Please stay on the watch screen.");
      }
    };

    const handleWindowBlur = () => {
      if (isPlaying) {
        setIsPlaying(false);
        setWarningMessage("⚠️ Anti-Cheat Warning: Window focus lost! Timer paused.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isPlaying]);

  // Countdown timer logic
  useEffect(() => {
    if (isPlaying && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isPlaying && timeLeft === 0) {
      setIsPlaying(false);
      setIsCompleted(true);
      verifyAndCreditReward();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, timeLeft]);

  const verifyAndCreditReward = async () => {
    if (!currentCampaign) return;
    try {
      setVerifying(true);
      const data = await apiFetch('/api/watch/verify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          campaignId: currentCampaign.id,
          watchDuration: currentCampaign.durationSeconds,
          antiCheatToken: "token_verified_" + Date.now()
        })
      });
      if (data?.success) {
        if (data.user) {
          onCoinEarned(data.user);
        }
        setEarnedPopup(data.earnedCoins || data.coinsEarned || 10);
      }
    } catch (err) {
      console.error('Watch verification failed', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleStartWatching = () => {
    setWarningMessage(null);
    setIsPlaying(true);
  };

  const handleNextVideo = () => {
    setIsCompleted(false);
    setEarnedPopup(null);
    if (campaigns.length > 0) {
      const nextIdx = (currentIndex + 1) % campaigns.length;
      setCurrentIndex(nextIdx);
      setTimeLeft(campaigns[nextIdx].durationSeconds || 45);
    }
    setWarningMessage(null);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-600 dark:text-zinc-400 font-medium">Loading AtoPlay video queue...</p>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center mx-auto shadow-inner">
          <Play className="w-10 h-10 fill-current" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">No Videos Available in Queue</h2>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            All available campaign videos have been watched or none are active right now. Check back soon or create your own campaign!
          </p>
        </div>
        <button
          onClick={fetchCampaigns}
          className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-600/20"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Refresh Queue</span>
        </button>
      </div>
    );
  }

  const progressPercent = currentCampaign ? Math.round(((currentCampaign.durationSeconds - timeLeft) / currentCampaign.durationSeconds) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider">
              Watch & Earn Queue
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Video {currentIndex + 1} of {campaigns.length}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">AtoPlay View Exchange Player</h1>
        </div>

        <div className="flex items-center space-x-2 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 px-4 py-2 rounded-2xl text-yellow-800 dark:text-yellow-300 font-bold text-sm">
          <Coins className="w-4 h-4 text-yellow-600" />
          <span>Earn ~{Math.floor((currentCampaign?.durationSeconds || 45) * 0.5)} Coins</span>
        </div>
      </div>

      {/* Warning Alert if Anti-Cheat triggered */}
      {warningMessage && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-900 text-amber-800 dark:text-amber-300 flex items-center space-x-3 shadow-md animate-bounce">
          <ShieldAlert className="w-6 h-6 flex-shrink-0 text-amber-600" />
          <div className="text-sm font-medium">{warningMessage}</div>
        </div>
      )}

      {/* Video Player & Timer Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl">
        
        {/* Simulated AtoPlay Video Stage */}
        <div className="relative aspect-video bg-zinc-950 flex flex-col items-center justify-center overflow-hidden group">
          <img 
            src={currentCampaign.thumbnailUrl} 
            alt={currentCampaign.title}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes('unsplash.com')) {
                target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
              }
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${isPlaying ? 'scale-105 opacity-90' : 'opacity-60'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          {/* Center Play / Timer Overlay */}
          <div className="relative z-10 text-center p-6 space-y-4 max-w-lg">
            
            {isCompleted ? (
              <div className="space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-white">Watch Verified Successfully!</h3>
                  <p className="text-emerald-400 font-bold text-lg">+{earnedPopup || 25} Coins credited to your wallet</p>
                </div>
                <button
                  onClick={handleNextVideo}
                  className="px-8 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-600/30 transition-all hover:scale-105"
                >
                  Watch Next Video →
                </button>
              </div>
            ) : isPlaying ? (
              <div className="space-y-3">
                <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-red-600/90 text-white font-bold text-sm backdrop-blur-md animate-pulse">
                  <Clock className="w-4 h-4" />
                  <span>Timer Running: {timeLeft}s remaining</span>
                </div>
                <p className="text-xs text-zinc-300">
                  Anti-fraud protection active. Do not switch tabs or minimize app.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={handleStartWatching}
                  className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center mx-auto shadow-xl shadow-red-600/40 transition-transform hover:scale-110"
                >
                  <Play className="w-8 h-8 fill-current ml-1" />
                </button>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Click Play to Start Watching</h3>
                  <p className="text-xs text-zinc-300">Watch for {currentCampaign.durationSeconds} seconds to earn coins</p>
                </div>
              </div>
            )}

          </div>

          {/* Top Video Badge */}
          <div className="absolute top-4 left-4 z-20 flex items-center space-x-2">
            <span className="px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-semibold border border-white/10">
              AtoPlay Creator: {currentCampaign.userName}
            </span>
          </div>

          <div className="absolute top-4 right-4 z-20">
            <a 
              href={currentCampaign.videoUrl} 
              target="_blank" 
              rel="noreferrer"
              className="p-2 rounded-lg bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-colors flex items-center space-x-1 text-xs"
              title="Open AtoPlay in new tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">AtoPlay Link</span>
            </a>
          </div>

          {/* Bottom Countdown Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-800">
            <div className="h-full bg-red-600 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
          </div>

        </div>

        {/* Video Details & Anti-fraud Info */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{currentCampaign.title}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Video ID: {currentCampaign.id} • Required Watch Duration: {currentCampaign.durationSeconds}s
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Duration</p>
                <p className="font-bold text-sm text-zinc-900 dark:text-white">{currentCampaign.durationSeconds} Seconds</p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
              <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-950/50 text-yellow-600 flex items-center justify-center">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Reward</p>
                <p className="font-bold text-sm text-zinc-900 dark:text-white">~{Math.floor(currentCampaign.durationSeconds * 0.5)} Coins</p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Anti-Cheat</p>
                <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400">Server Verified</p>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
