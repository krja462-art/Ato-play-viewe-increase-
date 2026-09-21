import React, { useEffect } from 'react';
import { Coins, CheckCircle2, Award, Sparkles, X, ArrowRight, Play } from 'lucide-react';
import { Campaign, format4CharId } from '../types';
import { playCoinCelebrationSound } from '../utils/audio';
import confetti from 'canvas-confetti';

interface RewardPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  earnedCoins: number;
  newBalance: number;
  campaign: Campaign | null;
  baseCoins?: number;
  bonusCoins?: number;
  followedBonus?: boolean;
  message?: string;
  countBefore?: number;
  countAfter?: number;
  onWatchNext?: () => void;
  onPromoteVideo?: () => void;
}

export const RewardPopupModal: React.FC<RewardPopupModalProps> = ({
  isOpen,
  onClose,
  earnedCoins,
  newBalance,
  campaign,
  baseCoins = 60,
  bonusCoins = 30,
  followedBonus = false,
  message,
  countBefore,
  countAfter,
  onWatchNext,
  onPromoteVideo
}) => {
  useEffect(() => {
    if (isOpen) {
      playCoinCelebrationSound();
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']
        });
      } catch {}
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const shortId = campaign ? format4CharId(campaign.displayId, campaign.id) : '----';
  const hasFollowBonus = followedBonus || (typeof countAfter === 'number' && typeof countBefore === 'number' && countAfter > countBefore) || earnedCoins >= 90;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border border-amber-200/80 text-center overflow-hidden">
        
        {/* Decorative Festive Top Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-b from-amber-300/40 via-yellow-200/30 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebratory Icon & Badge */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-amber-400/25 animate-ping" />
          <div className="relative w-18 h-18 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Coins className="w-9 h-9 drop-shadow-sm animate-bounce" />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-md">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Header Text & Status Message */}
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{hasFollowBonus ? "Watch + Follow Completed!" : "60s Watch Completed!"}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {hasFollowBonus ? "Awesome! +90 Coins Added" : "Coins Successfully Added!"}
          </h2>

          <div className={`p-3 rounded-2xl text-xs sm:text-sm font-semibold border ${
            hasFollowBonus 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {message || (hasFollowBonus 
              ? "Awesome! You earned 60 coins for watching + 30 coins follow bonus! Total: 90 Coins"
              : "You earned 60 coins for watching! (Tip: Follow the channel next time to earn an extra 30 coins!)"
            )}
          </div>
        </div>

        {/* Big Reward Breakdown Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-yellow-50/70 to-orange-50/70 border border-amber-200/90 shadow-inner space-y-3">
          
          {/* Main Total Number */}
          <div className="flex items-center justify-center space-x-2">
            <span className="text-3xl sm:text-4xl font-black text-amber-600">
              +{earnedCoins}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-amber-800 uppercase tracking-wide">
              Coins Total
            </span>
          </div>

          {/* Reward Breakdown Details */}
          <div className="grid grid-cols-2 gap-2 text-left pt-1">
            <div className="p-2.5 rounded-xl bg-white border border-amber-200/70 shadow-2xs">
              <div className="text-[11px] text-zinc-500 font-bold uppercase">Base Watch (60s)</div>
              <div className="text-sm font-black text-emerald-600 flex items-center space-x-1 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>+{baseCoins} Coins</span>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border shadow-2xs ${
              hasFollowBonus 
                ? "bg-emerald-50/80 border-emerald-200" 
                : "bg-zinc-50 border-zinc-200"
            }`}>
              <div className="text-[11px] text-zinc-500 font-bold uppercase">Follow Bonus</div>
              <div className={`text-sm font-black flex items-center space-x-1 mt-0.5 ${
                hasFollowBonus ? "text-emerald-600" : "text-zinc-400"
              }`}>
                {hasFollowBonus ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>+{bonusCoins} Coins</span>
                  </>
                ) : (
                  <span>+0 Coins (Skipped)</span>
                )}
              </div>
            </div>
          </div>

          {/* Channel Follower Status if available */}
          {typeof countBefore === 'number' && typeof countAfter === 'number' && (
            <div className="flex items-center justify-between text-[11px] px-2 text-zinc-500 bg-white/70 py-1.5 rounded-lg border border-amber-200/40">
              <span>Channel Followers Count:</span>
              <span className="font-bold text-zinc-700">
                {countBefore} → {countAfter} {countAfter > countBefore ? "✅ (+1 Followed)" : ""}
              </span>
            </div>
          )}

          <div className="h-px bg-amber-200/70 w-full" />

          {/* New Balance preview */}
          <div className="flex items-center justify-between text-xs sm:text-sm px-2">
            <span className="text-zinc-600 font-medium">New Wallet Balance:</span>
            <span className="font-extrabold text-zinc-900 flex items-center space-x-1">
              <Coins className="w-4 h-4 text-amber-500 inline" />
              <span>{newBalance.toLocaleString()} Coins</span>
            </span>
          </div>

          {/* Video detail */}
          {campaign && (
            <div className="pt-1 flex items-center justify-between text-xs px-2 text-zinc-500 border-t border-amber-200/50">
              <span className="truncate max-w-[200px] text-left font-medium text-zinc-700">
                {campaign.title}
              </span>
              <span className="font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-zinc-200 text-zinc-800 shrink-0 ml-2">
                #{shortId}
              </span>
            </div>
          )}
        </div>

        {/* Server verification badge */}
        <div className="flex items-center justify-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 py-2 px-3 rounded-xl">
          <Award className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Server Verified: 60s Watch Duration & Reward Checked</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={() => {
              onClose();
              if (onWatchNext) onWatchNext();
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-101 cursor-pointer flex items-center justify-center space-x-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Watch Next Video (90 Coins)</span>
          </button>

          {onPromoteVideo && (
            <button
              onClick={() => {
                onClose();
                onPromoteVideo();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <span>Promote My Video With Coins</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
