export interface User {
  id: string;
  name: string;
  email: string;
  coins: number;
  avatar: string;
  streak: number;
  lastCheckIn?: string;
  createdAt: string;
  referralCode?: string;
  referralsCount?: number;
  referralEarnings?: number;
  referredBy?: string;
  isAdmin?: boolean;
  isBlocked?: boolean;
  atoPlayUsername?: string;
  channelName?: string;
  channelBanner?: string;
  channelImage?: string;
  warningCount?: number;
  isFollowRestricted?: boolean;
  loginMethod?: 'google' | 'atoplay';
}

export interface FollowLog {
  id: string;
  campaignId: string;
  creatorId: string;
  followerUserId: string;
  followerUsername: string;
  followerEmail?: string;
  followerAvatar?: string;
  followerName?: string;
  timestamp: string;
  status: 'active' | 'reported';
  campaignTitle?: string;
  reportedAt?: string;
}

export interface Campaign {
  id: string;
  userId: string;
  userName?: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string;
  viewsRequired: number;
  viewsCompleted: number;
  rewardPerView: number;
  targetViews: number; // compatible alias with viewsRequired
  completedViews: number; // compatible alias with viewsCompleted
  durationSeconds: number;
  totalCoinsCost: number;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  createdAt: string;
  displayId?: string;
  countryFlag?: string;
  channelName?: string;
  durationText?: string;
  completedUserIds?: string[];
  followedUserIds?: string[];
  channelFollowers?: number;
  channelId?: string;
  followLogs?: FollowLog[];
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'earned_watch' | 'earned_follow' | 'spent_campaign' | 'bonus_signup' | 'daily_checkin' | 'rewarded_ad' | 'iap_purchase' | 'refund_campaign' | 'referral_bonus' | 'referral_received';
  amount: number;
  description: string;
  createdAt: string;
}

export interface FollowSessionState {
  campaignId: string;
  channelKey: string;
  channelName: string;
  channelId?: string;
  channelUrl: string;
  countBefore: number;
  rewardCoins: number;
  startTime: number;
}

export interface WatchSession {
  sessionId: string;
  sessionToken: string;
  campaignId: string;
  startTime: number;
  durationSeconds: number;
  countBefore?: number;
  claimed?: boolean;
  aborted?: boolean;
}

export interface ActiveWatchState {
  sessionId: string;
  sessionToken: string;
  campaign: Campaign;
  startTime: number;
  durationSeconds: number;
  userId: string;
  countBefore?: number;
  userClickedFollow?: boolean;
}

export function format4CharId(rawId?: string, fallbackId?: string): string {
  const raw = (rawId || fallbackId || '').trim();
  const clean = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length >= 4) {
    return clean.slice(-4).toUpperCase();
  }
  return (clean + '4829').slice(0, 4).toUpperCase();
}
