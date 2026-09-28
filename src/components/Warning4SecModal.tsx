import React from 'react';
import { AlertCircle, X, Clock, ShieldAlert } from 'lucide-react';

interface Warning4SecModalProps {
  isOpen: boolean;
  onClose: () => void;
  elapsedSeconds?: number;
}

export const Warning4SecModal: React.FC<Warning4SecModalProps> = ({
  isOpen,
  onClose,
  elapsedSeconds = 2
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl relative border-2 border-red-300 text-center overflow-hidden">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1 px-3 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider">
            <Clock className="w-3 h-3" />
            <span>4 Seconds Rule Violation</span>
          </div>

          <h3 className="text-lg font-black text-zinc-900">
            No Coins Credited!
          </h3>

          <p className="text-xs text-zinc-600 leading-relaxed pt-1">
            ⚠️ Aapne AtoPlay channel page par sirf <strong className="text-red-600">{elapsedSeconds} seconds</strong> spend kiye (4 seconds se pehle wapas aagaye) aur channel follow nahi kiya.
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold text-left space-y-1">
          <div className="font-bold flex items-center space-x-1 text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Rule:</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Follower reward claim karne ke liye AtoPlay channel par kam se kam <strong>4 seconds</strong> spend karein aur <strong>Follow</strong> button dabayein!
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-md transition-all cursor-pointer"
          >
            I Understand, Try Again
          </button>
        </div>

      </div>
    </div>
  );
};
