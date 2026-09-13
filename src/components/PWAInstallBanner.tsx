import React, { useState } from 'react';
import { Download, X, Share, PlusSquare, Smartphone, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isDismissed, install, dismiss } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already installed or running standalone, hide completely
  if (isInstalled) {
    return null;
  }

  // If dismissed and not explicitly opened, hide banner
  if (isDismissed && !showIOSModal) {
    return null;
  }

  // If neither installable via beforeinstallprompt nor iOS Safari, don't show generic banner
  if (!isInstallable && !isIOS) {
    return null;
  }

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
    }
  };

  return (
    <>
      {/* Floating Bottom / Top Install Banner */}
      <div className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white/95 backdrop-blur-md border border-blue-200/80 rounded-2xl p-3.5 sm:p-4 shadow-xl shadow-blue-900/10 flex items-center justify-between gap-3">
          
          {/* App Icon + Information */}
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src="/icon.png"
              alt="AtoPlay Booster Logo"
              className="w-11 h-11 rounded-xl shadow-xs border border-zinc-100 object-contain shrink-0"
              onError={(e) => {
                // Fallback to favicon if needed
                (e.target as HTMLImageElement).src = '/favicon.png';
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <h4 className="font-extrabold text-sm text-zinc-900 truncate">AtoPlay Booster</h4>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-black">
                  APP
                </span>
              </div>
              <p className="text-xs text-zinc-500 truncate">Install for full-screen & fast access</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-600/25 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isInstalling ? 'Installing...' : 'Install'}</span>
            </button>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Installation Instruction Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="AtoViewer"
                  className="w-8 h-8 rounded-lg shadow-xs"
                />
                <div>
                  <h3 className="font-black text-base text-zinc-900">Install AtoViewer</h3>
                  <p className="text-[11px] text-zinc-500">iPhone / iPad Safari</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 py-1 text-xs text-zinc-700 font-medium">
              <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-zinc-900 block">Step 1: Tap Share</span>
                  Tap the Safari <strong>Share</strong> button at the bottom of the screen.
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-zinc-900 block">Step 2: Add to Home Screen</span>
                  Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-zinc-900 block">Step 3: Enjoy App</span>
                  Open AtoViewer right from your Home Screen with no address bar!
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
