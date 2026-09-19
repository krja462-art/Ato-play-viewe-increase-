import React, { useState } from 'react';
import { Download, Sparkles, Smartphone, ArrowRight, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PreLoginInstallScreenProps {
  onSkip: () => void;
}

export const PreLoginInstallScreen: React.FC<PreLoginInstallScreenProps> = ({ onSkip }) => {
  const { isInstallable, isIOS, install } = usePWAInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else {
      // Fallback: trigger browser prompt or show shortcut instructions
      window.alert('To install app / create shortcut, please tap your browser menu (3 dots) and select "Add to Home Screen" or "Install App".');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-blue-600 flex flex-col justify-between p-6 sm:p-10 text-white select-none">
      
      {/* Top Bar with Skip Button */}
      <div className="flex items-center justify-between w-full max-w-4xl mx-auto">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-lg">
            <Sparkles className="w-5 h-5 text-amber-300" />
          </div>
          <span className="font-black text-lg tracking-tight text-white">AtoPlay Booster</span>
        </div>

        {/* Top Right Skip Button */}
        <button
          onClick={onSkip}
          className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/25 border border-white/30 text-white text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center space-x-1 shadow-md active:scale-95"
        >
          <span>Skip</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Hero Center Content */}
      <div className="max-w-md mx-auto text-center space-y-6 my-auto">
        <div className="w-24 h-24 mx-auto bg-white rounded-3xl shadow-2xl p-3 border-4 border-white/20 flex items-center justify-center transform hover:scale-105 transition-transform">
          <img
            src="/icon.png"
            alt="AtoPlay Booster"
            className="w-full h-full object-contain rounded-2xl"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/favicon.png';
            }}
          />
        </div>

        <div className="space-y-3">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/20 border border-white/30 text-[11px] font-black uppercase tracking-wider text-amber-200">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Official Web App</span>
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
            Boost Your AtoPlay Channel Instantly
          </h1>
          <p className="text-blue-100 text-sm sm:text-base font-medium leading-relaxed">
            Install AtoPlay Booster to your home screen for lightning-fast access, full-screen view boosting, and real-time rewards.
          </p>
        </div>
      </div>

      {/* Bottom Center Install Button */}
      <div className="max-w-md mx-auto w-full pb-8 sm:pb-12 text-center space-y-4">
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className="w-full py-4 px-8 bg-white hover:bg-blue-50 active:scale-98 text-blue-700 font-black text-base sm:text-lg rounded-2xl shadow-2xl shadow-blue-900/30 transition-all flex items-center justify-center space-x-3 cursor-pointer border border-white/80"
        >
          <Download className="w-6 h-6 text-blue-600 animate-bounce" />
          <span>{isInstalling ? 'Installing App...' : 'Install App / Create Shortcut'}</span>
        </button>

        <p className="text-xs text-blue-200 font-medium">
          Fast, secure, and lightweight PWA installation.
        </p>
      </div>

      {/* iOS Installation Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-zinc-900 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-black text-zinc-900">Install on iPhone / iPad</h3>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-full hover:bg-zinc-100 text-zinc-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="text-sm text-zinc-600 space-y-3 font-medium list-decimal list-inside">
              <li>Tap the <span className="font-bold text-blue-600">Share</span> button in Safari browser toolbar.</li>
              <li>Scroll down and tap <span className="font-bold text-zinc-900">"Add to Home Screen"</span>.</li>
              <li>Tap <span className="font-bold text-zinc-900">Add</span> in the top-right corner to finish.</li>
            </ol>
            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
