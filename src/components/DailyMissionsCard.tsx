import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Play,
  Users,
  Sparkles,
  Trophy,
  ArrowRight
} from 'lucide-react';
import { RealCoin } from './RealCoin';
import {
  DailyMissionItem,
  loadDailyMissionProgress,
  buildDailyMissionsList
} from '../utils/dailyMissions';

interface DailyMissionsCardProps {
  userId: string;
  onNavigateAction: (target: 'video' | 'follower' | 'ai-assistant') => void;
}

export const DailyMissionsCard: React.FC<DailyMissionsCardProps> = ({
  userId,
  onNavigateAction
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [missions, setMissions] = useState<DailyMissionItem[]>(() =>
    buildDailyMissionsList(loadDailyMissionProgress(userId))
  );

  useEffect(() => {
    const syncMissions = () => {
      const progress = loadDailyMissionProgress(userId);
      setMissions(buildDailyMissionsList(progress));
    };

    syncMissions();

    const handleMissionEvent = () => {
      syncMissions();
    };

    window.addEventListener('atoplay-mission-updated', handleMissionEvent);
    window.addEventListener('focus', syncMissions);
    return () => {
      window.removeEventListener('atoplay-mission-updated', handleMissionEvent);
      window.removeEventListener('focus', syncMissions);
    };
  }, [userId]);

  const completedCount = missions.filter((m) => m.completed).length;
  const totalMissions = missions.length;
  const overallPercent = Math.round((completedCount / totalMissions) * 100);
  const totalEarnedToday = missions
    .filter((m) => m.completed)
    .reduce((sum, m) => sum + m.rewardCoins, 0);
  const maxDailyCoins = missions.reduce((sum, m) => sum + m.rewardCoins, 0);

  const getMissionIcon = (id: DailyMissionItem['id'], completed: boolean) => {
    if (completed) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    switch (id) {
      case 'watch_5_videos':
        return <Play className="w-4 h-4 text-blue-600 fill-current shrink-0" />;
      case 'follow_3_channels':
        return <Users className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'studio_action_1':
        return <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />;
      case 'mega_bonus_all':
        return <Trophy className="w-4 h-4 text-amber-600 shrink-0" />;
    }
  };

  return (
    <section
      aria-label="Daily Missions"
      className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden transition-all"
    >
      {/* Collapsible Card Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full min-h-[56px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-zinc-50/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
                Daily Missions
              </h2>
              <span className="text-xs font-semibold text-zinc-500 tabular-nums shrink-0">
                {completedCount}/{totalMissions} Done · +{totalEarnedToday}/{maxDailyCoins} Coins
              </span>
            </div>

            {/* Overall Visual Progress Bar */}
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden border border-zinc-200/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 transition-all duration-500"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-blue-600 tabular-nums shrink-0">
                {overallPercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expandable Missions List */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-100 divide-y divide-zinc-100">
          {missions.map((mission) => {
            const pct = Math.min(100, Math.round((mission.current / mission.target) * 100));
            const isMega = mission.id === 'mega_bonus_all';

            return (
              <div
                key={mission.id}
                className={`py-3 first:pt-2.5 last:pb-0.5 flex flex-col gap-2 ${
                  mission.completed ? 'opacity-95' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                        mission.completed
                          ? 'bg-emerald-50 border-emerald-200'
                          : isMega
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-zinc-50 border-zinc-200/80'
                      }`}
                    >
                      {getMissionIcon(mission.id, mission.completed)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-zinc-900 leading-snug">
                        {mission.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                        {mission.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Auto-Credit Reward Display & Quick Action */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <div className="inline-flex items-center space-x-1 text-xs font-bold text-amber-900 tabular-nums">
                      <RealCoin size="sm" />
                      <span>+{mission.rewardCoins}</span>
                    </div>

                    {mission.completed ? (
                      <span className="text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                        Credited ✓
                      </span>
                    ) : !isMega ? (
                      <button
                        type="button"
                        onClick={() => onNavigateAction(mission.actionTarget)}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs inline-flex items-center space-x-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>{mission.actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Task Individual Visual Progress Bar */}
                <div className="flex items-center gap-2.5 pl-10">
                  <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        mission.completed
                          ? 'bg-emerald-500'
                          : isMega
                          ? 'bg-amber-500'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-zinc-600 tabular-nums shrink-0 w-10 text-right">
                    {mission.current}/{mission.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
