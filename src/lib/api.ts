import { User, Campaign, Transaction } from '../types';
import { extractVideoMetadata, VideoMetadata, cleanVideoUrl, fetchLiveAtoPlayFollowerCount } from './videoExtractor';

export { extractVideoMetadata, cleanVideoUrl, fetchLiveAtoPlayFollowerCount };
export type { VideoMetadata };

// Re-export for backward compatibility
export const extractVideoMetadataClient = extractVideoMetadata;

const STORAGE_KEYS = {
  USER: 'atoviewer_user',
  CAMPAIGNS: 'atoviewer_campaigns',
  DELETED_CAMPAIGNS: 'atoviewer_deleted_campaigns',
  TRANSACTIONS: 'atoviewer_transactions',
  WATCHED: 'atoviewer_watched_campaigns',
  FOLLOWED: 'atoviewer_followed_campaigns',
  CHECKIN_PREFIX: 'atoviewer_checkin_'
};

/**
 * Canonical helper to determine whether a campaign is a video campaign or a channel follower campaign.
 * Never misclassifies a video campaign as a follower campaign just because the video title contains "follow".
 */
export function resolveCampaignType(campaignType?: string, videoUrl?: string): 'video' | 'follower' {
  if (campaignType === 'video') return 'video';
  if (campaignType === 'follower') return 'follower';
  const url = String(videoUrl || '').toLowerCase();
  const isExplicitChannelUrl =
    (url.includes('/channels/') || url.includes('/channel/') || url.includes('/c/') || url.includes('/@')) &&
    !url.includes('/video/');
  return isExplicitChannelUrl ? 'follower' : 'video';
}

export function normalizeAtoPlayImageUrl(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `https://cdn.atoplay.in/${trimmed.replace(/^\//, '')}`;
}

export function isRealAtoPlayAvatarUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  const lower = url.trim().toLowerCase();
  if (
    lower.includes('googleusercontent.com') ||
    lower.includes('unsplash.com') ||
    lower.includes('dicebear.com')
  ) {
    return false;
  }
  return true;
}

/**
 * Authenticates directly with AtoPlay API (`POST https://api.atoplay.com/api/auth/login`)
 * and fetches the user's real AtoPlay Dashboard account name (`fname`) and avatar (`profileImage`)
 * from `GET https://api.atoplay.com/api/users/me`.
 */
export async function loginAndFetchAtoPlayProfile(email: string, password: string): Promise<{
  success: boolean;
  synced: boolean;
  matched: boolean;
  message: string;
  atoPlayProfile?: {
    id?: string;
    email: string;
    atoPlayUsername: string;
    channelName: string;
    channelImage?: string;
    channelBanner?: string;
  };
}> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      synced: false,
      matched: false,
      message: 'Please enter your valid AtoPlay email address.'
    };
  }
  if (!cleanPassword) {
    return {
      success: false,
      synced: false,
      matched: false,
      message: 'Please enter your AtoPlay account password.'
    };
  }

  try {
    const loginRes = await fetch('https://api.atoplay.com/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPassword
      })
    });

    const loginData = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) {
      const errMsg = Array.isArray(loginData?.message)
        ? loginData.message.join(', ')
        : (loginData?.message || 'Invalid AtoPlay email or password. Please check your credentials.');
      return {
        success: false,
        synced: false,
        matched: false,
        message: errMsg
      };
    }

    const accessToken = loginData?.data?.accessToken || loginData?.accessToken || loginData?.token;
    const loginUser = loginData?.data?.user || loginData?.user || {};

    let meUser: any = {};
    if (accessToken) {
      try {
        const meRes = await fetch('https://api.atoplay.com/api/users/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });
        if (meRes.ok) {
          const meJson = await meRes.json().catch(() => ({}));
          meUser = meJson?.data || meJson?.user || meJson || {};
        }
      } catch {}
    }

    const fname = String(meUser.fname ?? loginUser.fname ?? '').trim();
    const lname = String(meUser.lname ?? loginUser.lname ?? '').trim();
    const accountName = [fname, lname].filter(Boolean).join(' ').trim() || fname || cleanEmail.split('@')[0];
    let accountAvatar = normalizeAtoPlayImageUrl(
      meUser.profileImage || loginUser.profileImage || meUser.avatar || loginUser.avatar
    );
    let channelBanner: string | undefined = undefined;
    const atoPlayUserId = String(meUser.id || loginUser.id || '');

    // If account avatar isn't set on /users/me, check user's channel image as fallback
    if (!accountAvatar && atoPlayUserId) {
      try {
        const chRes = await fetch(`https://api.atoplay.com/api/channels/user/${encodeURIComponent(atoPlayUserId)}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (chRes.ok) {
          const chData = await chRes.json().catch(() => ({}));
          const firstCh = Array.isArray(chData) ? chData[0] : (chData?.channels?.[0] || chData?.data?.[0]);
          if (firstCh) {
            const chImg = normalizeAtoPlayImageUrl(firstCh.channelImage);
            if (chImg) accountAvatar = chImg;
            const chBan = normalizeAtoPlayImageUrl(firstCh.channelBanner);
            if (chBan) channelBanner = chBan;
          }
        }
      } catch {}
    }

    return {
      success: true,
      synced: true,
      matched: true,
      message: `AtoPlay account "${accountName}" synced successfully!`,
      atoPlayProfile: {
        id: atoPlayUserId,
        email: String(meUser.email || loginUser.email || cleanEmail).trim().toLowerCase(),
        atoPlayUsername: accountName,
        channelName: accountName,
        channelImage: accountAvatar,
        channelBanner
      }
    };
  } catch (err: any) {
    return {
      success: false,
      synced: false,
      matched: false,
      message: err?.message || 'Could not connect to AtoPlay right now. Please try again.'
    };
  }
}

export function getDeletedCampaignIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_CAMPAIGNS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function addDeletedCampaignId(campaignId: string): void {
  if (!campaignId) return;
  try {
    const set = getDeletedCampaignIds();
    set.add(campaignId);
    localStorage.setItem(STORAGE_KEYS.DELETED_CAMPAIGNS, JSON.stringify(Array.from(set)));
    // Also purge from stored local campaigns immediately
    const raw = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(c => c && c.id !== campaignId);
        localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(filtered));
      }
    }
  } catch {}
}

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
    const deletedSet = getDeletedCampaignIds();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out any deleted or leftover sample dummy campaigns and clean video URLs
      const realOnly = parsed
        .filter(c => c && !String(c.id).startsWith('camp_init_') && !deletedSet.has(c.id) && (c as any).status !== 'deleted')
        .map(c => {
          const type = resolveCampaignType(c.campaignType, c.videoUrl);
          return {
            ...c,
            userName: type === 'video' ? '' : (c.channelName || ''),
            campaignType: type,
            videoUrl: cleanVideoUrl(c.videoUrl || '')
          };
        });
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

export function clearStoredCampaigns(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CAMPAIGNS);
  } catch {}
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

export function getFollowedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.FOLLOWED}_${userId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function addFollowedId(userId: string, campaignId: string): void {
  const set = getFollowedIds(userId);
  set.add(campaignId);
  localStorage.setItem(`${STORAGE_KEYS.FOLLOWED}_${userId}`, JSON.stringify(Array.from(set)));
}

// In-flight deduplication map for /api/follow/verify to prevent duplicate concurrent API calls
const inFlightFollowVerifyPromises = new Map<string, Promise<any>>();

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
  if (user?.email && !headers.has('x-user-email')) {
    headers.set('x-user-email', user.email.toLowerCase().trim());
  }
  if (user?.coins !== undefined && !headers.has('x-user-coins')) {
    headers.set('x-user-coins', String(user.coins));
  }

  // Deduplicate concurrent /api/follow/verify calls for the same campaign
  let dedupeKey: string | null = null;
  if (endpoint.startsWith('/api/follow/verify')) {
    try {
      const parsedBody = options?.body && typeof options.body === 'string' ? JSON.parse(options.body) : (options?.body || {});
      const cId = (parsedBody as any)?.campaignId || 'default';
      dedupeKey = `${user?.id || 'anon'}_${cId}`;
      const existingPromise = inFlightFollowVerifyPromises.get(dedupeKey);
      if (existingPromise) {
        return existingPromise as Promise<T>;
      }
    } catch {}
  }

  const executeCall = async (): Promise<T> => {
    try {
      const res = await fetch(endpoint, {
        ...options,
        headers
      });

      const contentType = res.headers.get('content-type') || '';
      // If response is valid JSON from backend, parse and return it
      if (contentType.includes('application/json')) {
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
  };

  if (dedupeKey) {
    const promise = executeCall().finally(() => {
      if (dedupeKey) {
        inFlightFollowVerifyPromises.delete(dedupeKey);
      }
    });
    inFlightFollowVerifyPromises.set(dedupeKey, promise);
    return promise;
  }

  return executeCall();
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

  // 0b. AtoPlay Account Sync Fallback (Direct AtoPlay Email & Password Login + /api/users/me)
  if (endpoint.startsWith('/api/atoplay/sync-profile')) {
    const targetEmail = String(parsedBody?.email || activeUser?.email || '').trim().toLowerCase();
    const password = String(parsedBody?.password || '').trim();

    if (password) {
      const syncRes = await loginAndFetchAtoPlayProfile(targetEmail, password);
      if (syncRes.success && syncRes.atoPlayProfile) {
        const current = activeUser || getStoredUser();
        const updatedUser: User = {
          ...(current || {
            id: `g_${targetEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
            email: targetEmail,
            coins: targetEmail === 'krja462@gmail.com' ? 999999999 : 100,
            streak: 1,
            createdAt: new Date().toISOString()
          }),
          name: syncRes.atoPlayProfile.atoPlayUsername,
          atoPlayUsername: syncRes.atoPlayProfile.atoPlayUsername,
          channelName: syncRes.atoPlayProfile.channelName,
          channelImage: syncRes.atoPlayProfile.channelImage || current?.channelImage || '',
          avatar: syncRes.atoPlayProfile.channelImage || current?.channelImage || current?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
          ...(syncRes.atoPlayProfile.channelBanner ? { channelBanner: syncRes.atoPlayProfile.channelBanner } : {})
        };
        setStoredUser(updatedUser);
        return {
          success: true,
          synced: true,
          matched: true,
          atoPlayProfile: syncRes.atoPlayProfile,
          user: updatedUser,
          message: syncRes.message
        } as any;
      }
      return {
        success: false,
        synced: false,
        matched: false,
        message: syncRes.message
      } as any;
    }

    // Silent check without password: check if user already synced a real AtoPlay profile
    const current = activeUser || getStoredUser();
    if (current && current.atoPlayUsername && isRealAtoPlayAvatarUrl(current.channelImage)) {
      return {
        success: true,
        synced: true,
        matched: true,
        user: current,
        message: `Synced with AtoPlay account ${current.atoPlayUsername}`
      } as any;
    }

    return {
      success: false,
      synced: false,
      matched: false,
      requiresPassword: true,
      user: current || null,
      message: 'Enter your AtoPlay email and password to sync your real AtoPlay Dashboard username & profile photo.'
    } as any;
  }

  // 1. Firebase Login / Google Sign-In Fallback
  if (endpoint.startsWith('/api/auth/firebase-login') || endpoint.startsWith('/api/auth/google')) {
    const { uid, email, name, displayName, avatar, photoURL, coins: requestedCoins } = parsedBody;
    const cleanEmail = String(email || 'user@gmail.com').trim().toLowerCase();
    const isAdmin = cleanEmail === 'krja462@gmail.com' || String(uid || '').includes('krja462');
    const googleName = name || displayName || (isAdmin ? 'Admin (KRJA)' : cleanEmail.split('@')[0]);
    const googleAvatar = avatar || photoURL || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80`;

    let user = getStoredUser();
    let isNewUser = false;

    const existingSameEmail = Boolean(user && user.email?.toLowerCase().trim() === cleanEmail);
    const effectiveUid = uid || (existingSameEmail && user?.id && !String(user.id).startsWith('guest_') ? user.id : `g_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`);
    const incomingCoins = typeof requestedCoins === 'number' && !isNaN(requestedCoins) ? requestedCoins : 100;

    if (!user || !existingSameEmail) {
      isNewUser = true;
      user = {
        id: effectiveUid,
        name: googleName,
        email: cleanEmail,
        coins: isAdmin ? 999999999 : Math.max(100, incomingCoins),
        avatar: googleAvatar,
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
      user.id = effectiveUid;
      if (isAdmin) {
        user.coins = 999999999;
        user.isAdmin = true;
      } else {
        user.coins = Math.max(user.coins || 100, incomingCoins);
      }
      // Preserve synced AtoPlay username & avatar if already synced; otherwise use Google profile
      const hasSyncedAtoPlayAvatar = isRealAtoPlayAvatarUrl(user.channelImage);
      if (user.atoPlayUsername && hasSyncedAtoPlayAvatar) {
        user.name = user.channelName || user.atoPlayUsername;
        user.avatar = user.channelImage!;
      } else {
        if (googleName) user.name = googleName;
        if (googleAvatar) user.avatar = googleAvatar;
      }
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

  // 2b. Sync Wallet Coins
  if (endpoint.startsWith('/api/user/sync-wallet')) {
    const current = getStoredUser();
    const effective = activeUser || current;
    if (effective && parsedBody?.coins !== undefined) {
      const isAdm = effective.isAdmin || effective.email?.toLowerCase().trim() === 'krja462@gmail.com';
      if (!isAdm) {
        effective.coins = Math.max(effective.coins || 0, Number(parsedBody.coins) || 0);
      }
      setStoredUser(effective);
    }
    return { success: true, user: effective } as any;
  }

  // 3. Current User
  if (endpoint.startsWith('/api/user')) {
    const current = getStoredUser();
    const effective = activeUser || current;
    if (!effective) {
      return { success: false, user: null, message: 'User not authenticated' } as any;
    }
    return { success: true, user: effective } as any;
  }

  // 4. Campaigns List
  if (endpoint.startsWith('/api/campaigns') && method === 'GET') {
    const allCampaigns = getStoredCampaigns();
    const isMyFilter = endpoint.includes('filter=my');

    if (isMyFilter) {
      const myCampaigns = activeUser ? allCampaigns.filter(c => c.userId === activeUser.id) : [];
      return { success: true, campaigns: myCampaigns } as any;
    }

    // Home feed filter: active, remaining views (viewsCompleted < viewsRequired), not creator's own campaign
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

    const resolvedType = resolveCampaignType(parsedBody.campaignType, videoUrl);
    const rewardPerUnit = resolvedType === 'follower' ? 30 : 60;

    const newCampaign: Campaign = {
      id: `camp_${Date.now()}`,
      displayId: finalDisplayId || String(Math.floor(1000 + Math.random() * 9000)),
      userId: activeUser.id,
      userName: '',
      videoUrl: cleanVideoUrl(videoUrl.trim()),
      title: finalTitle || (resolvedType === 'follower' ? 'Follow AtoPlay Channel' : 'AtoPlay Video Promotion'),
      thumbnailUrl: finalThumbnail || 'https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp',
      viewsRequired: views,
      viewsCompleted: 0,
      rewardPerView: rewardPerUnit,
      targetViews: views,
      completedViews: 0,
      durationSeconds: 60,
      totalCoinsCost: totalCost,
      status: 'active',
      campaignType: resolvedType,
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
    if (campaignId) {
      addDeletedCampaignId(campaignId);
    }
    const currentCampaigns = getStoredCampaigns();
    const isUserAdmin = Boolean(activeUser?.isAdmin || activeUser?.email?.toLowerCase().trim() === 'krja462@gmail.com' || activeUser?.id?.includes('krja462'));
    
    const campIndex = currentCampaigns.findIndex(c => c.id === campaignId && (isUserAdmin || (activeUser && c.userId === activeUser.id)));
    const targetIndex = campIndex !== -1 ? campIndex : currentCampaigns.findIndex(c => c.id === campaignId);

    if (targetIndex === -1) {
      return { success: true, user: activeUser, message: 'Campaign deleted successfully' } as any;
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

  // 13. Follow Channel Start (Real AtoPlay API Check)
  if (endpoint.startsWith('/api/follow/start')) {
    const campaignId = parsedBody?.campaignId;
    const campaigns = getStoredCampaigns();
    const camp = campaigns.find(c => c.id === campaignId);
    const videoUrl = parsedBody?.videoUrl || camp?.videoUrl || '';
    const channelId = parsedBody?.channelId || camp?.channelId || '';
    const channelName = parsedBody?.channelName || camp?.channelName || camp?.userName || 'AtoPlay Creator';

    const liveRes = await fetchLiveAtoPlayFollowerCount({ videoUrl, channelId, channelName });
    const savedFollowers = typeof camp?.channelFollowers === 'number' && camp.channelFollowers >= 0
      ? camp.channelFollowers
      : (typeof parsedBody?.countBefore === 'number' && parsedBody.countBefore >= 0 ? parsedBody.countBefore : 0);

    const baselineCount = liveRes.isRealAtoPlay && typeof liveRes.count === 'number'
      ? liveRes.count
      : savedFollowers;

    if (campaignId) {
      try {
        sessionStorage.setItem(`atoplay_follow_baseline_${campaignId}`, String(baselineCount));
      } catch {}
    }

    const resolvedChannelId = liveRes.channelId || channelId;
    const resolvedChannelName = liveRes.channelName || channelName;
    const channelUrl = resolvedChannelId
      ? `https://atoplay.com/channels/${resolvedChannelId}`
      : (videoUrl || 'https://atoplay.com');

    return {
      success: true,
      campaignId,
      countBefore: baselineCount,
      channelKey: resolvedChannelName,
      channelId: resolvedChannelId,
      channelName: resolvedChannelName,
      channelUrl,
      isRealAtoPlay: liveRes.isRealAtoPlay,
      rewardCoins: 30,
      alreadyFollowed: false,
      message: `AtoPlay API captured initial follower count (${baselineCount}). Please follow the channel on AtoPlay and tap 'Verify Follow'.`
    } as any;
  }

  // 14. Follow Channel Verify (Strict Real AtoPlay API Check - NO fake +1 bump)
  if (endpoint.startsWith('/api/follow/verify')) {
    const {
      campaignId,
      countBefore: reqCountBefore,
      videoUrl: reqVideoUrl,
      channelId: reqChannelId,
      channelName: reqChannelName,
      visited4Sec,
      elapsedMs
    } = parsedBody;

    if (activeUser?.id && campaignId && getFollowedIds(activeUser.id).has(campaignId)) {
      return {
        success: false,
        alreadyFollowed: true,
        verified: false,
        message: 'You have already claimed 30 coins for following this channel.'
      } as any;
    }

    if (visited4Sec === false || (typeof elapsedMs === 'number' && elapsedMs < 3800)) {
      return {
        success: false,
        verified: false,
        message: 'Please stay on the AtoPlay channel for at least 4 seconds to follow properly before returning.'
      } as any;
    }

    const campaigns = getStoredCampaigns();
    const targetCamp = campaigns.find(c => c.id === campaignId);

    let storedBaseline: number | undefined = undefined;
    if (campaignId) {
      try {
        const rawStored = sessionStorage.getItem(`atoplay_follow_baseline_${campaignId}`);
        if (rawStored !== null && !isNaN(Number(rawStored))) {
          storedBaseline = Number(rawStored);
        }
      } catch {}
    }

    const baseline = storedBaseline !== undefined
      ? storedBaseline
      : (typeof reqCountBefore === 'number' && reqCountBefore >= 0
        ? reqCountBefore
        : (typeof targetCamp?.channelFollowers === 'number' ? targetCamp.channelFollowers : 0));

    const videoUrl = reqVideoUrl || targetCamp?.videoUrl || '';
    const channelId = reqChannelId || targetCamp?.channelId || '';
    const channelName = reqChannelName || targetCamp?.channelName || targetCamp?.userName || 'AtoPlay Creator';

    let liveRes = await fetchLiveAtoPlayFollowerCount({ videoUrl, channelId, channelName });
    // If AtoPlay DB took a moment to commit the new follow, retry once after 1.2s
    if ((!liveRes.isRealAtoPlay || (typeof liveRes.count === 'number' && liveRes.count <= baseline)) && (videoUrl || channelId)) {
      await new Promise(r => setTimeout(r, 1200));
      liveRes = await fetchLiveAtoPlayFollowerCount({ videoUrl, channelId: liveRes.channelId || channelId, channelName });
    }

    if (!liveRes.isRealAtoPlay || typeof liveRes.count !== 'number') {
      return {
        success: false,
        verified: false,
        countBefore: baseline,
        countAfter: baseline,
        message: `Could not verify live follower count from AtoPlay right now. Please make sure the channel link is a valid AtoPlay channel and try again.`
      } as any;
    }

    const countAfter = liveRes.count;
    const followerIncreased = countAfter > baseline;

    if (!followerIncreased) {
      return {
        success: false,
        verified: false,
        countBefore: baseline,
        countAfter,
        message: `AtoPlay live check: Follower count did not increase (Previous: ${baseline}, Current: ${countAfter}). Please click 'Follow' on the AtoPlay channel first, then tap 'Verify Follow'.`
      } as any;
    }

    if (activeUser) {
      activeUser.coins = (activeUser.coins || 0) + 30;
      setStoredUser(activeUser);
      if (activeUser.id && campaignId) {
        addFollowedId(activeUser.id, campaignId);
        addWatchedId(activeUser.id, campaignId);
      }
    }
    if (campaignId && targetCamp) {
      targetCamp.channelFollowers = countAfter;
      targetCamp.lastCheckedFollowers = countAfter;
      targetCamp.viewsCompleted = (targetCamp.viewsCompleted || 0) + 1;
      targetCamp.completedViews = (targetCamp.completedViews || 0) + 1;
      if (targetCamp.completedViews >= (targetCamp.viewsRequired || targetCamp.targetViews || 10)) {
        targetCamp.status = 'completed';
      }
      setStoredCampaigns(campaigns);
    }
    if (campaignId) {
      try {
        sessionStorage.removeItem(`atoplay_follow_baseline_${campaignId}`);
      } catch {}
    }

    const hasSyncedAtoPlay = Boolean(activeUser?.atoPlayUsername && isRealAtoPlayAvatarUrl(activeUser?.channelImage));
    const syncedHandle = (activeUser?.atoPlayUsername || activeUser?.channelName || '').trim().replace(/^@+/, '');
    const followLog = activeUser ? {
      id: `flog_${Date.now()}_${activeUser.id.slice(-4)}`,
      campaignId,
      creatorId: targetCamp?.userId || parsedBody?.creatorId || 'creator',
      followerUserId: activeUser.id,
      followerUsername: hasSyncedAtoPlay ? syncedHandle : '',
      followerEmail: activeUser.email,
      followerAvatar: hasSyncedAtoPlay ? (activeUser.channelImage || activeUser.avatar) : activeUser.avatar,
      followerName: hasSyncedAtoPlay ? (activeUser.channelName || syncedHandle || activeUser.name) : activeUser.name,
      timestamp: new Date().toISOString(),
      status: 'active' as const,
      campaignTitle: targetCamp?.title || parsedBody?.title || channelName
    } : undefined;

    return {
      success: true,
      verified: true,
      earnedCoins: 30,
      newBalance: activeUser?.coins || 30,
      countBefore: baseline,
      countAfter,
      channelName: liveRes.channelName || channelName,
      user: activeUser,
      followLog,
      message: `AtoPlay Live Verified! Creator followers increased from ${baseline} to ${countAfter} (+${countAfter - baseline} Follower). +30 Coins added to your wallet!`
    } as any;
  }

  // 15. Followed Campaigns List (Fallback)
  if (endpoint.startsWith('/api/user/followed-campaigns')) {
    const followed = activeUser?.id ? Array.from(getFollowedIds(activeUser.id)) : [];
    return {
      success: true,
      followedCampaignIds: followed
    } as any;
  }

  // 16. AssetLinks API (Fallback)
  if (endpoint.startsWith('/api/assetlinks')) {
    return {
      success: true,
      message: 'Assetlinks updated successfully',
      entries: [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: parsedBody?.packageName || "app.vercel.ato_play_viewe_increase.twa",
            sha256_cert_fingerprints: [parsedBody?.sha256Fingerprint || "41:BD:E7:95:33:64:35:0C:C3:F9:49:83:87:80:D1:B0:CB:5A:93:59:B0:97:AE:A4:F7:AB:1A:34:26:A2:71:D0"]
          }
        }
      ]
    } as any;
  }

  // 17. AI Video Growth Assistant & Conversational AI Fallback (for Vercel static host / offline resilience)
  if (endpoint.startsWith('/api/ai/video-assistant')) {
    const rawPrompt = String(parsedBody?.prompt || '').trim();
    const requestedTask = String(parsedBody?.taskType || 'auto').trim();
    const language = String(parsedBody?.language || 'hinglish').trim().toLowerCase();
    const priorMessages: { role: string; text: string }[] = Array.isArray(parsedBody?.messages)
      ? parsedBody.messages
      : [];

    if (!rawPrompt) {
      return {
        success: false,
        message: 'Please enter your video topic or question.'
      } as any;
    }

    const cleanTopic =
      rawPrompt.replace(/^(generate|write|create|give me|batao|likho)\s+/i, '').trim() ||
      'AtoPlay Viral Video';
    const shortTopic = cleanTopic.length > 48 ? `${cleanTopic.slice(0, 48).trim()}...` : cleanTopic;
    const slugWords = cleanTopic
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 4);
    const baseTag = slugWords.length > 0 ? slugWords.join(' ') : 'atoplay viral video';
    const hashBase =
      slugWords.length > 0
        ? slugWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
        : 'AtoPlayCreator';

    const lower = rawPrompt.toLowerCase();
    let effectiveTask = requestedTask;
    if (effectiveTask === 'auto') {
      if (/(title|tag|keyword|seo)/i.test(lower)) {
        effectiveTask = 'title_seo';
      } else if (/(script|hook|idea|concept|story)/i.test(lower)) {
        effectiveTask = 'script_idea';
      } else if (/(thumbnail|poster|cover|color|overlay)/i.test(lower)) {
        effectiveTask = 'thumbnail_guide';
      } else if (/(description|hashtag|caption|cta)/i.test(lower)) {
        effectiveTask = 'description_hashtags';
      } else {
        effectiveTask = 'all_in_one';
      }
    }

    const isFollowUp = priorMessages.length > 0;

    const titles =
      language === 'hindi'
        ? [
            `${shortTopic} का असली सच! 99% लोग ये गलती करते हैं (Must Watch)`,
            `सिर्फ 5 मिनट में ${shortTopic} सीखे — नयी ट्रिक 2026!`,
            `मैंने ${shortTopic} ट्राई किया और रिजल्ट देखकर चौंक गया!`
          ]
        : language === 'english'
        ? [
            `The Hidden Truth About ${shortTopic} (99% Creators Miss This!)`,
            `How to Master ${shortTopic} in 2026 — Step-by-Step Guide`,
            `I Tried ${shortTopic} for 7 Days and Here Is What Happened!`
          ]
        : [
            `${shortTopic} Ka Asli Secret! 99% Log Ye Galti Karte Hain`,
            `Sirf 5 Minute Me ${shortTopic} — Best Viral Trick 2026!`,
            `Maine ${shortTopic} Try Kiya Aur Result Dekhkar Shocked Reh Gaya!`
          ];

    const seoTags = [
      baseTag,
      `${baseTag} 2026`,
      `${baseTag} hindi`,
      `how to ${baseTag}`,
      `${baseTag} viral trick`,
      'atoplay trending video',
      'atoplay creator growth',
      `${slugWords[0] || 'atoplay'} full guide`,
      'viral video atoplay',
      'atoplay views booster'
    ];

    const videoConcepts =
      language === 'hindi'
        ? [
            {
              title: 'Concept 1: लाइव प्रूफ और स्टेप-बाय-स्टेप गाइड',
              concept: `${shortTopic} को बिल्कुल आसान भाषा में शुरू से अंत तक लाइव स्क्रीन/कैमरा पर दिखाएं ताकि दर्शक पूरा वीडियो देखें।`
            },
            {
              title: 'Concept 2: 3 सबसे बड़ी गलतियां बनाम सही तरीका',
              concept: `लोग ${shortTopic} में कौनसी 3 गलतियां करते हैं और उन्हें तुरंत कैसे सुधारें, इसका तेज़ कंपैरिजन दिखाएं।`
            }
          ]
        : language === 'english'
        ? [
            {
              title: 'Concept 1: Real Proof & Step-by-Step Breakdown',
              concept: `Show the final result of ${shortTopic} in the first 3 seconds, then walk viewers through the exact steps clearly.`
            },
            {
              title: 'Concept 2: 3 Common Mistakes vs. The Winning Formula',
              concept: `Compare what beginners do wrong with ${shortTopic} against the fast, high-retention method that works right now.`
            }
          ]
        : [
            {
              title: 'Concept 1: Live Result + Step-by-Step Breakdown',
              concept: `Pehle 3 second me ${shortTopic} ka final proof dikhao, phir simple steps me poora process explain karo taaki watch time 100% mile.`
            },
            {
              title: 'Concept 2: 3 Big Mistakes vs Pro Creator Trick',
              concept: `Beginners ${shortTopic} me jo 3 galtiyan karte hain unhe highlight karo aur turant working solution batao.`
            }
          ];

    const openingHook =
      language === 'hindi'
        ? `"[0-3 सेकंड]: रुकिए! अगर आप भी ${shortTopic} को लेकर परेशान हैं, तो अगले 15 सेकंड ध्यान से देखिए।\n[3-10 सेकंड]: ज्यादातर लोग इसमें एक ऐसी गलती करते हैं जिससे उनका पूरा समय खराब हो जाता है।\n[10-15 सेकंड]: आज के इस वीडियो में मैं आपको वो सटीक तरीका दिखाने वाला हूँ जो 100% काम करता है — चलिए शुरू करते हैं!"`
        : language === 'english'
        ? `"[0-3s]: Stop scrolling! If you care about ${shortTopic}, watch the next 15 seconds carefully.\n[3-10s]: Most people make one simple mistake here that costs them hours of effort.\n[10-15s]: In this video, I'm showing you the exact method that works in 2026 — let's dive right in!"`
        : `"[0-3s]: Rukiye! Agar aap bhi ${shortTopic} ke baare me jaanna chahte hain, toh agle 15 second bilkul skip mat karna!\n[3-10s]: 90% log ek choti si galti karte hain jisse unka result ruk jata hai.\n[10-15s]: Aaj main aapko live proof ke sath sabse aasan tarika dikhane wala hoon — chaliye shuru karte hain!"`;

    const thumbnailOverlays =
      language === 'hindi'
        ? [`"99% लोग फेल!"`, `"असली सच 🔥"`, `"सिर्फ 2 मिनट में!"`]
        : language === 'english'
        ? [`"DON'T DO THIS!"`, `"100% WORKING!"`, `"SECRET REVEALED"`]
        : [`"99% LOG GALAT!"`, `"ASLI SECRET 🔥"`, `"LIVE PROOF!"`];

    const thumbnailBackgrounds = [
      `High-clarity close-up expressive reaction on one side with a clear visual of ${shortTopic} on the other side`,
      `Before vs After split-screen frame with a bold glowing arrow pointing to the final result`,
      `Dark blurred studio background so the main subject and bold text pop immediately on mobile screens`
    ];

    const thumbnailColors = [
      'Bright Yellow (#FACC15) bold text on Deep Black (#09090B) background',
      'Crisp White (#FFFFFF) & Neon Green (#22C55E) text on Dark Navy (#0F172A)',
      'Vibrant Red (#EF4444) badge with White text on High-Contrast Charcoal'
    ];

    const descriptionText =
      language === 'hindi'
        ? `इस वीडियो में हमने **${shortTopic}** के बारे में पूरी जानकारी आसान भाषा में समझाई है।\n\n📌 **इस वीडियो में आप सीखेंगे:**\n• ${shortTopic} की पूरी स्टेप-बाय-स्टेप जानकारी\n• सबसे ज़रूरी टिप्स और ट्रिक्स\n• वो गलतियां जिनसे आपको बचना चाहिए\n\n👍 **अगर वीडियो पसंद आए तो LIKE करें और हमारे AtoPlay चैनल को FOLLOW ज़रूर करें!** कमेंट में बताएं अगला वीडियो किस टॉपिक पर चाहिए।`
        : language === 'english'
        ? `In this video, we break down everything you need to know about **${shortTopic}** step by step.\n\n📌 **What You Will Learn:**\n• Complete breakdown of ${shortTopic}\n• Proven tips for faster results\n• Key mistakes to avoid\n\n👍 **Hit the LIKE button and FOLLOW our AtoPlay channel for more high-value videos!** Drop a comment below with your questions.`
        : `Is video me humne **${shortTopic}** ko bilkul simple aur practical tarike se cover kiya hai.\n\n📌 **Video Highlights:**\n• ${shortTopic} ka complete step-by-step guide\n• Best working tips aur pro tricks\n• Common mistakes jo aapko avoid karni chahiye\n\n👍 **Video pasand aaye toh LIKE karein aur humare AtoPlay channel ko FOLLOW zaroor karein!** Comment karke batayein next video kis topic par chahiye.`;

    const hashtags = [`#${hashBase}`, '#AtoPlay', '#AtoPlayCreators', '#ViralVideo', '#Trending2026'];

    const sections: string[] = [];
    if (isFollowUp) {
      sections.push(
        language === 'hindi'
          ? `आपके पिछले सवाल को ध्यान में रखते हुए **${shortTopic}** के लिए अपडेटेड AI प्लान नीचे दिया गया है:`
          : language === 'english'
          ? `Based on our conversation, here is the updated creator plan for **${shortTopic}**:`
          : `Aapke follow-up topic **${shortTopic}** ke hisaab se updated AI response niche ready hai:`
      );
    }

    if (effectiveTask === 'title_seo' || effectiveTask === 'all_in_one') {
      sections.push(
        `**1. Viral High-CTR Titles**\n${titles.map((t, i) => `${i + 1}. **${t}**`).join('\n')}\n\n**Trending SEO Tags & Keywords**\n• ${seoTags.join(', ')}`
      );
    }

    if (effectiveTask === 'script_idea' || effectiveTask === 'all_in_one') {
      sections.push(
        `**2. Unique Video Concepts**\n${videoConcepts
          .map((c) => `• **${c.title}**: ${c.concept}`)
          .join('\n')}\n\n**15-Second Opening Hook Script**\n${openingHook}`
      );
    }

    if (effectiveTask === 'thumbnail_guide' || effectiveTask === 'all_in_one') {
      sections.push(
        `**3. Thumbnail Concept Guide**\n• **Catchy Overlay Text**: ${thumbnailOverlays.join(' | ')}\n• **Background Visuals**: ${thumbnailBackgrounds.join(' ; ')}\n• **High-Contrast Colors**: ${thumbnailColors.join(' | ')}`
      );
    }

    if (effectiveTask === 'description_hashtags' || effectiveTask === 'all_in_one') {
      sections.push(
        `**4. Video Description & Hashtags**\n${descriptionText}\n\n**Hashtags**: ${hashtags.join(' ')}`
      );
    }

    const taskTitleMap: Record<string, string> = {
      title_seo: 'Title & SEO Tag Generator',
      script_idea: 'Video Script & Idea Generator',
      thumbnail_guide: 'Thumbnail Concept Guide',
      description_hashtags: 'Description & Hashtag Writer',
      all_in_one: 'AtoPlay AI Growth Assistant'
    };

    return {
      success: true,
      result: {
        detectedTask: effectiveTask,
        taskTitle: taskTitleMap[effectiveTask] || 'AtoPlay AI Assistant',
        titles: effectiveTask === 'title_seo' || effectiveTask === 'all_in_one' ? titles : [],
        seoTags: effectiveTask === 'title_seo' || effectiveTask === 'all_in_one' ? seoTags : [],
        videoConcepts: effectiveTask === 'script_idea' || effectiveTask === 'all_in_one' ? videoConcepts : [],
        openingHook: effectiveTask === 'script_idea' || effectiveTask === 'all_in_one' ? openingHook : '',
        thumbnailOverlays:
          effectiveTask === 'thumbnail_guide' || effectiveTask === 'all_in_one' ? thumbnailOverlays : [],
        thumbnailBackgrounds:
          effectiveTask === 'thumbnail_guide' || effectiveTask === 'all_in_one' ? thumbnailBackgrounds : [],
        thumbnailColors:
          effectiveTask === 'thumbnail_guide' || effectiveTask === 'all_in_one' ? thumbnailColors : [],
        descriptionText:
          effectiveTask === 'description_hashtags' || effectiveTask === 'all_in_one' ? descriptionText : '',
        hashtags: effectiveTask === 'description_hashtags' || effectiveTask === 'all_in_one' ? hashtags : [],
        cleanFormattedOutput: sections.join('\n\n')
      }
    } as any;
  }

  // Default fallback response
  return { success: true, message: 'Action completed' } as any;
}

/**
 * Smart App / Browser Opener:
 * Opens the target AtoPlay URL cleanly in a new tab/window.
 */
export function openAtoPlayUrl(url: string, _preferBrowser = false) {
  if (!url) return;
  const cleaned = cleanVideoUrl(url) || url;
  window.open(cleaned, '_blank', 'noopener,noreferrer');
}

