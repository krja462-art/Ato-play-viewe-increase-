export type MissionActionType = 'watch' | 'follow' | 'studio';

export interface DailyMissionProgress {
  date: string;
  videosWatched: number;
  channelsFollowed: number;
  studioUsed: number;
  rewardedIds: string[];
}

export interface DailyMissionItem {
  id: 'watch_5_videos' | 'follow_3_channels' | 'studio_action_1' | 'mega_bonus_all';
  title: string;
  subtitle: string;
  current: number;
  target: number;
  rewardCoins: number;
  completed: boolean;
  rewarded: boolean;
  actionLabel: string;
  actionTarget: 'video' | 'follower' | 'ai-assistant';
}

export interface MissionUpdateResult {
  progress: DailyMissionProgress;
  missions: DailyMissionItem[];
  newlyEarnedBonusCoins: number;
  newlyCompletedTitles: string[];
}

export const getTodayDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStorageKey = (userId: string, dateKey: string): string => {
  return `atoplay_daily_missions_${userId || 'guest'}_${dateKey}`;
};

export const loadDailyMissionProgress = (userId: string): DailyMissionProgress => {
  const today = getTodayDateKey();
  const key = getStorageKey(userId, today);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) {
        return {
          date: today,
          videosWatched: Math.max(0, Number(parsed.videosWatched) || 0),
          channelsFollowed: Math.max(0, Number(parsed.channelsFollowed) || 0),
          studioUsed: Math.max(0, Number(parsed.studioUsed) || 0),
          rewardedIds: Array.isArray(parsed.rewardedIds) ? parsed.rewardedIds : []
        };
      }
    }
  } catch (e) {
    console.warn('Failed to read daily missions progress:', e);
  }
  return {
    date: today,
    videosWatched: 0,
    channelsFollowed: 0,
    studioUsed: 0,
    rewardedIds: []
  };
};

export const saveDailyMissionProgress = (userId: string, progress: DailyMissionProgress): void => {
  const key = getStorageKey(userId, progress.date || getTodayDateKey());
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch (e) {
    console.warn('Failed to save daily missions progress:', e);
  }
};

export const buildDailyMissionsList = (progress: DailyMissionProgress): DailyMissionItem[] => {
  const watchCount = Math.min(5, progress.videosWatched);
  const followCount = Math.min(3, progress.channelsFollowed);
  const studioCount = Math.min(1, progress.studioUsed);

  const watchDone = watchCount >= 5 || progress.rewardedIds.includes('watch_5_videos');
  const followDone = followCount >= 3 || progress.rewardedIds.includes('follow_3_channels');
  const studioDone = studioCount >= 1 || progress.rewardedIds.includes('studio_action_1');

  const coreCompletedCount = [watchDone, followDone, studioDone].filter(Boolean).length;
  const megaDone = coreCompletedCount >= 3 || progress.rewardedIds.includes('mega_bonus_all');

  return [
    {
      id: 'watch_5_videos',
      title: 'Watch 5 Videos',
      subtitle: 'Watch 5 creator videos for 60 seconds',
      current: watchDone ? 5 : watchCount,
      target: 5,
      rewardCoins: 150,
      completed: watchDone,
      rewarded: progress.rewardedIds.includes('watch_5_videos'),
      actionLabel: 'Watch',
      actionTarget: 'video'
    },
    {
      id: 'follow_3_channels',
      title: 'Follow 3 Creator Channels',
      subtitle: 'Subscribe to 3 channels in Follower Campaigns',
      current: followDone ? 3 : followCount,
      target: 3,
      rewardCoins: 100,
      completed: followDone,
      rewarded: progress.rewardedIds.includes('follow_3_channels'),
      actionLabel: 'Follow',
      actionTarget: 'follower'
    },
    {
      id: 'studio_action_1',
      title: 'Create 1 Campaign or Use AI Assistant',
      subtitle: 'Launch a campaign or generate viral SEO with AI',
      current: studioDone ? 1 : studioCount,
      target: 1,
      rewardCoins: 80,
      completed: studioDone,
      rewarded: progress.rewardedIds.includes('studio_action_1'),
      actionLabel: 'AI Studio',
      actionTarget: 'ai-assistant'
    },
    {
      id: 'mega_bonus_all',
      title: 'Complete All Daily Tasks Mega Bonus',
      subtitle: 'Finish all 3 daily missions above for a mega reward',
      current: megaDone ? 3 : coreCompletedCount,
      target: 3,
      rewardCoins: 200,
      completed: megaDone,
      rewarded: progress.rewardedIds.includes('mega_bonus_all'),
      actionLabel: 'In Progress',
      actionTarget: 'video'
    }
  ];
};

export const recordDailyMissionAction = (
  userId: string,
  action: MissionActionType
): MissionUpdateResult => {
  const current = loadDailyMissionProgress(userId);
  const next: DailyMissionProgress = {
    ...current,
    rewardedIds: [...current.rewardedIds]
  };

  if (action === 'watch') {
    next.videosWatched = Math.min(5, next.videosWatched + 1);
  } else if (action === 'follow') {
    next.channelsFollowed = Math.min(3, next.channelsFollowed + 1);
  } else if (action === 'studio') {
    next.studioUsed = Math.min(1, next.studioUsed + 1);
  }

  let newlyEarnedBonusCoins = 0;
  const newlyCompletedTitles: string[] = [];

  if (next.videosWatched >= 5 && !next.rewardedIds.includes('watch_5_videos')) {
    next.rewardedIds.push('watch_5_videos');
    newlyEarnedBonusCoins += 150;
    newlyCompletedTitles.push('Watch 5 Videos (+150 Coins)');
  }

  if (next.channelsFollowed >= 3 && !next.rewardedIds.includes('follow_3_channels')) {
    next.rewardedIds.push('follow_3_channels');
    newlyEarnedBonusCoins += 100;
    newlyCompletedTitles.push('Follow 3 Channels (+100 Coins)');
  }

  if (next.studioUsed >= 1 && !next.rewardedIds.includes('studio_action_1')) {
    next.rewardedIds.push('studio_action_1');
    newlyEarnedBonusCoins += 80;
    newlyCompletedTitles.push('Creator Studio Task (+80 Coins)');
  }

  const allThreeCoreRewarded =
    next.rewardedIds.includes('watch_5_videos') &&
    next.rewardedIds.includes('follow_3_channels') &&
    next.rewardedIds.includes('studio_action_1');

  if (allThreeCoreRewarded && !next.rewardedIds.includes('mega_bonus_all')) {
    next.rewardedIds.push('mega_bonus_all');
    newlyEarnedBonusCoins += 200;
    newlyCompletedTitles.push('All Daily Missions Mega Bonus (+200 Coins)');
  }

  saveDailyMissionProgress(userId, next);
  const missions = buildDailyMissionsList(next);

  const result: MissionUpdateResult = {
    progress: next,
    missions,
    newlyEarnedBonusCoins,
    newlyCompletedTitles
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('atoplay-mission-updated', {
        detail: {
          userId,
          ...result
        }
      })
    );
  }

  return result;
};
