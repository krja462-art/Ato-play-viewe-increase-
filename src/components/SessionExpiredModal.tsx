import React from 'react';
import { AlertTriangle, Clock, X, ShieldAlert, ArrowRight, RotateCcw, ExternalLink } from 'lucide-react';
import { Campaign, format4CharId } from '../types';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  elapsedSeconds: number;
  campaign: Campaign | null;
  onRetry?: () => void;
  onReopenVideo?: () => void;
}

export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({
  isOpen,
  onClose,
  elapsedSeconds,
  campaign,
  onRetry,
  onReopenVideo
}) => {
  if (!isOpen) return null;

  const shortId = campaign ? format4CharId(campaign.displayId, campaign.id) : '----';
  const displayElapsed = Math.max(0, Math.min(59, Math.round(elapsedSeconds)));
  const remaining = Math.max(1, 60 - displayElapsed);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border border-red-200 text-center overflow-hidden">
        
        {/* Subtle top alert glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-b from-red-200/40 via-orange-100/30 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Warning Icon & Badge */}
        <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-8 h-8 animate-pulse" />
          </div>
        </div>

        {/* Header Title */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-red-100 border border-red-300 text-red-800 text-xs font-black uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>Watch Goal Incomplete</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight pt-0.5">
            Session Expired (0 Coins Claimed)
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600">
            You returned to the app before completing the required 60-second watch duration.
          </p>
        </div>

        {/* Watch Time Stat Card: Kitna time spend aur itna time bacha */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            {/* Box 1: Time Spent */}
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 space-y-0.5">
              <span className="text-[10px] font-black text-red-700 block uppercase tracking-wider">
                Time Spent
              </span>
              <span className="text-2xl font-black text-red-600 font-mono">
                {displayElapsed}s
              </span>
              <span className="text-[10px] text-red-500 font-medium block">
                Watched in AtoPlay
              </span>
            </div>

            {/* Box 2: Time Remaining */}
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-0.5">
              <span className="text-[10px] font-black text-amber-800 block uppercase tracking-wider">
                Time Remaining
              </span>
              <span className="text-2xl font-black text-amber-600 font-mono">
                {remaining}s
              </span>
              <span className="text-[10px] text-amber-600 font-medium block">
                Needed for Reward
              </span>
            </div>
          </div>

          <div className="text-left text-xs text-zinc-600 bg-white p-3 rounded-xl border border-zinc-200 space-y-1.5">
            <div className="flex items-center justify-between font-bold text-zinc-800 text-xs">
              <span className="flex items-center space-x-1 text-red-700">
                <Clock className="w-3.5 h-3.5" />
                <span>{remaining} seconds left to earn +60 coins</span>
              </span>
              <span className="px-2 py-0.5 bg-zinc-100 rounded text-[10px] text-zinc-500">
                Required: 60s
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Anti-cheat security rule: Video must play for a full 60 seconds in the external browser. Switching back early expires the session with 0 coins.
            </p>
          </div>

          {campaign && (
            <div className="flex items-center justify-between text-xs px-1 text-zinc-500 pt-1 border-t border-zinc-200">
              <span className="truncate max-w-[200px] text-left font-medium text-zinc-700">
                {campaign.title}
              </span>
              <span className="font-mono font-bold text-zinc-600">
                #{shortId}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons: Re-open Video Button prominent at bottom */}
        <div className="space-y-2 pt-1">
          {campaign && (
            <button
              onClick={() => {
                if (onReopenVideo) {
                  onReopenVideo();
                } else if (onRetry) {
                  onRetry();
                }
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-sm shadow-md shadow-red-600/25 transition-all hover:scale-101 active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>Re-open Video (Watch 60s)</span>
            </button>
          )}

          {onRetry && (
            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart Video from Beginning</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <span>Back to Campaign Feed</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
