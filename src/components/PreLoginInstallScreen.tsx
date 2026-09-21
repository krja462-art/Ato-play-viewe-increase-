import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Sparkles, 
  Smartphone, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Maximize2,
  CheckCircle2,
  Tv,
  Flame,
  Coins
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PreLoginInstallScreenProps {
  onSkip: () => void;
}

interface ScreenshotItem {
  id: number;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  primaryUrl: string;
  fallbackUrls: string[];
}

const SCREENSHOTS: ScreenshotItem[] = [
  {
    id: 1,
    title: 'Watch & Earn 60s Coins',
    subtitle: 'Watch real AtoPlay creators, track the 60s progress bar, and claim instant rewards.',
    badge: 'Watch & Earn',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    icon: <Tv className="w-3.5 h-3.5 text-amber-300" />,
    primaryUrl: encodeURI('/App screenshots 1 .jpg'),
    fallbackUrls: [
      encodeURI('/App screenshots 1.jpg'),
      '/App%20screenshots%201%20.jpg',
      '/Screenshot.png'
    ]
  },
  {
    id: 2,
    title: 'Promote Videos & Grow Channel',
    subtitle: 'Paste any AtoPlay video link to launch fast view campaigns with real subscribers.',
    badge: 'Channel Booster',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
    icon: <Flame className="w-3.5 h-3.5 text-blue-300" />,
    primaryUrl: encodeURI('/App screenshots 2 .jpg'),
    fallbackUrls: [
      encodeURI('/App screenshots 2.jpg'),
      '/App%20screenshots%202%20.jpg',
      '/Screenshot.png'
    ]
  },
  {
    id: 3,
    title: 'Daily Rewards & Coin Wallet',
    subtitle: 'Earn 7-day streak rewards, invite creators for bonus coins, and manage transactions.',
    badge: 'Free Daily Coins',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
    icon: <Coins className="w-3.5 h-3.5 text-emerald-300" />,
    primaryUrl: encodeURI('/App screenshots 3.jpg'),
    fallbackUrls: [
      encodeURI('/App screenshots 3 .jpg'),
      '/App%20screenshots%203.jpg',
      '/Screenshot.png'
    ]
  }
];

export const PreLoginInstallScreen: React.FC<PreLoginInstallScreenProps> = ({ onSkip }) => {
  const { isInstallable, isIOS, install } = usePWAInstall();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Error fallback tracking per screenshot index
  const [fallbackIndexMap, setFallbackIndexMap] = useState<{ [key: number]: number }>({});

  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-move carousel every 3.5 seconds when not paused by user hover/touch
  useEffect(() => {
    if (isPaused) return;

    autoTimerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % SCREENSHOTS.length);
    }, 3500);

    return () => {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
      }
    };
  }, [isPaused]);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? SCREENSHOTS.length - 1 : prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % SCREENSHOTS.length);
  };

  const handleImageError = (screenshotId: number) => {
    setFallbackIndexMap((prev) => {
      const currentFallback = prev[screenshotId] || 0;
      return { ...prev, [screenshotId]: currentFallback + 1 };
    });
  };

  const getCurrentImageUrl = (item: ScreenshotItem) => {
    const fallbackStep = fallbackIndexMap[item.id] || 0;
    if (fallbackStep === 0) return item.primaryUrl;
    const fallbacks = item.fallbackUrls;
    if (fallbackStep - 1 < fallbacks.length) {
      return fallbacks[fallbackStep - 1];
    }
    return '/Screenshot.png';
  };

  const handleInstallClick = async () => {
    try {
      localStorage.setItem('pwa_prelogin_installed', 'true');
      localStorage.setItem('pwa_installed', 'true');
    } catch {}

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
        onSkip();
      }
    } else {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      if (/android/i.test(userAgent)) {
        window.alert('To install AtoPlay Booster instantly on Android:\n1. Tap the Chrome 3-dots menu (top right)\n2. Select "Add to Home screen" or "Install app"');
      } else if (/iphone|ipad|ipod/i.test(userAgent)) {
        setShowIOSModal(true);
      } else {
        window.alert('To install AtoPlay Booster, tap your browser menu and select "Install AtoPlay Booster" or "Add to Home Screen".');
      }
      onSkip();
    }
  };

  const activeScreenshot = SCREENSHOTS[currentIndex];

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-blue-700 via-blue-800 to-indigo-950 flex flex-col justify-between p-4 sm:p-6 text-white select-none overflow-y-auto">
      
      {/* Top Bar with Brand and Skip Button */}
      <header className="flex items-center justify-between w-full max-w-4xl mx-auto py-2 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
            <Sparkles className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <span className="font-black text-lg sm:text-xl tracking-tight text-white block leading-tight">
              AtoPlay Booster
            </span>
            <span className="text-[11px] text-blue-200 font-medium">
              Official Promotion Network
            </span>
          </div>
        </div>

        {/* Skip to Login Button */}
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center space-x-1.5 shadow-md active:scale-95"
        >
          <span>Continue to Login</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content: Auto-Moving App Screenshot Carousel */}
      <main className="w-full max-w-md mx-auto my-auto flex flex-col items-center py-2 sm:py-4">
        
        {/* Active Slide Info Badge */}
        <div className="flex items-center space-x-2 mb-2">
          <div className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full border text-xs font-bold ${activeScreenshot.badgeColor}`}>
            {activeScreenshot.icon}
            <span>{activeScreenshot.badge}</span>
          </div>
          <span className="text-xs font-bold text-blue-200 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
            {currentIndex + 1} / {SCREENSHOTS.length}
          </span>
        </div>

        {/* Interactive Phone Frame Container with Auto-Move Slider */}
        <div 
          className="relative w-full max-w-[280px] sm:max-w-[310px] aspect-[9/16] max-h-[58vh] bg-zinc-950 rounded-[32px] sm:rounded-[36px] p-2.5 border-4 border-white/20 shadow-2xl shadow-black/60 overflow-hidden flex flex-col"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {/* Top Notch / Speaker Grill */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-3.5 bg-black/80 rounded-full z-20 flex items-center justify-center pointer-events-none">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 ml-auto mr-2" />
          </div>

          {/* Screenshot Slides Wrapper */}
          <div className="relative w-full h-full rounded-[24px] overflow-hidden bg-zinc-900 group">
            {SCREENSHOTS.map((item, index) => {
              const isActive = index === currentIndex;
              return (
                <div
                  key={item.id}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                >
                  <img
                    src={getCurrentImageUrl(item)}
                    alt={item.title}
                    onError={() => handleImageError(item.id)}
                    className="w-full h-full object-cover object-top cursor-zoom-in"
                    onClick={() => setZoomImage(getCurrentImageUrl(item))}
                  />
                  {/* Subtle bottom shadow vignette for contrast */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                </div>
              );
            })}

            {/* Tap to Fullscreen Icon */}
            <button
              type="button"
              onClick={() => setZoomImage(getCurrentImageUrl(activeScreenshot))}
              className="absolute bottom-3 right-3 z-20 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white/90 backdrop-blur-xs transition-all cursor-pointer shadow-md"
              title="Click to zoom screenshot"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Left Prev Arrow Button */}
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/90 backdrop-blur-xs transition-all cursor-pointer shadow-lg active:scale-95"
              aria-label="Previous Screenshot"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Right Next Arrow Button */}
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/90 backdrop-blur-xs transition-all cursor-pointer shadow-lg active:scale-95"
              aria-label="Next Screenshot"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom Indicators inside phone */}
          <div className="flex items-center justify-center space-x-1.5 py-1.5 z-20">
            {SCREENSHOTS.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentIndex ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
                }`}
                aria-label={`Go to screenshot ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Slide Title & Subtitle */}
        <div className="text-center mt-2.5 space-y-1 max-w-sm px-2">
          <h2 className="text-base sm:text-lg font-black text-white leading-tight">
            {activeScreenshot.title}
          </h2>
          <p className="text-xs text-blue-100/90 leading-relaxed line-clamp-2">
            {activeScreenshot.subtitle}
          </p>
        </div>

      </main>

      {/* "inke niche install app baner ho" - Modern Install App Banner */}
      <footer className="w-full max-w-md mx-auto pt-2 pb-3 shrink-0">
        <div className="bg-white text-zinc-900 border border-blue-200/90 rounded-3xl p-3.5 sm:p-4 shadow-2xl flex items-center justify-between gap-3">
          
          {/* App Icon + Information */}
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src="/icon.png"
                alt="AtoPlay Booster Logo"
                className="w-12 h-12 rounded-2xl shadow-xs border border-zinc-100 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/favicon.png';
                }}
              />
              <span className="absolute -bottom-1 -right-1 p-0.5 bg-blue-600 rounded-full text-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <h3 className="font-black text-sm sm:text-base text-zinc-900 truncate">
                  AtoPlay Booster
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-black shrink-0">
                  FREE APP
                </span>
              </div>
              <p className="text-xs text-zinc-500 truncate mt-0.5">
                Install for auto-viewing & instant coins
              </p>
            </div>
          </div>

          {/* Action Buttons: Install & Skip */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isInstalling ? 'Installing...' : 'Install App'}</span>
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
              title="Skip to Login"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        </div>
      </footer>

      {/* Fullscreen Screenshot Zoom Modal */}
      {zoomImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-sm w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="absolute -top-12 right-0 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={zoomImage}
              alt="Screenshot Preview"
              className="max-h-[80vh] w-auto rounded-3xl shadow-2xl border-2 border-white/20 object-contain"
            />
            <p className="text-white/80 text-xs mt-3 font-medium">
              Tap anywhere to close
            </p>
          </div>
        </div>
      )}

      {/* iOS Installation Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-zinc-900 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-lg font-black text-zinc-900">Install on iPhone / iPad</h3>
              <button
                type="button"
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
              type="button"
              onClick={() => {
                setShowIOSModal(false);
                onSkip();
              }}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all cursor-pointer"
            >
              Got it, Continue
            </button>
          </div>
        </div>
      )}

    </div>
  );
};


