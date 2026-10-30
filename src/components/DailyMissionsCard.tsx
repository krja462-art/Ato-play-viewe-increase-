import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
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
  // Collapsed by default so Video Campaigns take center stage on the Home feed
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
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

  // Auto-cycle missions one by one every 3.2 seconds when in compact mode
  useEffect(() => {
    if (isExpanded || isPaused || missions.length <= 1) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % missions.length);
    }, 3200);

    return () => clearInterval(timer);
  }, [isExpanded, isPaused, missions.length]);

  const completedCount = missions.filter((m) => m.completed).length;
  const totalMissions = missions.length;
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
        return <Play className="w-3.5 h-3.5 text-blue-600 fill-current shrink-0" />;
      case 'follow_3_channels':
        return <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      case 'studio_action_1':
        return <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
      case 'mega_bonus_all':
        return <Trophy className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
    }
  };

  const activeMission = missions[activeIndex] || missions[0];

  return (
    <section
      aria-label="Daily Missions"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden transition-all duration-300"
    >
      {/* Top Compact Bar: Shows Title, Overall Count, Dots, and Expand Toggle */}
      <div className="px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-2 border-b border-zinc-100/80 bg-zinc-50/60">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
          </div>
          <span className="text-xs font-extrabold text-zinc-900 truncate">
            Daily Missions
          </span>
          <span className="text-[11px] font-semibold text-zinc-500 tabular-nums shrink-0">
            · {completedCount}/{totalMissions} (+{totalEarnedToday}/{maxDailyCoins})
          </span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {/* Animated Slide Dots when collapsed */}
          {!isExpanded && (
            <div className="flex items-center space-x-1">
              {missions.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`Show mission ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === activeIndex
                      ? 'w-4 bg-blue-600'
                      : m.completed
                      ? 'w-1.5 bg-emerald-400'
                      : 'w-1.5 bg-zinc-300 hover:bg-zinc-400'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Expand / Collapse Button */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="px-2 py-1 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200/80 text-zinc-600 text-[11px] font-bold inline-flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Hide' : 'All 4'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Mode 1 (Default): Single-Card Animated Carousel (Moves 1-by-1 smoothly) */}
      {!isExpanded && activeMission && (
        <div className="relative overflow-hidden px-3.5 py-2.5">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {missions.map((mission) => {
              const pct = Math.min(100, Math.round((mission.current / mission.target) * 100));
              const isMega = mission.id === 'mega_bonus_all';

              return (
                <div
                  key={mission.id}
                  className="w-full shrink-0 pr-0.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                          mission.completed
                            ? 'bg-emerald-50 border-emerald-200'
                            : isMega
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-blue-50/70 border-blue-200/70'
                        }`}
                      >
                        {getMissionIcon(mission.id, mission.completed)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                          {mission.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="inline-flex items-center space-x-1 text-xs font-bold text-amber-900 tabular-nums">
                        <RealCoin size="sm" />
                        <span>+{mission.rewardCoins}</span>
                      </div>

                      {mission.completed ? (
                        <span className="text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                          Done ✓
                        </span>
                      ) : !isMega ? (
                        <button
                          type="button"
                          onClick={() => onNavigateAction(mission.actionTarget)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] inline-flex items-center space-x-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <span>{mission.actionLabel}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Compact Visual Progress Bar */}
                  <div className="flex items-center gap-2 pl-9">
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
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
                    <span className="text-[11px] font-mono font-bold text-zinc-600 tabular-nums shrink-0">
                      {mission.current}/{mission.target}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode 2 (When User Taps 'All 4'): Full Expanded List */}
      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1 divide-y divide-zinc-100 animate-in fade-in duration-200">
          {missions.map((mission) => {
            const pct = Math.min(100, Math.round((mission.current / mission.target) * 100));
            const isMega = mission.id === 'mega_bonus_all';

            return (
              <div
                key={mission.id}
                className="py-2.5 first:pt-2 last:pb-0.5 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
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
                      <p className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                        {mission.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {mission.subtitle}
                      </p>
                    </div>
                  </div>

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
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs inline-flex items-center space-x-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>{mission.actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-9">
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
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
                  <span className="text-[11px] font-mono font-bold text-zinc-600 tabular-nums shrink-0">
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
