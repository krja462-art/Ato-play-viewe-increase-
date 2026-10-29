import React, { useState, useEffect, useRef } from 'react';
import { Home, ShieldCheck, Plus, MoreVertical, RefreshCw, Sparkles } from 'lucide-react';
import { User } from '../types';
import { SlideDrawer } from './SlideDrawer';
import { RealCoin } from './RealCoin';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  coins: number;
  streak: number;
  onOpenCreate: () => void;
  user?: User | null;
  onLogout?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onUserUpdate?: (updatedUser: User) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  coins,
  onOpenCreate,
  user,
  onLogout,
  onRefresh,
  isRefreshing = false,
  onUserUpdate
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [displayCoins, setDisplayCoins] = useState(coins);
  const [isCoinPumping, setIsCoinPumping] = useState(false);
  const prevCoinsRef = useRef(coins);

  useEffect(() => {
    if (coins !== prevCoinsRef.current) {
      const startVal = displayCoins;
      const endVal = coins;
      const diff = endVal - startVal;
      if (diff > 0) {
        setIsCoinPumping(true);
        setTimeout(() => setIsCoinPumping(false), 900);
      }
      
      const duration = 700; // ms
      const startTime = performance.now();

      const animateCount = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = Math.round(startVal + diff * ease);

        setDisplayCoins(current);

        if (progress < 1) {
          requestAnimationFrame(animateCount);
        } else {
          setDisplayCoins(endVal);
          prevCoinsRef.current = endVal;
        }
      };

      requestAnimationFrame(animateCount);
    }
  }, [coins]);

  return (
    <>
      {/* Top Header - Authentic Real App Native Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-colors duration-200 select-none">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          
          {/* Brand Identity - Clean Product Lockup */}
          <div className="flex items-center space-x-2 cursor-pointer select-none min-w-0" onClick={() => setActiveTab('home')}>
            <img
              src="/icon.png"
              alt="AtoPlay Booster Logo"
              className="w-9 h-9 rounded-xl object-contain shadow-xs border border-zinc-200/80 shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/favicon.png';
              }}
            />
            <div className="flex flex-col -space-y-0.5 min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-base sm:text-lg text-zinc-900 tracking-tight truncate">AtoPlay</span>
                <span className="hidden sm:inline-block text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200/50">Booster</span>
              </div>
              <span className="text-[10px] font-medium text-zinc-600 tracking-tight truncate">Creator Studio</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Watch & Earn</span>
            </button>

            {/* Desktop Center Create Button */}
            <button
              onClick={onOpenCreate}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Campaign</span>
            </button>

            <button
              onClick={() => setActiveTab('campaigns')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'campaigns'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>My Campaigns</span>
            </button>

            <button
              onClick={() => setActiveTab('ai-assistant')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'ai-assistant'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>AI Assistant</span>
            </button>

            {Boolean(user?.isAdmin || user?.email?.toLowerCase().trim() === 'krja462@gmail.com') && (
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Admin Users</span>
              </button>
            )}
          </nav>

          {/* Right Header Actions: 3D Metallic Gold Coin Balance & Menu */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {Boolean(user?.isAdmin || user?.email?.toLowerCase().trim() === 'krja462@gmail.com') ? (
              <div className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-b from-amber-50 to-amber-100/90 border border-amber-300/80 text-amber-950 text-xs sm:text-sm font-bold shadow-xs">
                <RealCoin size="sm" />
                <span className="tabular-nums font-extrabold">∞</span>
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">Admin</span>
              </div>
            ) : (
              <div className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-b from-amber-50 to-amber-100/90 border border-amber-300/80 text-amber-950 text-xs sm:text-sm font-bold shadow-xs transition-transform duration-300 ${isCoinPumping ? 'scale-105 ring-2 ring-amber-400/60 bg-amber-100' : ''}`}>
                <RealCoin size="sm" animate={isCoinPumping} />
                <span className="tabular-nums font-extrabold tracking-tight">{displayCoins.toLocaleString()}</span>
                <span className="text-[11px] font-bold text-amber-800 hidden sm:inline">Coins</span>
              </div>
            )}

            {/* Quick App & Feed Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="w-9 h-9 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80 transition-colors cursor-pointer flex items-center justify-center border border-zinc-200/80 shadow-2xs active:scale-95"
                title="Refresh Feed & Sync Coins"
                aria-label="Refresh Feed & Sync Coins"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            )}

            {/* Three Dots Button to Open Slide Drawer */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="w-9 h-9 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80 transition-colors cursor-pointer flex items-center justify-center border border-zinc-200/80 shadow-2xs active:scale-95"
              title="Open Menu"
              aria-label="Open Menu"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>

        </div>
      </header>

      {/* Slide-out Drawer with Account Avatar, Privacy Policy, Terms, Contact Us and Logout */}
      <SlideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={user || null}
        onLogout={onLogout}
        onUserUpdate={onUserUpdate}
      />

      {/* Professional Fixed Bottom Navigation Bar (Hidden when Slide Drawer is open) */}
      {!isDrawerOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 px-2 pt-1.5 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.04)] flex items-center justify-around max-w-lg mx-auto sm:rounded-t-2xl sm:border-x select-none">
          
          {/* Home Tab Button */}
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all cursor-pointer active:scale-95 ${
              activeTab === 'home' 
                ? 'text-blue-600' 
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Home className="w-5 h-5 stroke-[2.2]" />
            <span className={`text-[11px] pt-0.5 tracking-tight ${activeTab === 'home' ? 'font-bold' : 'font-medium'}`}>
              Watch
            </span>
          </button>

          {/* Center Create Button - Sleek Native App Action */}
          <button
            onClick={onOpenCreate}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs shadow-sm shadow-blue-600/30 transition-all cursor-pointer"
            title="Create Campaign"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create</span>
          </button>

          {/* Campaign Tab Button */}
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'campaigns' 
                ? 'text-blue-600' 
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
            <span className={`text-[11px] pt-0.5 tracking-tight ${activeTab === 'campaigns' ? 'font-bold' : 'font-medium'}`}>
              Campaigns
            </span>
          </button>

          {/* AI Video Growth Assistant Tab Button */}
          <button
            onClick={() => setActiveTab('ai-assistant')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'ai-assistant' 
                ? 'text-blue-600' 
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Sparkles className="w-5 h-5 stroke-[2.2]" />
            <span className={`text-[11px] pt-0.5 tracking-tight ${activeTab === 'ai-assistant' ? 'font-bold' : 'font-medium'}`}>
              AI Assistant
            </span>
          </button>
        </nav>
      )}
    </>
  );
};
