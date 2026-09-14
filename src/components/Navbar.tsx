import React, { useState } from 'react';
import { Coins, Home, ShieldCheck, Plus, MoreVertical, RefreshCw } from 'lucide-react';
import { User } from '../types';
import { SlideDrawer } from './SlideDrawer';

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
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  coins,
  onOpenCreate,
  user,
  onLogout,
  onRefresh,
  isRefreshing = false
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      {/* Top Header - Pure Clean Modern Theme */}
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-200/90 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo - Top Left with User's Uploaded Logo */}
          <div className="flex items-center space-x-2.5 cursor-pointer select-none" onClick={() => setActiveTab('home')}>
            <img
              src="/icon.png"
              alt="AtoPlay Booster Logo"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-contain shadow-xs border border-zinc-200/80"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/favicon.png';
              }}
            />
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-lg sm:text-xl text-zinc-900 tracking-tight">AtoPlay</span>
              <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-black uppercase tracking-wider shadow-xs">
                BOOSTER
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home (Watch & Earn)</span>
            </button>

            {/* Desktop Center Create Button */}
            <button
              onClick={onOpenCreate}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 transition-all hover:scale-102 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Campaign</span>
            </button>

            <button
              onClick={() => setActiveTab('campaigns')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'campaigns'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>My Campaigns</span>
            </button>
          </nav>

          {/* Right Header Actions: Coin Balance & Three Dots Menu (Avatar & Logout moved inside Slide Drawer) */}
          <div className="flex items-center space-x-2.5">
            {Boolean(user?.isAdmin || user?.email?.toLowerCase().trim() === 'krja462@gmail.com') ? (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm font-extrabold shadow-xs">
                <Coins className="w-4 h-4 text-amber-600" />
                <span>∞ Unlimited Coins</span>
                <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                  Admin 👑
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-extrabold shadow-xs">
                <Coins className="w-4 h-4 text-amber-600" />
                <span>{coins.toLocaleString()} Coins</span>
              </div>
            )}

            {/* Quick App & Feed Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-xl text-zinc-700 hover:text-blue-600 hover:bg-zinc-100 transition-colors cursor-pointer flex items-center justify-center border border-zinc-200/80 shadow-xs active:scale-95"
                title="Refresh Feed & Sync Coins"
                aria-label="Refresh Feed & Sync Coins"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            )}

            {/* Three Dots Button to Open Slide Drawer */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 rounded-xl text-zinc-700 hover:text-blue-600 hover:bg-zinc-100 transition-colors cursor-pointer flex items-center justify-center border border-zinc-200/80 shadow-xs"
              title="Open Menu"
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
      />

      {/* Professional Fixed Bottom Navigation Bar (Hidden when Slide Drawer is open) */}
      {!isDrawerOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-6 py-2 shadow-2xl flex items-center justify-between max-w-lg mx-auto sm:rounded-t-3xl sm:border-x">
          
          {/* Home Tab Button (Left) */}
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all cursor-pointer ${
              activeTab === 'home' 
                ? 'text-blue-600 font-bold' 
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === 'home' ? 'bg-blue-50' : ''}`}>
              <Home className="w-5 h-5" />
            </div>
            <span className="text-[11px] pt-0.5 font-bold">Home</span>
          </button>

          {/* Professional Center Elevated Plus Button (Center) */}
          <div className="flex flex-col items-center justify-center px-4 -mt-6 shrink-0">
            <button
              onClick={onOpenCreate}
              className="w-13 h-13 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-600/40 ring-4 ring-white active:scale-95 transition-all hover:scale-105 cursor-pointer group"
              title="Create Campaign"
            >
              <Plus className="w-7 h-7 stroke-[3] transition-transform group-hover:rotate-90 duration-300" />
            </button>
            <span className="text-[10px] font-black text-blue-600 tracking-tight pt-1">Create</span>
          </div>

          {/* Campaign Tab Button (Right) */}
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all cursor-pointer ${
              activeTab === 'campaigns' 
                ? 'text-blue-600 font-bold' 
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === 'campaigns' ? 'bg-blue-50' : ''}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[11px] pt-0.5 font-bold">Campaign</span>
          </button>

        </nav>
      )}
    </>
  );
};
