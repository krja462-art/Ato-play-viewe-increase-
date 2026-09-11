import React from 'react';
import { AlertTriangle, Clock, X, ShieldAlert, ArrowRight, RotateCcw } from 'lucide-react';
import { Campaign, format4CharId } from '../types';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  elapsedSeconds: number;
  campaign: Campaign | null;
  onRetry?: () => void;
}

export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({
  isOpen,
  onClose,
  elapsedSeconds,
  campaign,
  onRetry
}) => {
  if (!isOpen) return null;

  const shortId = campaign ? format4CharId(campaign.displayId, campaign.id) : '----';
  const displayElapsed = Math.max(0, Math.min(59, Math.round(elapsedSeconds)));
  const remaining = Math.max(1, 60 - displayElapsed);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-6 shadow-2xl relative border border-red-200 text-center overflow-hidden">
        
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
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="w-18 h-18 rounded-2xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-9 h-9 animate-pulse" />
          </div>
        </div>

        {/* Header Title */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-red-100 border border-red-300 text-red-800 text-xs font-black uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>Watch Goal Incomplete</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight pt-1">
            Session Expired (0 Coins Claimed)
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600">
            Aap 60 seconds poore hone se pehle hi app par wapas aa gaye.
          </p>
        </div>

        {/* Watch Time Stat Card */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
              <span className="text-[11px] font-bold text-red-700 block uppercase">Background Time</span>
              <span className="text-2xl font-black text-red-600 font-mono">{displayElapsed}s</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[11px] font-bold text-emerald-700 block uppercase">Required</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">60s</span>
            </div>
          </div>

          <div className="text-left text-xs text-zinc-600 bg-white p-3 rounded-xl border border-zinc-200 space-y-1.5">
            <div className="flex items-center space-x-1.5 font-bold text-red-800">
              <Clock className="w-3.5 h-3.5" />
              <span>{remaining} seconds kam reh gaye the!</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Token-based security rule: Video ko external browser/tab mein poore 60s chalne dein. Uske baad app par switch karne par hi coins claim hote hain. Premature return karne par token expire ho jata hai.
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

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {onRetry && (
            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md shadow-blue-600/20 transition-all hover:scale-102 cursor-pointer flex items-center justify-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry Watching Video (60s Full)</span>
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
