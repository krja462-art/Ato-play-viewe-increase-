import React, { useState } from 'react';
import { Copy, Check, Sparkles, X } from 'lucide-react';

interface PromptHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PromptHelperModal: React.FC<PromptHelperModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const masterPromptText = `"I want to build a full-stack mobile application (built with Flutter / React Native and a Firebase / Node.js backend) designed for a video view-exchange network specifically for the AtoPlay video platform.

Core Concept:
Users watch other users' AtoPlay videos inside the app to earn in-app virtual coins. They can then spend these earned coins to create their own video promotion campaigns to get real views on their AtoPlay videos.

Core Feature Requirements:
- Authentication: Google Sign-In and Email/Password authentication. Welcome bonus coins for new users on first login.
- Earn Coins (Watch & Earn): In-app video player or custom WebView loader for AtoPlay video links. Countdown timer (60 seconds minimum) synchronized with the server to prevent skip-fraud. Anti-cheat checks: detect app minimize, backgrounding, tab switching, or automated bot taps.
- Campaign Creation (Promote Video): Form to input AtoPlay video URL, desired view count, and watch duration. Dynamic coin deduction calculation: Total Coins = Views × Time Duration × Coin Rate. Balance check before creation. Active campaign dashboard showing real-time progress.
- Database & Backend Architecture: Collections for Users, Campaigns, Transactions, Reports. Atomic coin transactions to avoid race conditions. Video queue algorithm that distributes views fairly.
- Monetization & In-App Economy: Google AdMob rewarded video ads, In-App Purchase (IAP) gateway for coin packs, daily login check-in reward streak."`;

  const handleCopy = () => {
    navigator.clipboard.writeText(masterPromptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 text-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-zinc-800 space-y-6 max-h-[90vh] flex flex-col">
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center border border-red-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold">AtoPlay Master Prompt</h3>
              <p className="text-xs text-zinc-400">Copy this prompt for Cursor, Claude, or ChatGPT</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 flex items-center justify-center font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto p-4 rounded-2xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {masterPromptText}
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-zinc-400">Ready to copy for any AI code generator</span>
          <button
            onClick={handleCopy}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition-all hover:scale-105"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Master Prompt</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
