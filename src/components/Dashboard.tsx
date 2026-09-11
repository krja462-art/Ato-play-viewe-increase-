import React from 'react';
import { User, Campaign } from '../types';
import { Play, TrendingUp, Coins, ShieldCheck, Flame, Gift, Video, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface DashboardProps {
  user: User;
  campaigns: Campaign[];
  setActiveTab: (tab: string) => void;
  onOpenCreate: () => void;
  onOpenPrompt: () => void;
  onClaimCheckin: () => void;
  onWatchAd: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  campaigns,
  setActiveTab,
  onOpenCreate,
  onOpenPrompt,
  onClaimCheckin,
  onWatchAd
}) => {
  const myCampaigns = campaigns.filter(c => c.userId === user.id);
  const activeCount = myCampaigns.filter(c => c.status === 'active').length;
  const totalViewsEarned = myCampaigns.reduce((acc, c) => acc + c.completedViews, 0);

  const today = new Date().toISOString().split('T')[0];
  const hasCheckedInToday = user.lastCheckIn === today;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 text-white p-6 sm:p-10 shadow-xl shadow-red-600/20">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold uppercase tracking-wider text-white">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>AtoPlay Video Promotion Network</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Grow Your AtoPlay Views Organically 🚀
            </h1>
            <p className="text-red-100 text-sm sm:text-base leading-relaxed">
              Watch fellow creators' videos to earn virtual coins, then use your coins to boost your own AtoPlay video campaigns instantly with anti-fraud verification.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('watch')}
              className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-6 py-3.5 rounded-2xl bg-white text-red-600 font-bold hover:bg-red-50 transition-all shadow-lg hover:scale-105"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Watch & Earn</span>
            </button>
            <button
              onClick={onOpenCreate}
              className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-6 py-3.5 rounded-2xl bg-black/30 hover:bg-black/40 text-white font-bold backdrop-blur-md border border-white/20 transition-all hover:scale-105"
            >
              <TrendingUp className="w-5 h-5" />
              <span>Create Campaign</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Coin Balance</p>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-white">{user.coins.toLocaleString()}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center">
              <span>Ready to spend or earn</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-400 flex items-center justify-center">
            <Coins className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Active Campaigns</p>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-white">{activeCount}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {myCampaigns.length} total campaigns created
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Views Delivered</p>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-white">{totalViewsEarned}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Real AtoPlay viewers</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Video className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Login Streak</p>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-white">{user.streak} Days</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Keep streak alive!</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Flame className="w-6 h-6 fill-current" />
          </div>
        </div>

      </div>

      {/* Daily Check-In & AdMob Rewards Widget */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Daily Check-In Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Flame className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Daily Streak Check-In</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Day {user.streak} login reward</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                +{50 + user.streak * 10} Coins
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Check in every day to multiply your coin rewards and keep your promotion streak burning bright!
            </p>
          </div>
          
          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex space-x-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                <div 
                  key={day}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    day <= user.streak 
                      ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30' 
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {day <= user.streak ? <CheckCircle2 className="w-4 h-4" /> : `D${day}`}
                </div>
              ))}
            </div>

            <button
              onClick={onClaimCheckin}
              disabled={hasCheckedInToday}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                hasCheckedInToday
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 hover:scale-105'
              }`}
            >
              {hasCheckedInToday ? 'Checked In Today' : 'Claim Reward'}
            </button>
          </div>
        </div>

        {/* AdMob Rewarded Video Ad Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-white">AdMob Rewarded Video</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Instant +100 Bonus Coins</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900">
                Ad Ready
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Watch a short 30-second sponsored rewarded ad simulation to instantly earn bonus coins without watching creator videos.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Sponsored by Google AdMob</span>
            <button
              onClick={onWatchAd}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all hover:scale-105 flex items-center space-x-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Watch Ad (+100 Coins)</span>
            </button>
          </div>
        </div>

      </div>

      {/* Active Campaigns & Master Prompt Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Active Campaigns Preview */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">My Active Campaigns</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Real-time view progress tracking</p>
            </div>
            <button 
              onClick={() => setActiveTab('campaigns')}
              className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center space-x-1"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {myCampaigns.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <Video className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-600 dark:text-zinc-400 font-medium">No promotion campaigns yet</p>
              <p className="text-xs text-zinc-400 mt-1 mb-4">Promote your AtoPlay video to start getting views</p>
              <button
                onClick={onOpenCreate}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-md"
              >
                Create First Campaign
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myCampaigns.slice(0, 3).map(camp => {
                const progress = Math.min(100, Math.round((camp.completedViews / camp.targetViews) * 100));
                return (
                  <div key={camp.id} className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <img src={camp.thumbnailUrl} alt={camp.title} className="w-20 h-12 object-cover rounded-lg shadow-sm" />
                      <div className="space-y-1">
                        <h4 className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1">{camp.title}</h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Duration: {camp.durationSeconds}s • Cost: {camp.totalCoinsCost} coins</p>
                      </div>
                    </div>

                    <div className="w-full sm:w-48 space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-700 dark:text-zinc-300">{camp.completedViews} / {camp.targetViews} views</span>
                        <span className="text-red-600 dark:text-red-400">{progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-red-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Master Prompt / Developer Info Card */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between border border-zinc-800">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Master Prompt & Blueprint</h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Looking for the exact prompt requested for generating this AtoPlay Video Promotion App in Cursor, Claude, or ChatGPT? View or copy it instantly.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-zinc-800">
            <button
              onClick={onOpenPrompt}
              className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-all border border-white/10 flex items-center justify-center space-x-2"
            >
              <span>View Master Prompt</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
