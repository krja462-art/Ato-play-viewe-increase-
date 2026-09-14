import React from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  isReconnected: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOnline,
  isReconnected,
  onRefresh,
  isRefreshing = false
}) => {
  if (isOnline && !isReconnected) {
    return null;
  }

  if (isReconnected) {
    return (
      <div className="w-full bg-emerald-600 text-white px-4 py-2 text-xs sm:text-sm font-bold flex items-center justify-between shadow-md transition-all animate-in slide-in-from-top duration-300 z-50">
        <div className="flex items-center space-x-2 max-w-4xl mx-auto w-full justify-between">
          <div className="flex items-center space-x-2">
            <Wifi className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>Connection Restored! Data synchronized.</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-[11px] font-extrabold flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-500 text-zinc-950 px-4 py-2 text-xs sm:text-sm font-bold flex items-center justify-between shadow-md transition-all animate-in slide-in-from-top duration-300 z-50">
      <div className="flex items-center space-x-2 max-w-4xl mx-auto w-full justify-between">
        <div className="flex items-center space-x-2">
          <WifiOff className="w-4 h-4 text-zinc-900 shrink-0" />
          <span>You are currently offline. Showing cached videos &amp; data.</span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
};
