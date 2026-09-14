import { User, Campaign, Transaction } from '../types';
import { extractVideoMetadata, VideoMetadata } from './videoExtractor';

export { extractVideoMetadata };
export type { VideoMetadata };

// Re-export for backward compatibility
export const extractVideoMetadataClient = extractVideoMetadata;

const STORAGE_KEYS = {
  USER: 'atoviewer_user',
  CAMPAIGNS: 'atoviewer_campaigns',
  TRANSACTIONS: 'atoviewer_transactions',
  WATCHED: 'atoviewer_watched_campaigns',
  CHECKIN_PREFIX: 'atoviewer_checkin_'
};

// Empty initial list: Only real user-promoted videos will be displayed
const SEED_CAMPAIGNS: Campaign[] = [];

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: User): void {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

function getStoredCampaigns(): Campaign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out any leftover sample dummy campaigns
      const realOnly = parsed.filter(c => c && !String(c.id).startsWith('camp_init_'));
      return realOnly;
    }
    return [];
  } catch {
    return [];
  }
}

function setStoredCampaigns(campaigns: Campaign[]): void {
  localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
}

function getStoredTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addStoredTransaction(tx: Transaction): void {
  const list = getStoredTransactions();
  list.unshift(tx);
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(list.slice(0, 100)));
}

export function getWatchedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.WATCHED}_${userId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function addWatchedId(userId: string, campaignId: string): void {
  const set = getWatchedIds(userId);
  set.add(campaignId);
  localStorage.setItem(`${STORAGE_KEYS.WATCHED}_${userId}`, JSON.stringify(Array.from(set)));
}

/**
 * Universal safe API caller that tries real backend first,
 * and seamlessly falls back to resilient client storage on static platforms like Vercel.
 */
export async function apiFetch<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const user = getStoredUser();
  const headers = new Headers(options?.headers || {});
  if (user?.id && !headers.has('x-user-id')) {
    headers.set('x-user-id', user.id);
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });

    const contentType = res.headers.get('content-type') || '';
    // If response is valid JSON from backend (not SPA index.html fallback)
    if (res.ok && contentType.includes('application/json')) {
      return await res.json();
    }
    
    // If 401 on /api/user, return standard unauthorized format
    if (res.status === 401 && endpoint === '/api/user') {
      return { success: false, user: null } as any;
    }
  } catch {
    // Network failed, proceed to client fallback
  }

  // --- CLIENT-SIDE RESILIENT FALLBACK ENGINE (e.g. for Vercel static host or offline) ---
  return await handleClientFallback<T>(endpoint, options, user);
}

async function handleClientFallback<T>(endpoint: string, options?: RequestInit, activeUser?: User | null): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const parsedBody = options?.body && typeof options.body === 'string' ? JSON.parse(options.body) : (options?.body || {});

  // 0. Extract Real Video Metadata Fallback (for Vercel URL)
  if (endpoint.startsWith('/api/campaigns/extract-metadata') || endpoint.startsWith('/api/extract-metadata')) {
    try {
      const urlParam = new URL(endpoint, 'http://localhost').searchParams.get('url') || parsedBody?.url || '';
      const meta = await extractVideoMetadata(urlParam);
      if (meta) {
        return { success: true, metadata: meta } as any;
      }
      return { success: false, message: 'Could not extract metadata' } as any;
    } catch {
      return { success: false, message: 'Metadata extraction failed' } as any;
    }
  }

  // 1b. Reset all logged-in Google accounts
  if (endpoint.startsWith('/api/auth/reset-accounts')) {
    localStorage.removeItem(STORAGE_KEYS.USER);
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(STORAGE_KEYS.WATCHED) || k.startsWith('atoviewer_user')) {
        localStorage.removeItem(k);
      }
    });
    return { success: true, message: 'All Google accounts reset successfully' } as any;
  }

  // 1. Firebase Login / Google Sign-In Fallback
  if (endpoint.startsWith('/api/auth/firebase-login')) {
    const { uid, email, name, avatar } = parsedBody;
    const cleanEmail = String(email || 'user@gmail.com').trim().toLowerCase();
    const isAdmin = cleanEmail === 'krja462@gmail.com' || String(uid || '').includes('krja462');
    const effectiveUid = uid || `g_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    let user = getStoredUser();
    let isNewUser = false;

    if (!user || user.email !== cleanEmail) {
      isNewUser = true;
      user = {
        id: effectiveUid,
        name: name || (isAdmin ? 'Admin (KRJA)' : cleanEmail.split('@')[0]),
        email: cleanEmail,
        coins: isAdmin ? 999999999 : 100, // Unlimited coins for Admin, 100 Welcome Bonus coins on first login
        avatar: avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80`,
        streak: 1,
        lastCheckIn: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        referralsCount: 0,
        referralEarnings: 0,
        referralCode: isAdmin ? 'REF-KRJA' : `REF-${effectiveUid.slice(-4).toUpperCase()}`,
        isAdmin: isAdmin ? true : undefined
      };

      addStoredTransaction({
        id: `tx_${Date.now()}`,
        userId: user.id,
        type: 'bonus_signup',
        amount: isAdmin ? 999999999 : 100,
        description: isAdmin ? 'Admin Unlimited Coins Granted' : 'Welcome Bonus Coins on Google Sign In (+100 Coins)',
        createdAt: new Date().toISOString()
      });
    } else {
      if (isAdmin) {
        user.coins = 999999999;
        user.isAdmin = true;
      }
      if (name) user.name = name;
      if (avatar) user.avatar = avatar;
    }

    setStoredUser(user);
    return {
      success: true,
      user,
      isNewUser,
      message: isNewUser ? 'Welcome! 100 bonus coins added.' : 'Signed in successfully with Google'
    } as any;
  }

  // 2. Auth Logout
  if (endpoint.startsWith('/api/auth/logout')) {
    localStorage.removeItem(STORAGE_KEYS.USER);
    return { success: true, message: 'Logged out successfully' } as any;
  }

  // 3. Current User
  if (endpoint.startsWith('/api/user')) {
    if (!activeUser) {
      return { success: false, user: null, message: 'User not authenticated' } as any;
    }
    return { success: true, user: activeUser } as any;
  }

  // 4. Campaigns List
  if (endpoint.startsWith('/api/campaigns') && method === 'GET') {
    const allCampaigns = getStoredCampaigns();
    const isMyFilter = endpoint.includes('filter=my');

    if (isMyFilter) {
      const myCampaigns = activeUser ? allCampaigns.filter(c => c.userId === activeUser.id) : [];
      return { success: true, campaigns: myCampaigns } as any;
    }

    // Home feed filter: active, remaining views (viewsCompleted < viewsRequired), not created by user, not already watched by user
    const watched = activeUser ? getWatchedIds(activeUser.id) : new Set();
    const queue = allCampaigns.filter(c => {
      const reqViews = c.viewsRequired ?? c.targetViews ?? 10;
      const compViews = c.viewsCompleted ?? c.completedViews ?? 0;
      if (c.status !== 'active' || compViews >= reqViews) return false;
      if (activeUser && c.userId === activeUser.id) return false;
      if (activeUser && watched.has(c.id)) return false;
      return true;
    });

    return { success: true, campaigns: queue } as any;
  }

  // 5. Create Campaign
  if (endpoint.startsWith('/api/campaigns') && method === 'POST') {
    if (!activeUser) {
      return { success: false, message: 'Please log in to create a campaign' } as any;
    }

    const { videoUrl, targetViews, viewsRequired, title, thumbnailUrl } = parsedBody;
    const views = Number(viewsRequired || targetViews) || 10;
    if (views < 10) {
      return { success: false, message: 'Minimum campaign is 10 views (800 coins required).' } as any;
    }

    let finalTitle = title;
    let finalThumbnail = thumbnailUrl;
    let finalDisplayId = '';

    if ((!finalTitle || !finalThumbnail) && videoUrl) {
      try {
        const autoMeta = await extractVideoMetadata(videoUrl);
        if (autoMeta) {
          if (!finalTitle) finalTitle = autoMeta.title;
          if (!finalThumbnail) finalThumbnail = autoMeta.thumbnailUrl;
          finalDisplayId = autoMeta.displayId;
        }
      } catch {
        // continue
      }
    }

    // 80 coins per view (60 reward + 20 platform fee)
    const totalCost = views * 80;
    const isUserAdmin = Boolean(activeUser.isAdmin || activeUser.email?.toLowerCase().trim() === 'krja462@gmail.com' || activeUser.id.includes('krja462'));

    if (!isUserAdmin && activeUser.coins < totalCost) {
      return { success: false, message: 'Insufficient coins! Watch more videos to earn.' } as any;
    }

    // Keep admin coins unlimited
    if (isUserAdmin) {
      activeUser.coins = 999999999;
      activeUser.isAdmin = true;
    } else {
      activeUser.coins -= totalCost;
    }
    setStoredUser(activeUser);

    addStoredTransaction({
      id: `tx_${Date.now()}`,
      userId: activeUser.id,
      type: 'spent_campaign',
      amount: -totalCost,
      description: `Created Promotion Campaign for: ${finalTitle || 'AtoPlay Video'} (${views} views @ 80 coins/view)`,
      createdAt: new Date().toISOString()
    });

    const newCampaign: Campaign = {
      id: `camp_${Date.now()}`,
      displayId: finalDisplayId || String(Math.floor(1000 + Math.random() * 9000)),
      userId: activeUser.id,
      userName: activeUser.name,
      videoUrl: videoUrl.trim(),
      title: finalTitle || 'AtoPlay Video Promotion',
      thumbnailUrl: finalThumbnail || 'https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp',
      viewsRequired: views,
      viewsCompleted: 0,
      rewardPerView: 60,
      targetViews: views,
      completedViews: 0,
      durationSeconds: 60,
      totalCoinsCost: totalCost,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const currentCampaigns = getStoredCampaigns();
    currentCampaigns.unshift(newCampaign);
    setStoredCampaigns(currentCampaigns);

    return {
      success: true,
      message: 'Promotion campaign launched successfully!',
      campaign: newCampaign,
      user: activeUser,
      remainingCoins: activeUser.coins
    } as any;
  }

  // 5b. Delete Campaign Fallback (DELETE /api/campaigns/:id)
  if (endpoint.startsWith('/api/campaigns/') && method === 'DELETE') {
    const campaignId = endpoint.split('/api/campaigns/')[1]?.split('?')[0];
    const currentCampaigns = getStoredCampaigns();
    const isUserAdmin = Boolean(activeUser?.isAdmin || activeUser?.email?.toLowerCase().trim() === 'krja462@gmail.com' || activeUser?.id?.includes('krja462'));
    
    const campIndex = currentCampaigns.findIndex(c => c.id === campaignId && (isUserAdmin || (activeUser && c.userId === activeUser.id)));
    const targetIndex = campIndex !== -1 ? campIndex : currentCampaigns.findIndex(c => c.id === campaignId);

    if (targetIndex === -1) {
      return { success: false, message: 'Campaign not found' } as any;
    }

    const campaign = currentCampaigns[targetIndex];
    if (campaign && campaign.status === 'active' && activeUser) {
      const reqViews = campaign.viewsRequired ?? campaign.targetViews ?? 10;
      const compViews = campaign.viewsCompleted ?? campaign.completedViews ?? 0;
      const remainingViews = Math.max(0, reqViews - compViews);
      const refundAmount = remainingViews * 80;

      if (refundAmount > 0) {
        if (!isUserAdmin) {
          activeUser.coins += refundAmount;
          setStoredUser(activeUser);
        }
        addStoredTransaction({
          id: `tx_${Date.now()}_refund`,
          userId: activeUser.id,
          type: 'refund_campaign',
          amount: refundAmount,
          description: `Refund for deleted campaign (${remainingViews} views remaining @ 80 coins/view)`,
          createdAt: new Date().toISOString()
        });
      }
    }

    currentCampaigns.splice(targetIndex, 1);
    setStoredCampaigns(currentCampaigns);

    return {
      success: true,
      user: activeUser,
      message: 'Campaign deleted and refund processed successfully'
    } as any;
  }

  // 6. Watch Session Start
  if (endpoint.startsWith('/api/watch/start-session')) {
    const { campaignId } = parsedBody;
    const token = `token_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sessionId = `session_${Date.now()}`;
    return {
      success: true,
      sessionId,
      sessionToken: token,
      campaignId,
      durationSeconds: 60,
      message: 'Watch timer initialized'
    } as any;
  }

  // 7. Watch Verify & Reward
  if (endpoint.startsWith('/api/watch/verify')) {
    if (!activeUser) {
      return { success: false, message: 'Please log in to claim reward' } as any;
    }

    const { campaignId } = parsedBody;
    const earnedCoins = 60; // +60 coins for 60 seconds watch
    activeUser.coins += earnedCoins;
    setStoredUser(activeUser);

    if (campaignId) {
      addWatchedId(activeUser.id, campaignId);
      // Increment completed views on the campaign
      const currentCampaigns = getStoredCampaigns();
      const targetCamp = currentCampaigns.find(c => c.id === campaignId);
      if (targetCamp) {
        const reqViews = targetCamp.viewsRequired ?? targetCamp.targetViews ?? 10;
        const currentCompleted = (targetCamp.viewsCompleted ?? targetCamp.completedViews ?? 0) + 1;
        targetCamp.viewsCompleted = currentCompleted;
        targetCamp.completedViews = currentCompleted;
        if (currentCompleted >= reqViews) {
          targetCamp.status = 'completed';
        }
        setStoredCampaigns(currentCampaigns);
      }
    }

    addStoredTransaction({
      id: `tx_${Date.now()}`,
      userId: activeUser.id,
      type: 'earned_watch',
      amount: earnedCoins,
      description: 'Watched full video for 60 seconds (+60 Coins)',
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      earnedCoins,
      coinsEarned: earnedCoins,
      totalCoins: activeUser.coins,
      user: activeUser,
      message: 'Congratulations! +60 Coins added to your wallet.'
    } as any;
  }

  // 8. Daily Checkin
  if (endpoint.startsWith('/api/wallet/checkin')) {
    if (!activeUser) {
      return { success: false, message: 'Please log in first' } as any;
    }

    const today = new Date().toISOString().split('T')[0];
    if (activeUser.lastCheckIn === today) {
      return { success: false, message: 'Already claimed today! Check back tomorrow.', user: activeUser } as any;
    }

    activeUser.coins += 20;
    activeUser.streak = (activeUser.streak || 1) + 1;
    activeUser.lastCheckIn = today;
    setStoredUser(activeUser);

    addStoredTransaction({
      id: `tx_${Date.now()}`,
      userId: activeUser.id,
      type: 'daily_checkin',
      amount: 20,
      description: `Daily Check-In Reward (Day ${activeUser.streak})`,
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      message: `Claimed +20 Coins! Daily streak: ${activeUser.streak} days.`,
      user: activeUser
    } as any;
  }

  // 9. Reward Ad
  if (endpoint.startsWith('/api/wallet/reward-ad')) {
    if (!activeUser) {
      return { success: false, message: 'Please log in first' } as any;
    }

    activeUser.coins += 50;
    setStoredUser(activeUser);

    addStoredTransaction({
      id: `tx_${Date.now()}`,
      userId: activeUser.id,
      type: 'rewarded_ad',
      amount: 50,
      description: 'Bonus Ad Sponsor Reward (+50 Coins)',
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Bonus +50 Coins claimed!',
      user: activeUser
    } as any;
  }

  // 10. Coin Purchase Simulation
  if (endpoint.startsWith('/api/wallet/purchase')) {
    if (!activeUser) {
      return { success: false, message: 'Please log in' } as any;
    }

    const { coinsAmount, packName, priceInr } = parsedBody;
    const coins = Number(coinsAmount) || 1000;
    activeUser.coins += coins;
    setStoredUser(activeUser);

    addStoredTransaction({
      id: `tx_${Date.now()}`,
      userId: activeUser.id,
      type: 'iap_purchase',
      amount: coins,
      description: `Purchased ${packName || 'Coin Pack'} (₹${priceInr || 99})`,
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      message: `Payment successful! Added ${coins} coins.`,
      user: activeUser
    } as any;
  }

  // 11. Referral Code Redeem
  if (endpoint.startsWith('/api/referral/redeem')) {
    if (!activeUser) {
      return { success: false, message: 'Please log in' } as any;
    }

    const { code } = parsedBody;
    if (activeUser.referredBy) {
      return { success: false, message: 'You have already redeemed a referral code.' } as any;
    }

    activeUser.referredBy = String(code).trim().toUpperCase();
    activeUser.coins += 250;
    setStoredUser(activeUser);

    addStoredTransaction({
      id: `tx_${Date.now()}`,
      userId: activeUser.id,
      type: 'referral_received',
      amount: 250,
      description: `Referral Bonus for redeeming: ${code}`,
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Referral code redeemed! +250 Bonus Coins added.',
      user: activeUser
    } as any;
  }

  // 12. Transactions List
  if (endpoint.startsWith('/api/transactions')) {
    const list = getStoredTransactions();
    return { success: true, transactions: list } as any;
  }

  // Default fallback response
  return { success: true, message: 'Action completed' } as any;
}
