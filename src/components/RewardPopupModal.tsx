import React, { useEffect } from 'react';
import { Coins, CheckCircle2, Award, Sparkles, X, ArrowRight, Play } from 'lucide-react';
import { Campaign, format4CharId } from '../types';
import { playCoinCelebrationSound } from '../utils/audio';

interface RewardPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  earnedCoins: number;
  newBalance: number;
  campaign: Campaign | null;
  onWatchNext?: () => void;
  onPromoteVideo?: () => void;
}

export const RewardPopupModal: React.FC<RewardPopupModalProps> = ({
  isOpen,
  onClose,
  earnedCoins,
  newBalance,
  campaign,
  onWatchNext,
  onPromoteVideo
}) => {
  useEffect(() => {
    if (isOpen) {
      playCoinCelebrationSound();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const shortId = campaign ? format4CharId(campaign.displayId, campaign.id) : '----';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl relative border border-amber-200/80 text-center overflow-hidden">
        
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
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          {/* Pulsing ring animation */}
          <div className="absolute inset-0 rounded-full bg-amber-400/25 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Coins className="w-10 h-10 drop-shadow-sm animate-bounce" />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500 text-white shadow-md">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Header Text */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>60s Watch Goal Completed!</span>
          </div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight pt-1">
            Coins Successfully Added!
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600">
            Aapne 60 second pura kiya aur verification successful ho gaya hai.
          </p>
        </div>

        {/* Big Reward Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border border-amber-200/90 shadow-inner space-y-3">
          <div className="flex items-center justify-center space-x-2">
            <span className="text-3xl sm:text-4xl font-black text-amber-600">
              +{earnedCoins}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-amber-800 uppercase tracking-wide">
              Coins
            </span>
          </div>

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
              <span className="truncate max-w-[190px] text-left font-medium text-zinc-700">
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
          <span>Server Verified: 60 Seconds Time Requirement Met</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={() => {
              onClose();
              if (onWatchNext) onWatchNext();
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-102 cursor-pointer flex items-center justify-center space-x-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Watch Next Video (+100 Coins)</span>
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
