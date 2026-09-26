import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { User, Campaign, Transaction } from "./src/types.ts";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const app = express();
const PORT = 3000;

app.use(express.json());

// Cloud Run & Load Balancer Health Probes (MUST BE FIRST)
app.get(["/api/health", "/healthz"], (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// In-Memory Database State
const users: Record<string, User> = {};
const userPasswords: Record<string, string> = {};
const atoplayUsernameMap: Record<string, string> = {}; // lowercase atoplay handle -> userId
let currentSessionUser: User | null = null;

let campaigns: Campaign[] = [];

// Track which campaigns each user has watched so they are permanently removed from their feed
const userWatchedCampaigns: Record<string, Set<string>> = {};

let transactions: Transaction[] = [];

// Referral code registry: code -> userId
const referralCodes: Record<string, string> = {};

// Helper to generate a clean 6-character referral code (e.g. REF-A482)

interface SupportMessageRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  targetEmail: string;
  subject: string;
  message: string;
  createdAt: string;
  delivered: boolean;
}

const supportMessages: SupportMessageRecord[] = [];
const TARGET_SUPPORT_GMAIL = 'krja462@gmail.com';
function generateUserReferralCode(user: User): string {
  const cleanId = (user.id || '').replace(/[^a-zA-Z0-9]/g, '');
  const suffix = cleanId.length >= 4 ? cleanId.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  let code = `REF-${suffix}`;
  let counter = 1;
  while (referralCodes[code] && referralCodes[code] !== user.id) {
    code = `REF-${suffix}${counter}`;
    counter++;
  }
  referralCodes[code] = user.id;
  return code;
}

// Secure Watch Sessions storage for Anti-Cheat & Replay Protection
interface ServerWatchSession {
  sessionId: string;
  sessionToken: string;
  userId: string;
  campaignId: string;
  startTime: number;
  durationSeconds: number;
  countBefore: number;
  channelKey: string;
  claimed: boolean;
  aborted: boolean;
  expiresAt: number;
}
const watchSessions: Record<string, ServerWatchSession> = {};

// In-Memory Creator Channel Follower Registry
const channelFollowerStore: Record<string, number> = {};
const userFollowedCampaigns: Record<string, Set<string>> = {};
const followSessions: Record<string, { countBefore: number; startTime: number; channelKey: string; channelId?: string; channelName?: string }> = {};

export interface FollowLogItem {
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
const followLogs: FollowLogItem[] = [];

export interface CampaignCreationLogItem {
  id: string;
  campaignId: string;
  userId: string;
  userName: string;
  videoUrl: string;
  channelId?: string;
  channelName?: string;
  initialFollowers: number;
  timestamp: string;
}
const campaignCreationLogs: CampaignCreationLogItem[] = [];

interface ChannelFollowerResult {
  count: number;
  channelKey: string;
  channelId?: string;
  channelName?: string;
  channelImage?: string;
  isRealAtoPlay: boolean;
}

function parseFollowersCount(val: any): number | undefined {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return undefined;
  const s = val.trim().toUpperCase();
  if (s.endsWith('M')) return Math.round(parseFloat(s) * 1000000);
  if (s.endsWith('K')) return Math.round(parseFloat(s) * 1000);
  const n = parseInt(s.replace(/,/g, ''), 10);
  return isNaN(n) ? undefined : n;
}

// Backend Helper to fetch creator's current channel follower count from AtoPlay
async function fetchChannelFollowerCount(campaign: Campaign, bypassCache: boolean = false): Promise<ChannelFollowerResult> {
  const channelKey = campaign.channelName || campaign.userName || campaign.userId || campaign.id;
  let count: number | null = null;
  let channelId = campaign.channelId;
  let channelName = campaign.channelName || campaign.userName;
  let channelImage: string | undefined = undefined;
  let isRealAtoPlay = false;

  try {
    const videoUrl = campaign.videoUrl || '';
    
    // Check if channelId is already in URL or campaign
    const directChannelMatch = videoUrl.match(/(?:channel\/|c\/|user\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (directChannelMatch) {
      channelId = directChannelMatch[1];
    }

    // If no channelId yet, extract videoId from URL
    if (!channelId) {
      const uuidMatch = videoUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) ||
                       videoUrl.match(/(?:video\/|player\/|v\/)([0-9a-f]{32})/i);
      if (uuidMatch) {
        let videoId = uuidMatch[0];
        if (!videoId.includes('-') && uuidMatch[1]) {
          const h = uuidMatch[1].toLowerCase();
          videoId = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const ATOPLAY_REQ_HEADERS = {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://atoplay.com/',
          'Origin': 'https://atoplay.com'
        };

        try {
          let res = await fetch(`https://api.atoplay.com/api/videos/${videoId}`, {
            signal: controller.signal,
            headers: ATOPLAY_REQ_HEADERS
          });
          if (!res.ok) {
            res = await fetch(`https://atoplay.com/api/videos/${videoId}`, {
              signal: controller.signal,
              headers: ATOPLAY_REQ_HEADERS
            });
          }
          clearTimeout(timeoutId);
          if (res.ok) {
            const vData = await res.json();
            const channelObj = vData?.channel || vData?.data?.channel || {};
            channelId = channelObj?.id || vData?.channelId || vData?.ownerId;
            if (channelObj?.name) channelName = channelObj.name;
            const liveF = parseFollowersCount(
              channelObj?.followersCount ?? 
              channelObj?.followers ?? 
              channelObj?.subscribersCount ??
              vData?.followersCount ??
              vData?.data?.followersCount
            );
            if (liveF !== undefined) {
              count = liveF;
              isRealAtoPlay = true;
            }
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }
    }

    // Now if channelId is known, fetch live channel stats directly from AtoPlay API!
    if (channelId && count === null) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const ATOPLAY_REQ_HEADERS = {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://atoplay.com/',
        'Origin': 'https://atoplay.com'
      };

      try {
        let cRes = await fetch(`https://api.atoplay.com/api/channels/${channelId}`, {
          signal: controller.signal,
          headers: ATOPLAY_REQ_HEADERS
        });
        if (!cRes.ok) {
          cRes = await fetch(`https://atoplay.com/api/channels/${channelId}`, {
            signal: controller.signal,
            headers: ATOPLAY_REQ_HEADERS
          });
        }
        clearTimeout(timeoutId);
        if (cRes.ok) {
          const cData = await cRes.json();
          const channelObj = cData?.channel || cData?.data?.channel || cData;
          if (channelObj) {
            const parsedCount = parseFollowersCount(
              channelObj.followersCount ?? 
              channelObj.followers ?? 
              channelObj.subscribersCount
            );
            if (parsedCount !== undefined) {
              count = parsedCount;
              isRealAtoPlay = true;
            }
            if (channelObj.name) channelName = channelObj.name;
            if (channelObj.channelImage) channelImage = channelObj.channelImage;
          }
        }
      } catch {
        clearTimeout(timeoutId);
      }
    }

    // Fallback: Scrape video/channel page HTML if count is still null
    if (count === null && videoUrl && (videoUrl.includes('atoplay.com') || videoUrl.includes('atoplay.in'))) {
      try {
        const scrapeController = new AbortController();
        const scrapeTimeout = setTimeout(() => scrapeController.abort(), 4000);
        const sRes = await fetch(videoUrl, {
          signal: scrapeController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        clearTimeout(scrapeTimeout);
        if (sRes.ok) {
          const html = await sRes.text();
          const nextMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
          if (nextMatch && nextMatch[1]) {
            try {
              const nJson = JSON.parse(nextMatch[1]);
              const vObj = nJson?.props?.pageProps?.video || nJson?.props?.pageProps?.videoData;
              const cObj = vObj?.channel || nJson?.props?.pageProps?.channel;
              if (cObj?.followersCount !== undefined || cObj?.followers !== undefined) {
                const parsedF = parseFollowersCount(cObj.followersCount ?? cObj.followers);
                if (parsedF !== undefined) {
                  count = parsedF;
                  isRealAtoPlay = true;
                }
              }
              if (cObj?.name) channelName = cObj.name;
              if (cObj?.id) channelId = cObj.id;
            } catch {}
          }
          if (count === null) {
            const followMatch = html.match(/(?:([0-9.,]+[KkMmBb]?)\s*(?:Followers|followers|subscribers|Subscribers))/i) ||
                                html.match(/"(?:followersCount|subscribersCount|followers)"\s*:\s*([0-9]+)/i);
            if (followMatch && followMatch[1]) {
              const parsed = parseFollowersCount(followMatch[1]);
              if (parsed !== undefined) {
                count = parsed;
                isRealAtoPlay = true;
              }
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("fetchChannelFollowerCount AtoPlay error:", err);
  }

  // If campaign already had real followers saved from creation
  if (count === null && typeof campaign.channelFollowers === 'number' && campaign.channelFollowers > 0) {
    count = campaign.channelFollowers;
    isRealAtoPlay = true;
  }

  // If live AtoPlay API returned real count
  if (count !== null) {
    channelFollowerStore[channelKey] = count;
    return { count, channelKey, channelId, channelName, channelImage, isRealAtoPlay: true };
  }

  // Fallback to in-memory store
  if (channelFollowerStore[channelKey] === undefined) {
    const seed = (campaign.title || campaign.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    channelFollowerStore[channelKey] = 120 + (seed % 350);
  }

  return { 
    count: channelFollowerStore[channelKey], 
    channelKey, 
    channelId, 
    channelName, 
    channelImage, 
    isRealAtoPlay: false 
  };
}

// Admin Account Configuration
const ADMIN_EMAIL = "krja462@gmail.com";
const ADMIN_UNLIMITED_COINS = 999999999;

// Pre-provision Admin Account with Unlimited Coins
const adminUid = `g_krja462_gmail_com`;
users[adminUid] = {
  id: adminUid,
  name: "Admin (KRJA)",
  email: ADMIN_EMAIL,
  coins: ADMIN_UNLIMITED_COINS, // Unlimited Coins
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
  streak: 30,
  lastCheckIn: new Date().toISOString().split('T')[0],
  createdAt: new Date().toISOString(),
  referralsCount: 25,
  referralEarnings: 6250,
  referralCode: "REF-KRJA",
  isAdmin: true
};
referralCodes["REF-KRJA"] = adminUid;

function getActiveUser(req: express.Request): User | null {
  const uid = (req.headers['x-user-id'] as string) || (req.body && req.body.userId) || (req.query && (req.query.uid as string));
  let user = (uid && users[uid]) ? users[uid] : currentSessionUser;

  const clientCoinsHeader = req.headers['x-user-coins'] ? parseInt(req.headers['x-user-coins'] as string, 10) : undefined;

  // Auto-restore session user if uid was sent but memory was refreshed
  if (!user && uid) {
    const cleanUid = String(uid).trim();
    const isAdmin = cleanUid.includes('krja462') || cleanUid === adminUid;
    users[cleanUid] = {
      id: cleanUid,
      name: isAdmin ? "Admin (KRJA)" : "AtoPlay User",
      email: isAdmin ? ADMIN_EMAIL : (cleanUid.includes('@') ? cleanUid : "user@atoplay.com"),
      coins: isAdmin ? ADMIN_UNLIMITED_COINS : (typeof clientCoinsHeader === 'number' && !isNaN(clientCoinsHeader) ? clientCoinsHeader : 100),
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
      streak: 1,
      lastCheckIn: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      referralsCount: 0,
      referralEarnings: 0,
      referralCode: `REF-${cleanUid.slice(0, 6).toUpperCase()}`,
      isAdmin
    };
    user = users[cleanUid];
  }
  
  // Enforce Unlimited Coins for Admin account
  if (user && (user.email?.toLowerCase().trim() === ADMIN_EMAIL || user.id.includes('krja462') || user.isAdmin)) {
    user.isAdmin = true;
    user.coins = ADMIN_UNLIMITED_COINS;
  } else if (user && typeof clientCoinsHeader === 'number' && !isNaN(clientCoinsHeader)) {
    // Preserve client's earned coins across server cache refreshes
    if (clientCoinsHeader > user.coins) {
      user.coins = clientCoinsHeader;
    }
  }
  return user;
}

// API Routes
app.get("/api/user", (req, res) => {
  const user = getActiveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, user: null, message: "User not authenticated. Please log in with Google." });
  }
  if (!user.referralCode) {
    user.referralCode = generateUserReferralCode(user);
  }
  res.json({ success: true, user });
});

// Sync client wallet balance directly with server cache
app.post("/api/user/sync-wallet", (req, res) => {
  const user = getActiveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "User not authenticated" });
  }
  const { coins } = req.body;
  if (typeof coins === 'number' && !user.isAdmin) {
    user.coins = Math.max(user.coins, coins);
  }
  res.json({ success: true, user });
});

app.post("/api/auth/firebase-login", async (req, res) => {
  const { uid, email, name, avatar, referralCode: inputReferralCode } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Missing email" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const isAdmin = cleanEmail === ADMIN_EMAIL || String(uid || '').includes('krja462');
  const effectiveUid = uid || `g_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

  let user = users[effectiveUid];
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    user = {
      id: effectiveUid,
      name: name || (isAdmin ? "Admin (KRJA)" : cleanEmail.split('@')[0]),
      email: cleanEmail,
      coins: isAdmin ? ADMIN_UNLIMITED_COINS : 100, // Unlimited coins for admin, 100 Welcome Bonus for normal users
      avatar: avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80`,
      streak: 1,
      lastCheckIn: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      referralsCount: 0,
      referralEarnings: 0,
      isAdmin: isAdmin ? true : undefined,
      loginMethod: 'google'
    };
    user.referralCode = generateUserReferralCode(user);
    users[effectiveUid] = user;

    transactions.push({
      id: `tx_${Date.now()}`,
      userId: uid,
      type: "bonus_signup",
      amount: isAdmin ? ADMIN_UNLIMITED_COINS : 100,
      description: isAdmin ? "Admin Unlimited Coins Granted" : "Welcome Bonus Coins on Google Signup (+100 Coins)",
      createdAt: new Date().toISOString(),
    });

    // Check if new user was referred by a friend
    if (inputReferralCode) {
      const cleanRef = String(inputReferralCode).trim().toUpperCase();
      const referrerId = referralCodes[cleanRef];
      const referrer = referrerId ? users[referrerId] : null;

      if (referrer && referrer.id !== uid) {
        user.referredBy = referrer.id;
        // Referrer earns 250 coins
        referrer.coins += 250;
        referrer.referralsCount = (referrer.referralsCount || 0) + 1;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + 250;

        transactions.unshift({
          id: `tx_${Date.now()}_ref`,
          userId: referrer.id,
          type: "referral_bonus",
          amount: 250,
          description: `Referral Reward: Friend ${user.name} joined via your link!`,
          createdAt: new Date().toISOString(),
        });

        // New user also gets 250 bonus coins
        user.coins += 250;
        transactions.unshift({
          id: `tx_${Date.now()}_ref_inv`,
          userId: user.id,
          type: "referral_received",
          amount: 250,
          description: `Referral Bonus for using link: ${cleanRef}`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } else {
    if (isAdmin) {
      user.coins = ADMIN_UNLIMITED_COINS;
      user.isAdmin = true;
    }
    if (name) user.name = name;
    if (avatar && !user.avatar?.includes('googleusercontent') && avatar.includes('googleusercontent')) {
      user.avatar = avatar;
    }
    if (!user.referralCode) user.referralCode = generateUserReferralCode(user);
    user.loginMethod = 'google';
  }

  currentSessionUser = user;
  res.json({ 
    success: true, 
    user, 
    isNewUser,
    message: isNewUser ? "Welcome! 100 bonus coins added." : "Authenticated successfully with Google" 
  });
});

// AtoPlay Channel & Password Login / Registration Endpoint
app.post("/api/auth/atoplay-login", (req, res) => {
  const { username, password, referralCode: inputReferralCode } = req.body;
  
  if (!username || !username.trim()) {
    return res.status(400).json({ 
      success: false, 
      message: "Please enter your AtoPlay channel name or username." 
    });
  }

  const cleanUsername = username.trim().replace(/^@+/, '');
  const usernameKey = cleanUsername.toLowerCase();
  const cleanPassword = password ? String(password).trim() : '';

  if (!cleanPassword || cleanPassword.length < 3) {
    return res.status(400).json({ 
      success: false, 
      message: "Password must be at least 3 characters long." 
    });
  }

  // 1. Check if user already exists by mapped handle, atoPlayUsername, or user ID
  let existingUserId = atoplayUsernameMap[usernameKey];
  if (!existingUserId) {
    const found = Object.values(users).find(u => 
      (u.atoPlayUsername && u.atoPlayUsername.toLowerCase() === usernameKey) ||
      u.id === `ato_${usernameKey}` ||
      u.email.toLowerCase() === `${usernameKey}@atoplay.user`
    );
    if (found) {
      existingUserId = found.id;
      atoplayUsernameMap[usernameKey] = found.id;
    }
  }

  let user = existingUserId ? users[existingUserId] : null;
  let isNewUser = false;

  if (user) {
    // Check password if previously recorded
    const savedPassword = userPasswords[user.id];
    if (savedPassword && savedPassword !== cleanPassword) {
      return res.status(401).json({ 
        success: false, 
        message: `Incorrect password for @${cleanUsername}. Please enter the correct password.` 
      });
    }

    // Save or update password if not set
    if (!savedPassword) {
      userPasswords[user.id] = cleanPassword;
    }

    user.atoPlayUsername = cleanUsername;
    user.loginMethod = 'atoplay';
  } else {
    // New user registration
    isNewUser = true;
    const deterministicUid = `ato_${usernameKey.replace(/[^a-z0-9_]/g, '_')}`;
    const isAdmin = usernameKey === 'krja462' || usernameKey.includes('krja462');

    user = {
      id: deterministicUid,
      name: cleanUsername,
      email: `${usernameKey}@atoplay.user`,
      coins: isAdmin ? ADMIN_UNLIMITED_COINS : 100, // Instant Welcome bonus
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80`,
      streak: 1,
      lastCheckIn: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      referralsCount: 0,
      referralEarnings: 0,
      atoPlayUsername: cleanUsername,
      loginMethod: 'atoplay',
      isAdmin: isAdmin ? true : undefined
    };
    user.referralCode = generateUserReferralCode(user);
    users[deterministicUid] = user;
    userPasswords[deterministicUid] = cleanPassword;
    atoplayUsernameMap[usernameKey] = deterministicUid;

    transactions.push({
      id: `tx_${Date.now()}`,
      userId: deterministicUid,
      type: "bonus_signup",
      amount: isAdmin ? ADMIN_UNLIMITED_COINS : 100,
      description: isAdmin ? "Admin Unlimited Coins Granted" : `Welcome Bonus on AtoPlay Channel Login (+100 Coins)`,
      createdAt: new Date().toISOString(),
    });

    // Handle Referral Bonus
    if (inputReferralCode) {
      const cleanRef = String(inputReferralCode).trim().toUpperCase();
      const referrerId = referralCodes[cleanRef];
      const referrer = referrerId ? users[referrerId] : null;

      if (referrer && referrer.id !== deterministicUid) {
        user.referredBy = referrer.id;
        referrer.coins += 250;
        referrer.referralsCount = (referrer.referralsCount || 0) + 1;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + 250;

        transactions.unshift({
          id: `tx_${Date.now()}_ref`,
          userId: referrer.id,
          type: "referral_bonus",
          amount: 250,
          description: `Referral Reward: Channel @${cleanUsername} joined via your link!`,
          createdAt: new Date().toISOString(),
        });

        user.coins += 250;
        transactions.unshift({
          id: `tx_${Date.now()}_ref_inv`,
          userId: user.id,
          type: "referral_received",
          amount: 250,
          description: `Referral Bonus for using link: ${cleanRef}`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  currentSessionUser = user;
  res.json({
    success: true,
    user,
    isNewUser,
    message: isNewUser 
      ? `Welcome @${cleanUsername}! AtoPlay channel linked (+${user.coins} Coins).`
      : `Welcome back @${cleanUsername}! Logged in successfully with channel linked.`
  });
});

// Admin API: Get all registered Google users
app.get("/api/admin/users", (req, res) => {
  const user = getActiveUser(req);
  if (!user || (!user.isAdmin && user.email?.toLowerCase().trim() !== ADMIN_EMAIL)) {
    return res.status(403).json({ success: false, message: "Unauthorized. Admin access required." });
  }
  return res.json({ success: true, users: Object.values(users) });
});

// Admin API: Edit user coins (add, subtract, set)
app.post("/api/admin/users/coins", (req, res) => {
  const adminUser = getActiveUser(req);
  if (!adminUser || (!adminUser.isAdmin && adminUser.email?.toLowerCase().trim() !== ADMIN_EMAIL)) {
    return res.status(403).json({ success: false, message: "Unauthorized. Admin access required." });
  }
  const { userId, amount, action } = req.body; // action: 'add' | 'subtract' | 'set'
  const targetUser = users[userId];
  if (!targetUser) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  const numAmount = Number(amount) || 0;
  if (action === 'add') {
    targetUser.coins = (targetUser.coins || 0) + numAmount;
  } else if (action === 'subtract') {
    targetUser.coins = Math.max(0, (targetUser.coins || 0) - numAmount);
  } else if (action === 'set') {
    targetUser.coins = Math.max(0, numAmount);
  } else {
    targetUser.coins = (targetUser.coins || 0) + numAmount;
  }
  return res.json({ success: true, user: targetUser });
});

// Admin API: Delete user account permanently
app.post("/api/admin/users/delete", (req, res) => {
  const adminUser = getActiveUser(req);
  if (!adminUser || (!adminUser.isAdmin && adminUser.email?.toLowerCase().trim() !== ADMIN_EMAIL)) {
    return res.status(403).json({ success: false, message: "Unauthorized. Admin access required." });
  }
  const { userId } = req.body;
  if (userId === adminUid || users[userId]?.email?.toLowerCase().trim() === ADMIN_EMAIL) {
    return res.status(400).json({ success: false, message: "Cannot delete official Admin account." });
  }
  delete users[userId];
  return res.json({ success: true, message: "User deleted successfully" });
});

// Admin API: Block or unblock user account
app.post("/api/admin/users/block", (req, res) => {
  const adminUser = getActiveUser(req);
  if (!adminUser || (!adminUser.isAdmin && adminUser.email?.toLowerCase().trim() !== ADMIN_EMAIL)) {
    return res.status(403).json({ success: false, message: "Unauthorized. Admin access required." });
  }
  const { userId, isBlocked } = req.body;
  if (userId === adminUid || users[userId]?.email?.toLowerCase().trim() === ADMIN_EMAIL) {
    return res.status(400).json({ success: false, message: "Cannot block official Admin account." });
  }
  const targetUser = users[userId];
  if (!targetUser) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  targetUser.isBlocked = Boolean(isBlocked);
  return res.json({ success: true, user: targetUser });
});

// Admin API: Get campaign creation follower capture logs
app.get("/api/admin/campaign-logs", (req, res) => {
  const adminUser = getActiveUser(req);
  if (!adminUser || (!adminUser.isAdmin && adminUser.email?.toLowerCase().trim() !== ADMIN_EMAIL)) {
    return res.status(403).json({ success: false, message: "Unauthorized. Admin access required." });
  }
  res.json({ success: true, logs: campaignCreationLogs });
});

app.post("/api/auth/logout", (req, res) => {
  currentSessionUser = null;
  res.json({ success: true, message: "Logged out successfully" });
});

// Refresh / Reset all stored Google accounts
app.post("/api/auth/reset-accounts", (req, res) => {
  // Clear all non-admin stored user records in server memory
  Object.keys(users).forEach(uid => {
    if (uid !== adminUid && users[uid]?.email?.toLowerCase().trim() !== ADMIN_EMAIL) {
      delete users[uid];
    }
  });
  // Ensure official Admin account is fresh with Unlimited Coins
  users[adminUid] = {
    id: adminUid,
    name: "Admin (KRJA)",
    email: ADMIN_EMAIL,
    coins: ADMIN_UNLIMITED_COINS,
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
    streak: 30,
    lastCheckIn: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    referralsCount: 25,
    referralEarnings: 6250,
    referralCode: "REF-KRJA",
    isAdmin: true
  };
  currentSessionUser = null;
  res.json({ success: true, message: "All logged in Google accounts refreshed successfully" });
});

app.get("/api/campaigns", (req, res) => {
  const filter = req.query.filter; // 'my' or 'all'
  const activeUser = getActiveUser(req);
  const rawWatched = (req.headers['x-watched-ids'] as string) || (req.query.watched as string);
  const extraWatchedSet = new Set<string>(
    rawWatched ? rawWatched.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  if (filter === 'my') {
    const myCampaigns = activeUser ? campaigns.filter(c => c.userId === activeUser.id).map(c => ({
      ...c,
      videoUrl: cleanVideoUrl(c.videoUrl),
      followLogs: followLogs.filter(l => l.campaignId === c.id)
    })) : [];
    return res.json({ success: true, campaigns: myCampaigns });
  }

  // Home public watch feed:
  // 1. Must be active and have remaining views (viewsCompleted < viewsRequired)
  // 2. Filter out creator's own campaigns from their own home feed (users cannot watch own videos)
  // 3. Filter out videos that this specific user has already watched and earned coins from
  // 4. For all other users, campaign remains visible until its required views are reached
  const queueCampaigns = campaigns.filter(c => {
    const reqViews = c.viewsRequired ?? c.targetViews ?? 10;
    const compViews = c.viewsCompleted ?? c.completedViews ?? 0;
    if (c.status !== 'active' || compViews >= reqViews) return false;

    // Check extra client-reported watched IDs
    if (extraWatchedSet.has(c.id)) return false;

    if (activeUser) {
      // Don't show creator's own campaign in their home feed
      if (c.userId === activeUser.id) return false;
      // Don't show video if user has already watched it
      if (userWatchedCampaigns[activeUser.id]?.has(c.id)) return false;
      if (c.completedUserIds && Array.isArray(c.completedUserIds) && c.completedUserIds.includes(activeUser.id)) return false;
    }
    return true;
  });

  const cleanedQueue = queueCampaigns.map(c => ({
    ...c,
    videoUrl: cleanVideoUrl(c.videoUrl)
  }));

  res.json({ success: true, campaigns: cleanedQueue });
});

// Sync campaigns from Cloud Firestore or clients to server in-memory store
app.post("/api/campaigns/sync", (req, res) => {
  const incoming = req.body?.campaigns;
  if (Array.isArray(incoming)) {
    for (const inc of incoming) {
      if (!inc || !inc.id) continue;
      if (inc.id === 'camp_starter_1' || inc.id === 'camp_starter_2' || String(inc.userId || '').startsWith('creator_starter')) {
        continue;
      }
      const safeInc = {
        ...inc,
        videoUrl: cleanVideoUrl(inc.videoUrl || '')
      };
      const existingIdx = campaigns.findIndex(c => c.id === inc.id);
      if (existingIdx !== -1) {
        const existing = campaigns[existingIdx];
        const mergedCompletedUserIds = Array.from(new Set([
          ...(existing.completedUserIds || []),
          ...(inc.completedUserIds || [])
        ]));
        campaigns[existingIdx] = {
          ...existing,
          ...safeInc,
          videoUrl: cleanVideoUrl(safeInc.videoUrl || existing.videoUrl),
          viewsCompleted: Math.max(existing.viewsCompleted ?? 0, inc.viewsCompleted ?? 0),
          completedViews: Math.max(existing.completedViews ?? 0, inc.completedViews ?? 0),
          completedUserIds: mergedCompletedUserIds,
          status: (Math.max(existing.viewsCompleted ?? 0, inc.viewsCompleted ?? 0) >= (existing.viewsRequired ?? 10)) ? 'completed' : (inc.status || existing.status)
        };
      } else {
        campaigns.unshift(safeInc);
      }
    }
  }
  res.json({ success: true, totalCampaigns: campaigns.length });
});

// Clear all campaigns from server in-memory queue
app.post("/api/campaigns/clear-all", (req, res) => {
  campaigns = [];
  res.json({ success: true, message: "All campaigns cleared from server" });
});

// Support Contact Endpoint: Dispatches message to krja462@gmail.com
app.post("/api/support/message", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    const activeUser = getActiveUser(req);

    const senderName = name || activeUser?.name || 'AtoPlay App User';
    const senderEmail = email || activeUser?.email || 'creator@atoplaybooster.app';
    const msgSubject = subject || 'AtoPlay Booster Support Request';
    const msgBody = message || '';

    if (!msgBody.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }

    // Attempt direct email delivery to krja462@gmail.com via formsubmit.co relay
    let emailDelivered = false;
    try {
      const emailResponse = await fetch(`https://formsubmit.co/ajax/${TARGET_SUPPORT_GMAIL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': 'https://atoplaybooster.app',
          'Origin': 'https://atoplaybooster.app'
        },
        body: JSON.stringify({
          _subject: `[AtoPlay Support] ${msgSubject} - from ${senderName}`,
          name: senderName,
          email: senderEmail,
          message: msgBody,
          userId: activeUser?.id || 'anonymous',
          coins: activeUser?.coins ?? 'N/A',
          timestamp: new Date().toLocaleString(),
          _template: 'table'
        })
      });

      if (emailResponse.ok) {
        emailDelivered = true;
      }
    } catch (e) {
      console.warn('Email forwarding relay error:', e);
    }

    const record: SupportMessageRecord = {
      id: `msg_${Date.now()}`,
      userId: activeUser?.id || 'anonymous',
      userName: senderName,
      userEmail: senderEmail,
      targetEmail: TARGET_SUPPORT_GMAIL,
      subject: msgSubject,
      message: msgBody,
      createdAt: new Date().toISOString(),
      delivered: emailDelivered
    };

    supportMessages.unshift(record);

    res.json({
      success: true,
      message: `Your message has been sent to ${TARGET_SUPPORT_GMAIL}`,
      targetEmail: TARGET_SUPPORT_GMAIL,
      emailDelivered
    });
  } catch (err: any) {
    console.error('Support message handling error:', err);
    res.status(500).json({ success: false, message: 'Failed to process support message' });
  }
});

app.get("/api/support/messages", (req, res) => {
  res.json({ success: true, messages: supportMessages.slice(0, 50) });
});

// Helper to decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to generate clean 4-character video ID
function generate4CharId(raw?: string): string {
  if (raw) {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 4) {
      // Use last 4 alphanumeric chars in uppercase
      return clean.slice(-4).toUpperCase();
    }
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Universal Video URL Sanitizer & Deduplicator
function cleanVideoUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let s = rawUrl.trim().replace(/^["']|["']$/g, '');

  // 1. Check for duplicated URLs (e.g. "https://...https://..." or "atoplay.com/...https://...")
  const httpMatches = [...s.matchAll(/https?:\/\//gi)];
  if (httpMatches.length > 1) {
    const secondIndex = httpMatches[1].index;
    if (secondIndex !== undefined && secondIndex > 0) {
      s = s.substring(0, secondIndex).trim();
    }
  }

  // 2. Check if there is an AtoPlay UUID inside the string
  const uuidMatch = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch) {
    const videoId = uuidMatch[0].toLowerCase();
    if (s.toLowerCase().includes('atoplay') || (!s.includes('youtube') && !s.includes('youtu.be'))) {
      return `https://atoplay.com/video/${videoId}`;
    }
  }

  // 3. Check for 32-character hex ID (UUID without dashes)
  const hex32Match = s.match(/[0-9a-f]{32}/i);
  if (hex32Match && (s.toLowerCase().includes('atoplay') || !s.includes('youtube'))) {
    const h = hex32Match[0].toLowerCase();
    const formatted = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
    return `https://atoplay.com/video/${formatted}`;
  }

  // 4. Check for YouTube video ID
  const ytMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/watch?v=${ytMatch[1]}`;
  }

  // 5. Ensure valid protocol
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = `https://${s}`;
  }

  return s;
}

// Enhanced Helper to extract real metadata from video URL (AtoPlay, YouTube, etc.)
async function extractVideoMetadata(videoUrl: string) {
  let displayId = generate4CharId();
  let title = "AtoPlay Video Promotion";
  let thumbnailUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80";
  let channelName = "AtoPlay Creator";
  let channelId: string | undefined = undefined;
  let channelFollowers: number | undefined = undefined;
  let durationSeconds = 60;
  let durationText = "1:00";
  let isRealVideo = false;

  try {
    let trimmedUrl = (videoUrl || '').trim().replace(/^["']|["']$/g, '');
    
    // Check if user entered a bare UUID or 32-hex string directly
    const directUuidMatch = trimmedUrl.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const directHex32Match = trimmedUrl.match(/^[0-9a-f]{32}$/i);
    if (directUuidMatch) {
      trimmedUrl = `https://atoplay.com/video/${directUuidMatch[0]}`;
    } else if (directHex32Match) {
      const h = directHex32Match[0];
      const formatted = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
      trimmedUrl = `https://atoplay.com/video/${formatted}`;
    } else if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      trimmedUrl = `https://${trimmedUrl}`;
    }

    const urlObj = new URL(trimmedUrl);
    const hostname = urlObj.hostname.toLowerCase();
    const isValidHostname = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(hostname) || hostname === 'localhost';

    // 1. Direct AtoPlay Official Platform API Integration
    const isAtoPlay = isValidHostname && (hostname.includes('atoplay.com') || hostname.includes('atoplay.in'));
    const uuidMatch = trimmedUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) ||
                     trimmedUrl.match(/(?:video\/|player\/|v\/)([0-9a-f]{32})/i);

    if (isAtoPlay || uuidMatch) {
      let videoId = '';
      if (uuidMatch) {
        if (uuidMatch[0].includes('-')) {
          videoId = uuidMatch[0].toLowerCase();
        } else {
          const h = uuidMatch[1].toLowerCase();
          videoId = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
        }
      }

      if (videoId) {
        displayId = generate4CharId(videoId);
        try {
          // Probe endpoint 1: https://api.atoplay.com/api/videos/${videoId}
          let apiRes = await fetch(`https://api.atoplay.com/api/videos/${videoId}`, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          // Probe endpoint 2: fallback to /videos/v2/ if needed
          if (!apiRes.ok) {
            apiRes = await fetch(`https://api.atoplay.com/api/videos/v2/${videoId}`, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
          }

          if (apiRes.ok) {
            const vData = await apiRes.json();
            if (vData?.title) {
              title = decodeHtmlEntities(vData.title);
            }
            if (vData?.thumbnailUrl) {
              thumbnailUrl = vData.thumbnailUrl;
              if (!thumbnailUrl.startsWith('http')) {
                thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
              }
            }
            if (vData?.channel?.name || vData?.channelName) {
              channelName = vData.channel?.name || vData.channelName;
            }
            channelId = vData?.channelId || vData?.channel?.id;
            channelFollowers = parseFollowersCount(vData?.channel?.followersCount ?? vData?.channel?.followers ?? vData?.followersCount);
            
            // If channelId is present, try to fetch the live channel directly for exact real followers:
            if (channelId && (channelFollowers === undefined || channelFollowers === null)) {
              try {
                const cRes = await fetch(`https://api.atoplay.com/api/channels/${channelId}`, {
                  headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                });
                if (cRes.ok) {
                  const cData = await cRes.json();
                  if (cData?.channel?.followersCount !== undefined) {
                    channelFollowers = Number(cData.channel.followersCount);
                  }
                  if (cData?.channel?.name) {
                    channelName = cData.channel.name;
                  }
                }
              } catch {}
            }

            if (vData?.durationSeconds || vData?.duration) {
              durationSeconds = Number(vData.durationSeconds || vData.duration) || 60;
              const mins = Math.floor(durationSeconds / 60);
              const secs = durationSeconds % 60;
              durationText = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            isRealVideo = true;
            return { displayId, title, thumbnailUrl, channelName, channelId, channelFollowers, durationSeconds, durationText, isRealVideo };
          }
        } catch (atoErr) {
          console.warn('AtoPlay direct API error:', atoErr);
        }
      }

      // If no UUID or API failed, check if URL contains slug or keyword
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      const lastSegment = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
      const searchKeywords = decodeURIComponent(lastSegment).replace(/[-_]/g, ' ').trim();

      if (searchKeywords && searchKeywords !== 'video' && searchKeywords !== 'watch' && searchKeywords !== 'v') {
        try {
          const searchRes = await fetch(`https://api.atoplay.com/api/search/search?query=${encodeURIComponent(searchKeywords)}&page=1&limit=5`, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          if (searchRes.ok) {
            const sData = await searchRes.json();
            if (Array.isArray(sData) && sData.length > 0) {
              const bestMatch = sData[0];
              if (bestMatch?.title) {
                title = decodeHtmlEntities(bestMatch.title);
              }
              if (bestMatch?.thumbnailUrl) {
                thumbnailUrl = bestMatch.thumbnailUrl;
                if (!thumbnailUrl.startsWith('http')) {
                  thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
                }
              }
              if (bestMatch?.id || bestMatch?.videoId) {
                displayId = generate4CharId(bestMatch.id || bestMatch.videoId);
              }
              if (bestMatch?.channel?.name || bestMatch?.channelName) {
                channelName = bestMatch.channel?.name || bestMatch.channelName;
              }
              channelId = bestMatch?.channelId || bestMatch?.channel?.id;
              channelFollowers = parseFollowersCount(bestMatch?.channel?.followersCount ?? bestMatch?.channel?.followers);
              isRealVideo = true;
              return { displayId, title, thumbnailUrl, channelName, channelId, channelFollowers, durationSeconds, durationText, isRealVideo };
            }
          }
        } catch {
          // ignore search fallback
        }
      }
    }

    // 2. Check for YouTube URLs (including shorts, youtu.be, etc.)
    if (isValidHostname && (hostname.includes('youtube.com') || hostname.includes('youtu.be'))) {
      let videoId = '';
      if (hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1).split('?')[0];
      } else if (urlObj.pathname.includes('/shorts/')) {
        const parts = urlObj.pathname.split('/shorts/');
        videoId = parts[1]?.split('/')[0]?.split('?')[0] || '';
      } else if (urlObj.pathname.includes('/embed/')) {
        const parts = urlObj.pathname.split('/embed/');
        videoId = parts[1]?.split('/')[0]?.split('?')[0] || '';
      } else {
        videoId = urlObj.searchParams.get('v') || '';
      }

      if (videoId) {
        displayId = generate4CharId(videoId);
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        channelName = "YouTube Creator";
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(trimmedUrl)}&format=json`);
          if (oembedRes.ok) {
            const data = await oembedRes.json();
            if (data.title) {
              title = decodeHtmlEntities(data.title);
            }
            if (data.author_name) {
              channelName = data.author_name;
            }
          }
        } catch {
          title = `YouTube Video (${videoId})`;
        }
        isRealVideo = true;
        return { displayId, title, thumbnailUrl, channelName, channelId, channelFollowers, durationSeconds, durationText, isRealVideo };
      }
    }

    // 3. For other video platforms or generic URLs:
    const vParam = urlObj.searchParams.get('v') || urlObj.searchParams.get('id') || urlObj.searchParams.get('video_id');
    if (vParam) {
      displayId = generate4CharId(vParam);
    } else {
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        displayId = generate4CharId(segments[segments.length - 1]);
      }
    }

    // Attempt live network scrape for OpenGraph/Twitter/HTML tags
    if (isValidHostname && (urlObj.pathname.length > 1 || urlObj.search.length > 1)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(trimmedUrl, {
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
            'Cache-Control': 'no-cache'
          }
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();

          // 1. Check __NEXT_DATA__ JSON
          const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
          if (nextDataMatch && nextDataMatch[1]) {
            try {
              const nextJson = JSON.parse(nextDataMatch[1]);
              const vObj = nextJson?.props?.pageProps?.video || nextJson?.props?.pageProps?.videoData;
              const cObj = vObj?.channel || nextJson?.props?.pageProps?.channel;
              if (vObj?.title && (title === "AtoPlay Video Promotion" || !title)) {
                title = decodeHtmlEntities(vObj.title);
                isRealVideo = true;
              }
              if (vObj?.thumbnailUrl) {
                thumbnailUrl = vObj.thumbnailUrl;
                if (!thumbnailUrl.startsWith('http')) {
                  thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
                }
                isRealVideo = true;
              }
              if (cObj?.name) {
                channelName = cObj.name;
              }
              if (cObj?.id) {
                channelId = cObj.id;
              }
              if (cObj?.followersCount !== undefined || cObj?.followers !== undefined) {
                channelFollowers = parseFollowersCount(cObj.followersCount ?? cObj.followers);
              }
            } catch {}
          }

          // 2. Scrape Title
          const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                               html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
                               html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i) ||
                               html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i) ||
                               html.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i);

          if (ogTitleMatch && ogTitleMatch[1]) {
            title = decodeHtmlEntities(ogTitleMatch[1]);
            isRealVideo = true;
          } else {
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              title = decodeHtmlEntities(titleMatch[1]);
            }
          }

          title = title
            .replace(/\s*\|\s*AtoPlay.*$/i, '')
            .replace(/\s*-\s*AtoPlay.*$/i, '')
            .replace(/\s*\|\s*YouTube.*$/i, '')
            .replace(/\s*-\s*YouTube.*$/i, '')
            .trim();

          // 3. Scrape Channel Name & Followers from HTML
          if (channelFollowers === undefined) {
            const followMatch = html.match(/(?:([0-9.,]+[KkMmBb]?)\s*(?:Followers|followers|subscribers|Subscribers))/i) ||
                                html.match(/"(?:followersCount|subscribersCount|followers)"\s*:\s*([0-9]+)/i);
            if (followMatch && followMatch[1]) {
              channelFollowers = parseFollowersCount(followMatch[1]);
            }
          }

          const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<meta[^>]*property=["']og:video:actor["'][^>]*content=["']([^"']+)["']/i);
          if (authorMatch && authorMatch[1]) {
            channelName = decodeHtmlEntities(authorMatch[1]);
          }

          // 4. Scrape Thumbnail
          const ogImageMatch = html.match(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
                               html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i) ||
                               html.match(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
                               html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i) ||
                               html.match(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i) ||
                               html.match(/<video[^>]*poster=["']([^"']+)["']/i);

          if (ogImageMatch && ogImageMatch[1]) {
            let rawImg = ogImageMatch[1].trim();
            try {
              thumbnailUrl = new URL(rawImg, trimmedUrl).href;
              isRealVideo = true;
            } catch {
              thumbnailUrl = rawImg;
            }
          } else {
            const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
            if (jsonLdMatch && jsonLdMatch[1]) {
              try {
                const parsed = JSON.parse(jsonLdMatch[1]);
                const item = Array.isArray(parsed) ? parsed[0] : parsed;
                if (item.thumbnailUrl) {
                  thumbnailUrl = Array.isArray(item.thumbnailUrl) ? item.thumbnailUrl[0] : item.thumbnailUrl;
                  isRealVideo = true;
                } else if (item.image) {
                  thumbnailUrl = typeof item.image === 'string' ? item.image : (item.image.url || thumbnailUrl);
                  isRealVideo = true;
                }
                if (item.name && title === "AtoPlay Video Promotion") {
                  title = decodeHtmlEntities(item.name);
                }
              } catch {
                // ignore json parse error
              }
            }
          }
        }
      } catch {
        // Fallback gracefully without dumping DNS errors to log
      }
    }

    // If title is still default, extract clean slug from URL
    if (title === "AtoPlay Video Promotion" || !title) {
      const pathSlug = urlObj.pathname.split('/').filter(Boolean).pop();
      if (pathSlug && pathSlug !== 'watch' && pathSlug !== 'v' && pathSlug !== 'video') {
        title = decodeURIComponent(pathSlug).replace(/[-_]/g, ' ');
      } else {
        title = `AtoPlay Video #${displayId}`;
      }
    }

    // Capitalize first letter of title if lowercase
    if (title && title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    // If thumbnail still not found, select a high-resolution video-styled card
    if (thumbnailUrl.includes('unsplash.com')) {
      const thumbs = [
        "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp",
        "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/b079eff5-e942-4d88-813d-6bc5a40d08e9.webp",
        "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/12093053-ff39-4dd8-9c1f-a1a801b54b28.webp"
      ];
      const hash = displayId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      thumbnailUrl = thumbs[hash % thumbs.length];
    }
  } catch (err) {
    displayId = generate4CharId();
    title = `AtoPlay Video #${displayId}`;
  }

  if (channelFollowers === undefined || channelFollowers === null || isNaN(channelFollowers)) {
    const hash = displayId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    channelFollowers = 150 + (hash % 650);
  }

  return { displayId, title, thumbnailUrl, channelName, channelId, channelFollowers, durationSeconds, durationText, isRealVideo };
}

// Route to live-extract metadata for preview in frontend (supports both paths and GET/POST)
app.all(["/api/campaigns/extract-metadata", "/api/extract-metadata"], async (req, res) => {
  const url = (req.query.url as string) || (req.body && req.body.url);
  if (!url) {
    return res.status(400).json({ success: false, message: "URL parameter is required" });
  }
  try {
    const metadata = await extractVideoMetadata(url);
    res.json({ success: true, metadata });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "Failed to extract metadata" });
  }
});

app.post("/api/campaigns", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in with Google to create a campaign." });
  }

  const { videoUrl, targetViews, viewsRequired, durationSeconds, title: customTitle, thumbnailUrl: customThumbnail } = req.body;
  
  if (!videoUrl || (!targetViews && !viewsRequired)) {
    return res.status(400).json({ success: false, message: "Missing required campaign fields" });
  }

  // Minimum Campaign: Minimum 10 views (800 coins required)
  const views = Number(viewsRequired || targetViews) || 10;
  if (views < 10) {
    return res.status(400).json({ 
      success: false, 
      message: "Minimum campaign is 10 views (800 coins required)." 
    });
  }

  // Campaign Creation Cost: 80 coins per view (60 coins reward for viewer + 20 coins platform fee)
  const COST_PER_VIEW = 80;
  const totalCost = views * COST_PER_VIEW;

  const isUserAdmin = Boolean(activeUser.isAdmin || activeUser.email?.toLowerCase().trim() === ADMIN_EMAIL || activeUser.id.includes('krja462'));

  if (!isUserAdmin && activeUser.coins < totalCost) {
    return res.status(400).json({ 
      success: false, 
      message: "Insufficient coins! Watch more videos to earn." 
    });
  }

  if (isUserAdmin) {
    activeUser.isAdmin = true;
    activeUser.coins = ADMIN_UNLIMITED_COINS; // Always keep admin coins unlimited
  } else {
    activeUser.coins -= totalCost;
  }

  const metadata = await extractVideoMetadata(videoUrl);
  let liveFollowers = metadata.channelFollowers;
  try {
    const channelResult = await fetchChannelFollowerCount({ videoUrl } as any);
    if (typeof channelResult.count === 'number' && channelResult.count > 0) {
      liveFollowers = channelResult.count;
    }
  } catch {}

  const finalChannelFollowers = liveFollowers || (metadata as any).channelFollowers || 150;

  const finalTitle = (customTitle && typeof customTitle === 'string' && customTitle.trim()) 
    ? customTitle.trim() 
    : metadata.title;

  const finalThumbnail = (customThumbnail && typeof customThumbnail === 'string' && customThumbnail.trim() && !customThumbnail.includes('placeholder')) 
    ? customThumbnail.trim() 
    : metadata.thumbnailUrl;

  const newCampaign: Campaign = {
    id: `camp_${Date.now()}`,
    userId: activeUser.id,
    userName: activeUser.name,
    videoUrl: cleanVideoUrl(videoUrl),
    title: finalTitle,
    thumbnailUrl: finalThumbnail,
    viewsRequired: views,
    viewsCompleted: 0,
    rewardPerView: 60,
    targetViews: views,
    completedViews: 0,
    durationSeconds: 60,
    totalCoinsCost: totalCost,
    status: "active",
    createdAt: new Date().toISOString(),
    displayId: generate4CharId(metadata.displayId),
    countryFlag: "🇮🇳",
    channelName: metadata.channelName || activeUser.name,
    channelId: (metadata as any).channelId,
    channelFollowers: finalChannelFollowers,
    initialFollowers: finalChannelFollowers,
    lastCheckedFollowers: finalChannelFollowers,
    durationText: metadata.durationText || "1:00"
  };

  campaigns.unshift(newCampaign);
  persistSitemapToDisk();

  const creationLog: CampaignCreationLogItem = {
    id: `clog_${Date.now()}_${activeUser.id.slice(-4)}`,
    campaignId: newCampaign.id,
    userId: activeUser.id,
    userName: activeUser.name,
    videoUrl: newCampaign.videoUrl,
    channelId: newCampaign.channelId,
    channelName: newCampaign.channelName,
    initialFollowers: finalChannelFollowers,
    timestamp: new Date().toISOString()
  };
  campaignCreationLogs.unshift(creationLog);

  const tx: Transaction = {
    id: `tx_${Date.now()}`,
    userId: activeUser.id,
    type: "spent_campaign",
    amount: -totalCost,
    description: `Created campaign for "${newCampaign.title}" (${views} views @ 80 coins/view)`,
    createdAt: new Date().toISOString(),
  };
  transactions.unshift(tx);

  res.json({ 
    success: true, 
    campaign: newCampaign, 
    user: activeUser,
    message: `Campaign created successfully! ${totalCost} coins deducted.`
  });
});

// Background Follower Growth & Auto-Reward Verification Endpoint
app.get("/api/campaigns/check-followers", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const userCampaigns = campaigns.filter(c => c.userId === activeUser.id && c.status === 'active');
  let totalBonusCoinsAwarded = 0;
  const updates: Array<{ campaignId: string; newFollowers: number; bonusEarned: number }> = [];

  for (const camp of userCampaigns) {
    try {
      const meta = await extractVideoMetadata(camp.videoUrl);
      const currentLiveFollowers = meta.channelFollowers || camp.lastCheckedFollowers || camp.initialFollowers || 150;
      const baseline = camp.lastCheckedFollowers || camp.initialFollowers || camp.channelFollowers || 150;

      if (currentLiveFollowers > baseline) {
        const extra = currentLiveFollowers - baseline;
        const bonusEarned = extra * 30; // +30 coins per extra follower
        totalBonusCoinsAwarded += bonusEarned;

        camp.lastCheckedFollowers = currentLiveFollowers;
        camp.channelFollowers = currentLiveFollowers;

        activeUser.coins += bonusEarned;
        if (users[activeUser.id]) {
          users[activeUser.id].coins = activeUser.coins;
        }

        transactions.unshift({
          id: `tx_fol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: activeUser.id,
          type: "earned_follow",
          amount: bonusEarned,
          description: `🎉 +${bonusEarned} Coins Bonus! ${extra} new channel follower(s) detected for campaign "${camp.title}".`,
          createdAt: new Date().toISOString()
        });

        updates.push({ campaignId: camp.id, newFollowers: currentLiveFollowers, bonusEarned });
      }
    } catch {}
  }

  res.json({
    success: true,
    totalBonusCoinsAwarded,
    user: activeUser,
    updates,
    message: totalBonusCoinsAwarded > 0 ? `🎉 ${totalBonusCoinsAwarded} bonus coins earned from new channel followers!` : 'Checked followers successfully.'
  });
});

app.delete("/api/campaigns/:id", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { id } = req.params;
  const isUserAdmin = Boolean(activeUser.isAdmin || activeUser.email?.toLowerCase().trim() === ADMIN_EMAIL || activeUser.id.includes('krja462'));
  const campaignIndex = campaigns.findIndex(c => c.id === id && (c.userId === activeUser.id || isUserAdmin));

  if (campaignIndex === -1) {
    return res.status(404).json({ success: false, message: "Campaign not found or unauthorized" });
  }

  const campaign = campaigns[campaignIndex];
  if (campaign.status === 'active') {
    const reqViews = campaign.viewsRequired ?? campaign.targetViews ?? 10;
    const compViews = campaign.viewsCompleted ?? campaign.completedViews ?? 0;
    const remainingViews = Math.max(0, reqViews - compViews);
    const coinRate = 80; // 80 coins per remaining view refund
    const refundAmount = Math.floor(remainingViews * coinRate);
    if (refundAmount > 0) {
      if (!isUserAdmin) {
        activeUser.coins += refundAmount;
      }
      transactions.unshift({
        id: `tx_${Date.now()}`,
        userId: activeUser.id,
        type: "refund_campaign",
        amount: refundAmount,
        description: `Refund for deleted campaign (${remainingViews} views remaining @ 80 coins/view)`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  campaigns.splice(campaignIndex, 1);
  persistSitemapToDisk();
  res.json({ success: true, user: activeUser, message: "Campaign deleted and refund processed" });
});

// 1. Secure Watch Session Start (Records start timestamp on server & records creator channel countBefore)
app.post("/api/watch/start-session", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to start watching" });
  }

  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ success: false, message: "Campaign ID required" });
  }

  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign || campaign.status !== 'active') {
    return res.status(400).json({ success: false, message: "Campaign is no longer active" });
  }

  if (campaign.userId === activeUser.id) {
    return res.status(400).json({ success: false, message: "You cannot watch your own campaign to earn coins." });
  }

  if (userWatchedCampaigns[activeUser.id]?.has(campaignId) || campaign.completedUserIds?.includes(activeUser.id)) {
    return res.status(400).json({ success: false, message: "You have already completed this video task." });
  }

  // Fetch creator's baseline channel follower count (countBefore)
  const { count: countBefore, channelKey } = await fetchChannelFollowerCount(campaign);

  // Generate cryptographically unique session ID and single-use security token
  const sessionId = `ws_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const sessionToken = `sec_tok_${crypto.randomBytes(24).toString('hex')}`;
  const startTime = Date.now();

  watchSessions[sessionId] = {
    sessionId,
    sessionToken,
    userId: activeUser.id,
    campaignId,
    startTime,
    durationSeconds: 60,
    countBefore,
    channelKey,
    claimed: false,
    aborted: false,
    expiresAt: startTime + 15 * 60 * 1000 // 15 min expiry
  };

  res.json({
    success: true,
    sessionId,
    sessionToken,
    startTime,
    durationSeconds: 60,
    countBefore,
    channelKey,
    message: "Secure watch session started"
  });
});

// Endpoint to inspect current follower count for channel from AtoPlay API
app.get("/api/channel/followers", async (req, res) => {
  const { campaignId, videoUrl, channelName } = req.query;
  let camp = campaigns.find(c => c.id === campaignId);
  if (!camp) {
    camp = {
      id: (campaignId as string) || 'temp',
      userId: 'temp',
      videoUrl: (videoUrl as string) || '',
      channelName: (channelName as string) || '',
      title: '',
      thumbnailUrl: '',
      viewsRequired: 10,
      viewsCompleted: 0,
      rewardPerView: 60,
      targetViews: 10,
      completedViews: 0,
      durationSeconds: 60,
      totalCoinsCost: 600,
      status: 'active',
      createdAt: new Date().toISOString()
    };
  }
  const result = await fetchChannelFollowerCount(camp);
  res.json({ 
    success: true, 
    count: result.count, 
    channelKey: result.channelKey, 
    channelId: result.channelId,
    channelName: result.channelName,
    isRealAtoPlay: result.isRealAtoPlay 
  });
});

// Dedicated Follow System: 1. Start Follow Session & capture baseline followers from AtoPlay API
app.post("/api/follow/start", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to follow and earn coins" });
  }

  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ success: false, message: "Campaign ID required" });
  }

  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }

  if (campaign.userId === activeUser.id) {
    return res.status(400).json({ success: false, message: "Aap apne khud ke creator channel ko follow karke coins nahi kama sakte." });
  }

  // Anti-fraud: Check if user is restricted from follow bonus
  if (activeUser.isFollowRestricted) {
    return res.status(403).json({ 
      success: false, 
      restricted: true, 
      message: "Your account is restricted from claiming follow bonuses due to confirmed fake follow reports." 
    });
  }

  // Require AtoPlay channel username linked
  if (!activeUser.atoPlayUsername && !req.body.followerUsername) {
    return res.status(400).json({
      success: false,
      needsUsername: true,
      message: "Please link your AtoPlay username first to claim follow bonus coins."
    });
  }

  // Check if already followed
  const alreadyFollowed = Boolean(
    userFollowedCampaigns[activeUser.id]?.has(campaignId) || 
    campaign.followedUserIds?.includes(activeUser.id)
  );

  if (alreadyFollowed) {
    return res.status(400).json({ 
      success: false, 
      alreadyFollowed: true, 
      message: "Aap pehle hi is channel ko follow karke 30 coins prapt kar chuke hain." 
    });
  }

  // Fetch creator's live follower count directly from AtoPlay API
  const result = await fetchChannelFollowerCount(campaign);
  const sessionKey = `${activeUser.id}_${campaign.id}`;
  followSessions[sessionKey] = {
    countBefore: result.count,
    startTime: Date.now(),
    channelKey: result.channelKey,
    channelId: result.channelId,
    channelName: result.channelName
  };

  const channelUrl = result.channelId 
    ? `https://atoplay.com/channel/${result.channelId}` 
    : campaign.videoUrl;

  res.json({
    success: true,
    campaignId: campaign.id,
    countBefore: result.count,
    channelKey: result.channelKey,
    channelId: result.channelId,
    channelName: result.channelName || campaign.channelName || campaign.userName || 'AtoPlay Creator',
    channelUrl,
    isRealAtoPlay: result.isRealAtoPlay,
    rewardCoins: 30,
    alreadyFollowed: false,
    message: `AtoPlay API se creator ke pehle ke followers capture ho gaye (${result.count}). Channel follow karein aur verify karein.`
  });
});

// Dedicated Follow System: 2. Verify Follow with AtoPlay API ("ager user ek bhi follow badhe to coin mile")
app.post("/api/follow/verify", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to earn coins" });
  }

  // Anti-fraud: Check if user is restricted from follow bonus
  if (activeUser.isFollowRestricted) {
    return res.status(403).json({ 
      success: false, 
      restricted: true, 
      message: "Your account is restricted from claiming follow bonuses due to confirmed fake follow reports." 
    });
  }

  const { campaignId, countBefore: clientCountBefore, simulateBump, followerUsername: clientUsername } = req.body;
  if (!campaignId) {
    return res.status(400).json({ success: false, message: "Campaign ID required" });
  }

  // If user passed AtoPlay username or has one saved
  if (clientUsername && clientUsername.trim()) {
    activeUser.atoPlayUsername = clientUsername.trim().replace(/^@+/, '');
  }

  if (!activeUser.atoPlayUsername) {
    return res.status(400).json({
      success: false,
      needsUsername: true,
      message: "Please link your AtoPlay username first to claim follow bonus coins."
    });
  }

  let campaign = campaigns.find(c => c.id === campaignId || c.displayId === campaignId);
  if (!campaign && req.body.videoUrl) {
    campaign = {
      id: campaignId,
      displayId: req.body.displayId || '----',
      userId: 'creator',
      userName: req.body.channelName || 'Creator Channel',
      title: 'AtoPlay Video',
      videoUrl: req.body.videoUrl,
      thumbnailUrl: '',
      channelName: req.body.channelName,
      channelId: req.body.channelId,
      channelFollowers: typeof clientCountBefore === 'number' ? clientCountBefore : 0,
      viewsRequired: 100,
      viewsCompleted: 0,
      targetViews: 100,
      completedViews: 0,
      rewardPerView: 60,
      durationSeconds: 60,
      totalCoinsCost: 0,
      status: 'active',
      createdAt: new Date().toISOString()
    };
  }
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }

  if (campaign.userId === activeUser.id) {
    return res.status(400).json({ success: false, message: "Aap apne khud ke creator channel ko follow karke coins nahi kama sakte." });
  }

  const alreadyFollowed = Boolean(
    userFollowedCampaigns[activeUser.id]?.has(campaignId) || 
    campaign.followedUserIds?.includes(activeUser.id)
  );

  if (alreadyFollowed) {
    return res.status(400).json({ 
      success: false, 
      alreadyFollowed: true, 
      message: "Aap pehle hi is channel ke liye 30 coins claim kar chuke hain." 
    });
  }

  const sessionKey = `${activeUser.id}_${campaign.id}`;
  const session = followSessions[sessionKey];
  const countBefore = session?.countBefore ?? (typeof clientCountBefore === 'number' ? clientCountBefore : (channelFollowerStore[session?.channelKey || campaign.channelName || campaign.id] ?? 0));
  const channelKey = session?.channelKey || campaign.channelName || campaign.userName || campaign.id;

  // Re-fetch latest follower count directly from AtoPlay API!
  const resultAfter = await fetchChannelFollowerCount(campaign, true);
  let countAfter = resultAfter.count;

  // If in dev simulation or test mode (simulateBump), increment countAfter
  if (simulateBump) {
    countAfter = Math.max(countAfter, countBefore + 1);
    channelFollowerStore[channelKey] = countAfter;
  }

  // Strict User Rule: "ager user ek bhi follow badhe to coin mile"
  const followerIncreased = countAfter > countBefore;

  if (!followerIncreased) {
    return res.json({
      success: false,
      verified: false,
      countBefore,
      countAfter,
      message: `AtoPlay API check: Follower nahi badha! (Pehle: ${countBefore}, Abhi: ${countAfter}). Kripya AtoPlay par creator channel ko 'Follow' karein aur phir 'Verify Follow' par click karein.`
    });
  }

  // Follower increased by at least 1! Award 30 coins!
  const reward = 30;
  activeUser.coins += reward;

  // Mark as followed by this user
  if (!userFollowedCampaigns[activeUser.id]) {
    userFollowedCampaigns[activeUser.id] = new Set<string>();
  }
  userFollowedCampaigns[activeUser.id].add(campaign.id);

  if (!campaign.followedUserIds) {
    campaign.followedUserIds = [];
  }
  if (!campaign.followedUserIds.includes(activeUser.id)) {
    campaign.followedUserIds.push(activeUser.id);
  }
  campaign.channelFollowers = countAfter;

  // Clean up session
  delete followSessions[sessionKey];

  // Record Follow Log for Creator Transparency and Fake Follow Reporting
  const resolvedFollowerUsername = activeUser.atoPlayUsername || activeUser.name || 'AtoPlay User';
  const logId = `flog_${Date.now()}_${activeUser.id.slice(-4)}`;
  let followLogEntry = followLogs.find(l => l.campaignId === campaign.id && l.followerUserId === activeUser.id);
  if (!followLogEntry) {
    followLogEntry = {
      id: logId,
      campaignId: campaign.id,
      creatorId: campaign.userId,
      followerUserId: activeUser.id,
      followerUsername: resolvedFollowerUsername,
      followerEmail: activeUser.email,
      followerAvatar: activeUser.avatar,
      followerName: activeUser.name,
      timestamp: new Date().toISOString(),
      status: 'active',
      campaignTitle: campaign.title
    };
    followLogs.unshift(followLogEntry);
  } else {
    if (!followLogEntry.followerEmail && activeUser.email) followLogEntry.followerEmail = activeUser.email;
    if (!followLogEntry.followerAvatar && activeUser.avatar) followLogEntry.followerAvatar = activeUser.avatar;
    if (!followLogEntry.followerName && activeUser.name) followLogEntry.followerName = activeUser.name;
  }

  // Log transaction
  const channelName = resultAfter.channelName || campaign.channelName || campaign.userName || "Creator";
  transactions.unshift({
    id: `tx_${Date.now()}_follow`,
    userId: activeUser.id,
    type: "earned_follow",
    amount: reward,
    description: `Followed "${channelName}" on AtoPlay (+30 coins)`,
    createdAt: new Date().toISOString()
  });

  res.json({
    success: true,
    verified: true,
    earnedCoins: reward,
    newBalance: activeUser.coins,
    countBefore,
    countAfter,
    channelName,
    campaignId: campaign.id,
    user: activeUser,
    followLog: followLogEntry,
    message: `AtoPlay API Verified! Creator ke followers ${countBefore} se badhkar ${countAfter} ho gaye (+1 Follower). +30 Coins aapke wallet mein add kar diye gaye hain!`
  });
});

// AI Screenshot Verification Endpoint for Follow Bonus using Gemini Multimodal
app.post("/api/follow/verify-screenshot", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to verify follow screenshot" });
  }

  const { campaignId, screenshotDataUrl } = req.body;
  if (!campaignId || !screenshotDataUrl) {
    return res.status(400).json({ success: false, message: "Campaign ID and screenshot are required" });
  }

  const campaign = campaigns.find(c => c.id === campaignId || c.displayId === campaignId);
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }

  const alreadyFollowed = Boolean(
    userFollowedCampaigns[activeUser.id]?.has(campaign.id) || 
    campaign.followedUserIds?.includes(activeUser.id)
  );

  if (alreadyFollowed) {
    return res.status(400).json({ success: false, message: "You have already claimed follow bonus for this campaign." });
  }

  let verifiedByAI = false;
  let aiReason = "";

  try {
    const matches = screenshotDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const base64Data = matches[2];

      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data
        }
      };

      const promptPart = {
        text: `Analyze this screenshot from AtoPlay. Does this screenshot show that the user is following the creator channel or that the follower count / following status has successfully increased? Answer in JSON format with keys: { "success": true or false, "reason": "short explanation" }`
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts: [imagePart, promptPart] },
        config: {
          responseMimeType: "application/json"
        }
      });

      const textRes = response.text || "{}";
      const jsonRes = JSON.parse(textRes);
      if (jsonRes.success === true) {
        verifiedByAI = true;
        aiReason = jsonRes.reason || "Screenshot verified successfully.";
      } else {
        aiReason = jsonRes.reason || "Screenshot does not clearly show following status.";
      }
    } else {
      return res.status(400).json({ success: false, message: "Invalid image format." });
    }
  } catch (err) {
    console.warn("Gemini screenshot verification error, falling back to live API check:", err);
    const resultAfter = await fetchChannelFollowerCount(campaign, true);
    if (resultAfter.count > (campaign.initialFollowers || 0)) {
      verifiedByAI = true;
      aiReason = "Verified via live channel follower count check.";
    } else {
      aiReason = "Could not verify follow from screenshot or live API check.";
    }
  }

  if (!verifiedByAI) {
    return res.json({
      success: false,
      verified: false,
      message: `Screenshot verification failed: ${aiReason}. Please ensure the screenshot clearly shows you following the AtoPlay channel.`
    });
  }

  const reward = 30;
  activeUser.coins += reward;

  if (!userFollowedCampaigns[activeUser.id]) {
    userFollowedCampaigns[activeUser.id] = new Set<string>();
  }
  userFollowedCampaigns[activeUser.id].add(campaign.id);

  if (!campaign.followedUserIds) {
    campaign.followedUserIds = [];
  }
  if (!campaign.followedUserIds.includes(activeUser.id)) {
    campaign.followedUserIds.push(activeUser.id);
  }

  // Record Follow Log
  const resolvedFollowerUsername = activeUser.atoPlayUsername || activeUser.name || 'AtoPlay User';
  const logId = `flog_${Date.now()}_${activeUser.id.slice(-4)}`;
  const followLogEntry = {
    id: logId,
    campaignId: campaign.id,
    creatorId: campaign.userId,
    followerUserId: activeUser.id,
    followerUsername: resolvedFollowerUsername,
    followerEmail: activeUser.email,
    followerAvatar: activeUser.avatar,
    followerName: activeUser.name,
    timestamp: new Date().toISOString(),
    status: 'active' as const,
    campaignTitle: campaign.title
  };
  followLogs.unshift(followLogEntry);

  transactions.unshift({
    id: `tx_${Date.now()}_follow_screenshot`,
    userId: activeUser.id,
    type: "earned_follow",
    amount: reward,
    description: `Followed channel with screenshot verification (+30 coins)`,
    createdAt: new Date().toISOString()
  });

  res.json({
    success: true,
    verified: true,
    earnedCoins: reward,
    newBalance: activeUser.coins,
    message: `Screenshot verified by AI successfully! +30 Bonus Coins credited to your wallet.`,
    user: activeUser
  });
});

// Endpoint to update user's linked AtoPlay Channel Name / Username
app.post("/api/user/atoplay-username", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in" });
  }
  const { username, password } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ success: false, message: "AtoPlay username is required" });
  }
  const cleanName = username.trim().replace(/^@+/, '');
  activeUser.atoPlayUsername = cleanName;
  atoplayUsernameMap[cleanName.toLowerCase()] = activeUser.id;
  
  if (password && String(password).trim().length >= 3) {
    userPasswords[activeUser.id] = String(password).trim();
  }

  res.json({
    success: true,
    message: `AtoPlay channel successfully linked: @${cleanName}`,
    atoPlayUsername: cleanName,
    user: activeUser
  });
});

// Endpoint for creators to fetch Follow Logs for a specific campaign
app.get("/api/campaigns/:id/follow-logs", (req, res) => {
  const activeUser = getActiveUser(req);
  const { id } = req.params;
  const campaign = campaigns.find(c => c.id === id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }
  const isCreatorOrAdmin = Boolean(
    activeUser && (activeUser.id === campaign.userId || activeUser.isAdmin || activeUser.email === ADMIN_EMAIL)
  );
  if (!isCreatorOrAdmin) {
    return res.status(403).json({ success: false, message: "Only the campaign creator can view followers log." });
  }

  const logs = followLogs.filter(l => l.campaignId === id);
  res.json({ success: true, logs });
});

// Endpoint to report a fake follower by creator
app.post("/api/follow/report-fake", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in" });
  }
  const { logId } = req.body;
  if (!logId) {
    return res.status(400).json({ success: false, message: "Log ID is required" });
  }

  const log = followLogs.find(l => l.id === logId);
  if (!log) {
    return res.status(404).json({ success: false, message: "Follow log not found" });
  }

  const isCreatorOrAdmin = Boolean(
    activeUser.id === log.creatorId || activeUser.isAdmin || activeUser.email === ADMIN_EMAIL
  );
  if (!isCreatorOrAdmin) {
    return res.status(403).json({ success: false, message: "Only the creator of this campaign can report fake follows." });
  }

  if (log.status === 'reported') {
    return res.json({ success: true, message: "This follow has already been reported.", log });
  }

  log.status = 'reported';
  log.reportedAt = new Date().toISOString();

  // Find target reported user
  const followerUser = users[log.followerUserId];
  let warningCount = 1;
  let isRestricted = false;

  if (followerUser) {
    followerUser.warningCount = (followerUser.warningCount || 0) + 1;
    warningCount = followerUser.warningCount;
    // Deduct fraudulent 30 bonus coins from user's wallet (minimum 0)
    followerUser.coins = Math.max(0, (followerUser.coins || 0) - 30);
    if (followerUser.warningCount >= 3) {
      followerUser.isFollowRestricted = true;
      isRestricted = true;
    }
  }

  res.json({
    success: true,
    message: `Report recorded. @${log.followerUsername} has been reported. 30 coins deducted from user. ${isRestricted ? 'Account has reached 3 reports and is now restricted from follow bonuses.' : `Warning count: ${warningCount}/3.`}`,
    log,
    warningCount,
    isRestricted
  });
});

// Endpoint to list followed campaign IDs for active user
app.get("/api/user/followed-campaigns", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.json({ success: true, followedCampaignIds: [] });
  }
  const followed = Array.from(userFollowedCampaigns[activeUser.id] || []);
  res.json({ success: true, followedCampaignIds: followed });
});

// 2. Watch Session Abort (If user explicitly cancels before 60s)
app.post("/api/watch/abort-session", (req, res) => {
  const { sessionId, sessionToken } = req.body;
  if (sessionId && watchSessions[sessionId]) {
    const session = watchSessions[sessionId];
    if (session.sessionToken === sessionToken) {
      session.aborted = true;
      delete watchSessions[sessionId];
    }
  }
  res.json({ success: true, message: "Watch session aborted. Zero coins granted." });
});

// 3. Watch Session Expire (If user returns to app before 60 seconds have elapsed)
app.post("/api/watch/expire-session", (req, res) => {
  const { sessionId, sessionToken, reason } = req.body;
  if (sessionId && watchSessions[sessionId]) {
    const session = watchSessions[sessionId];
    if (session.sessionToken === sessionToken) {
      delete watchSessions[sessionId];
    }
  }
  res.json({ success: true, message: "Session expired on server. Token invalidated. Zero coins granted." });
});

// 4. Watch Verification & Anti-Cheat Coin Credit (Watch 60s + Follow Bonus)
app.post("/api/watch/verify", async (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to earn coins" });
  }

  const { campaignId, sessionId, sessionToken, watchDuration, userClickedFollow } = req.body;

  if (!campaignId) {
    return res.status(400).json({ success: false, message: "Campaign ID required" });
  }

  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign || campaign.status !== 'active') {
    return res.status(400).json({ success: false, message: "Campaign is no longer active" });
  }

  // 1. Cannot watch own campaign
  if (campaign.userId === activeUser.id) {
    return res.status(400).json({ success: false, message: "You cannot watch your own campaign to earn coins." });
  }

  // 2. Cannot watch the same video multiple times
  if (userWatchedCampaigns[activeUser.id]?.has(campaignId) || campaign.completedUserIds?.includes(activeUser.id)) {
    return res.status(400).json({ success: false, message: "You have already completed this video task." });
  }

  // 3. Strict Server-Side Session & Replay Attack Verification
  if (!sessionId || !sessionToken) {
    return res.status(400).json({ success: false, message: "Missing secure session credentials. Please start watch session normally." });
  }

  const session = watchSessions[sessionId];
  if (!session) {
    return res.status(400).json({ 
      success: false, 
      expired: true,
      message: "Invalid or expired watch session. Session may have already expired, been claimed, or aborted." 
    });
  }

  // Prevent token mismatch or hijacked session
  if (session.sessionToken !== sessionToken || session.userId !== activeUser.id || session.campaignId !== campaignId) {
    return res.status(403).json({ success: false, message: "Security token verification failed." });
  }

  // Prevent multiple triggers or replay attacks on the same view session
  if (session.claimed) {
    return res.status(400).json({ success: false, message: "Replay attack detected: This watch session has already been claimed." });
  }

  if (session.aborted) {
    delete watchSessions[sessionId];
    return res.status(400).json({ success: false, expired: true, message: "This session was aborted earlier. Zero coins granted." });
  }

  // 4. Server-Side Timestamp Verification: Verify at least 60 seconds have elapsed since start timestamp
  const now = Date.now();
  const elapsedSeconds = (now - session.startTime) / 1000;

  // If less than 60 seconds (with sub-second tolerance >= 59.0s), EXPIRE the session immediately!
  if (elapsedSeconds < 59) {
    // Delete session immediately so this token cannot be reused or retried
    delete watchSessions[sessionId];
    return res.status(400).json({ 
      success: false, 
      expired: true,
      elapsedSeconds: Math.floor(elapsedSeconds),
      message: `Session expired: Server verified only ${Math.floor(elapsedSeconds)}s elapsed. Full 60 seconds are strictly required to earn coins. Session token has been destroyed.` 
    });
  }

  // Immediately mark claimed and invalidate single-use session to prevent replay
  const countBefore = session.countBefore ?? 0;
  const channelKey = session.channelKey;
  session.claimed = true;
  delete watchSessions[sessionId];

  // Base Watch Reward: +60 coins for completing 60 seconds
  const baseReward = 60;

  // Follow Bonus Verification:
  // Strictly verify via live AtoPlay API whether channel follower count actually increased or user clicked Follow
  let followed = false;
  let countAfter = countBefore;

  try {
    const resCount = await fetchChannelFollowerCount(campaign, true);
    if (typeof resCount.count === 'number') {
      countAfter = resCount.count;
    }
  } catch (err) {
    console.warn('Live follower verification error:', err);
  }

  // Strict Condition: Follow bonus is awarded ONLY if countAfter > countBefore (real live API follower increase verified)
  if (activeUser.isFollowRestricted) {
    followed = false;
  } else {
    followed = countAfter > countBefore;
  }
  const followBonus = followed ? 30 : 0;
  const earnedCoins = baseReward + followBonus;

  // Credit coins to viewer
  activeUser.coins += earnedCoins;

  // Save follow status if follow bonus was awarded
  if (followed) {
    if (!userFollowedCampaigns[activeUser.id]) {
      userFollowedCampaigns[activeUser.id] = new Set<string>();
    }
    userFollowedCampaigns[activeUser.id].add(campaignId);
    if (!campaign.followedUserIds) {
      campaign.followedUserIds = [];
    }
    if (!campaign.followedUserIds.includes(activeUser.id)) {
      campaign.followedUserIds.push(activeUser.id);
    }
    campaign.channelFollowers = countAfter;

    // Record Follow Log
    const resolvedFollowerUsername = activeUser.atoPlayUsername || activeUser.name || 'AtoPlay User';
    const logId = `flog_${Date.now()}_${activeUser.id.slice(-4)}`;
    let followLogEntry = followLogs.find(l => l.campaignId === campaign.id && l.followerUserId === activeUser.id);
    if (!followLogEntry) {
      followLogEntry = {
        id: logId,
        campaignId: campaign.id,
        creatorId: campaign.userId,
        followerUserId: activeUser.id,
        followerUsername: resolvedFollowerUsername,
        timestamp: new Date().toISOString(),
        status: 'active',
        campaignTitle: campaign.title
      };
      followLogs.unshift(followLogEntry);
    }
  }

  // Save user UID to campaign completed list to prevent repeating the task
  if (!userWatchedCampaigns[activeUser.id]) {
    userWatchedCampaigns[activeUser.id] = new Set<string>();
  }
  userWatchedCampaigns[activeUser.id].add(campaignId);

  if (!campaign.completedUserIds) {
    campaign.completedUserIds = [];
  }
  if (!campaign.completedUserIds.includes(activeUser.id)) {
    campaign.completedUserIds.push(activeUser.id);
  }

  // Increment campaign viewsCompleted
  const currentCompleted = (campaign.viewsCompleted ?? campaign.completedViews ?? 0) + 1;
  campaign.viewsCompleted = currentCompleted;
  campaign.completedViews = currentCompleted;

  const requiredViews = campaign.viewsRequired ?? campaign.targetViews ?? 10;
  if (campaign.viewsCompleted >= requiredViews) {
    campaign.status = "completed";
  }

  const feedbackMessage = followed
    ? "Awesome! You earned 60 coins for watching + 30 coins follow bonus! Total: 90 Coins"
    : "You earned 60 coins for watching! (Tip: Follow the channel next time to earn an extra 30 coins!)";

  // Log transaction
  transactions.unshift({
    id: `tx_${Date.now()}`,
    userId: activeUser.id,
    type: "earned_watch",
    amount: earnedCoins,
    description: followed
      ? `Watched AtoPlay video for 60s (+60) & followed creator channel (+30 bonus) = 90 coins: "${campaign.title.substring(0, 30)}..."`
      : `Watched AtoPlay video for 60s: "${campaign.title.substring(0, 30)}..." (+60 coins)`,
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    earnedCoins,
    baseCoins: baseReward,
    bonusCoins: followBonus,
    followed,
    countBefore,
    countAfter,
    user: activeUser,
    campaign: {
      id: campaign.id,
      viewsRequired: campaign.viewsRequired ?? campaign.targetViews,
      viewsCompleted: campaign.viewsCompleted,
      completedViews: campaign.completedViews,
      targetViews: campaign.targetViews,
      status: campaign.status,
      completedUserIds: campaign.completedUserIds
    },
    message: feedbackMessage
  });
});

// 4. Referral System API Endpoints (250 coins per referral)
app.get("/api/referral", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to view referral details" });
  }

  if (!activeUser.referralCode) {
    activeUser.referralCode = generateUserReferralCode(activeUser);
  }

  res.json({
    success: true,
    referralCode: activeUser.referralCode,
    referralsCount: activeUser.referralsCount || 0,
    referralEarnings: activeUser.referralEarnings || 0,
    rewardPerReferral: 250,
    referredBy: activeUser.referredBy || null,
    user: activeUser
  });
});

app.post("/api/referral/redeem", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in to redeem code" });
  }

  const { referralCode } = req.body;
  if (!referralCode) {
    return res.status(400).json({ success: false, message: "Please provide a referral code" });
  }

  if (activeUser.referredBy) {
    return res.status(400).json({ success: false, message: "You have already redeemed a referral code!" });
  }

  const cleanCode = String(referralCode).trim().toUpperCase();
  if (cleanCode === activeUser.referralCode) {
    return res.status(400).json({ success: false, message: "You cannot redeem your own referral code!" });
  }

  const referrerId = referralCodes[cleanCode];
  const referrer = referrerId ? users[referrerId] : null;

  if (!referrer) {
    return res.status(404).json({ success: false, message: "Invalid referral code. Please check and try again." });
  }

  // Credit 250 coins to referrer
  referrer.coins += 250;
  referrer.referralsCount = (referrer.referralsCount || 0) + 1;
  referrer.referralEarnings = (referrer.referralEarnings || 0) + 250;

  transactions.unshift({
    id: `tx_${Date.now()}_ref_bon`,
    userId: referrer.id,
    type: "referral_bonus",
    amount: 250,
    description: `Referral Reward: ${activeUser.name} joined with your code ${cleanCode}!`,
    createdAt: new Date().toISOString(),
  });

  // Credit 250 coins to active user
  activeUser.coins += 250;
  activeUser.referredBy = referrer.id;

  transactions.unshift({
    id: `tx_${Date.now()}_ref_wel`,
    userId: activeUser.id,
    type: "referral_received",
    amount: 250,
    description: `Welcome Referral Reward: Used friend's code ${cleanCode}`,
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    user: activeUser,
    rewardCoins: 250,
    message: "Referral code applied! You and your friend both earned 250 Coins!"
  });
});

// Daily check-in
app.post("/api/wallet/checkin", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in" });
  }

  const today = new Date().toISOString().split('T')[0];
  if (activeUser.lastCheckIn === today) {
    return res.status(400).json({ success: false, message: "Already checked in today! Come back tomorrow." });
  }

  activeUser.streak += 1;
  activeUser.lastCheckIn = today;
  const rewardCoins = Math.min(200, 50 + (activeUser.streak * 10));
  activeUser.coins += rewardCoins;

  transactions.unshift({
    id: `tx_${Date.now()}`,
    userId: activeUser.id,
    type: "daily_checkin",
    amount: rewardCoins,
    description: `Daily Check-in Streak Day ${activeUser.streak} Reward`,
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, user: activeUser, rewardCoins, message: `Checked in! Earned ${rewardCoins} coins.` });
});

// AdMob Rewarded Ad Simulation
app.post("/api/wallet/reward-ad", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in" });
  }

  const rewardCoins = 100;
  activeUser.coins += rewardCoins;

  transactions.unshift({
    id: `tx_${Date.now()}`,
    userId: activeUser.id,
    type: "rewarded_ad",
    amount: rewardCoins,
    description: "Watched AdMob Rewarded Video",
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, user: activeUser, rewardCoins, message: `Ad completed! Earned ${rewardCoins} coins.` });
});

// In-App Purchase (IAP) Simulation
app.post("/api/wallet/purchase", (req, res) => {
  const activeUser = getActiveUser(req);
  if (!activeUser) {
    return res.status(401).json({ success: false, message: "Please log in" });
  }

  const { packId, coins, price } = req.body;
  if (!coins) {
    return res.status(400).json({ success: false, message: "Invalid coin pack" });
  }

  activeUser.coins += Number(coins);

  transactions.unshift({
    id: `tx_${Date.now()}`,
    userId: activeUser.id,
    type: "iap_purchase",
    amount: Number(coins),
    description: `Purchased Coin Pack (${coins} Coins for $${price || '2.99'})`,
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, user: activeUser, message: `Successfully purchased ${coins} coins!` });
});

app.get("/api/transactions", (req, res) => {
  res.json({ success: true, transactions });
});

// Google Search Console & SEO Routes
app.get("/robots.txt", (req, res) => {
  const host = req.get("host") || "ais-dev-wpjs2egvjyghfr7d3stbsk-1074165775969.asia-southeast1.run.app";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  const robots = `# Google Search Console & Web Crawler Directives
User-agent: *
Allow: /
Disallow: /api/

User-agent: Googlebot
Allow: /
Disallow: /api/

User-agent: Googlebot-Image
Allow: /
Allow: /public/

User-agent: Bingbot
Allow: /
Disallow: /api/

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

# Canonical Sitemap URL
Sitemap: ${baseUrl}/sitemap.xml
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(robots);
});

app.get("/sitemap.xml", (req, res) => {
  const host = req.get("host") || "ais-dev-wpjs2egvjyghfr7d3stbsk-1074165775969.asia-southeast1.run.app";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;
  const currentDate = new Date().toISOString().split("T")[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/?tab=watch</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/?tab=campaigns</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/?tab=wallet</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/?tab=referral</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

// PWA Manifest route
app.get("/manifest.json", (_req, res) => {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  const manifestPath = path.join(process.cwd(), "public", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).json({ error: "manifest.json not found" });
  }
});

// PWA Service Worker route
app.get("/sw.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const swPath = path.join(process.cwd(), "public", "sw.js");
  if (fs.existsSync(swPath)) {
    res.sendFile(swPath);
  } else {
    res.status(404).send("// sw.js not found");
  }
});

// Helper to safely escape XML special characters
function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Generate Google Search Console & Google Video compliant Sitemap XML
function buildSitemapXml(activeCampaigns: Campaign[]): string {
  const baseUrl = "https://ato-play-viewe-increase.vercel.app";
  const today = new Date().toISOString().split('T')[0];

  const appPages = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/?tab=watch", priority: "0.9", changefreq: "hourly" },
    { path: "/?tab=campaigns", priority: "0.9", changefreq: "daily" },
    { path: "/?tab=wallet", priority: "0.8", changefreq: "daily" },
    { path: "/?tab=referral", priority: "0.8", changefreq: "weekly" },
    { path: "/?tab=privacy", priority: "0.5", changefreq: "monthly" }
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  // App Pages
  for (const page of appPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${page.path}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // Active Videos in the App
  for (const camp of activeCampaigns) {
    if (!camp || camp.status !== 'active') continue;
    const campDate = camp.createdAt ? camp.createdAt.split('T')[0] : today;
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}/?watch=${encodeURIComponent(camp.id)}</loc>\n`;
    xml += `    <lastmod>${campDate}</lastmod>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;
    xml += `    <video:video>\n`;
    xml += `      <video:thumbnail_loc>${escapeXml(camp.thumbnailUrl || `${baseUrl}/pwa-512x512.png`)}</video:thumbnail_loc>\n`;
    xml += `      <video:title>${escapeXml(camp.title || 'AtoPlay Video Promotion')}</video:title>\n`;
    xml += `      <video:description>${escapeXml((camp.title || 'AtoPlay Video') + ' - Watch for 60 seconds on AtoPlay and earn coins on AtoViewer')}</video:description>\n`;
    xml += `      <video:player_loc allow_embed="yes">${escapeXml(camp.videoUrl)}</video:player_loc>\n`;
    xml += `      <video:duration>${camp.durationSeconds || 60}</video:duration>\n`;
    xml += `      <video:publication_date>${camp.createdAt || new Date().toISOString()}</video:publication_date>\n`;
    xml += `      <video:family_friendly>yes</video:family_friendly>\n`;
    xml += `    </video:video>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>\n`;
  return xml;
}

function persistSitemapToDisk(): void {
  try {
    const publicSitemap = path.join(process.cwd(), "public", "sitemap.xml");
    fs.writeFileSync(publicSitemap, buildSitemapXml(campaigns), "utf-8");
  } catch (err) {
    console.warn("Could not write sitemap.xml to disk:", err);
  }
}

// Robots.txt route for Googlebot and search crawlers
app.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  const robotsPath = path.join(process.cwd(), "public", "robots.txt");
  if (fs.existsSync(robotsPath)) {
    res.sendFile(robotsPath);
  } else {
    res.send(`# Robots.txt for AtoViewer\nUser-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://ato-play-viewe-increase.vercel.app/sitemap.xml\n`);
  }
});

// Dynamic Sitemap.xml route for Google Search Console
app.get("/sitemap.xml", (_req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  const xml = buildSitemapXml(campaigns);
  res.send(xml);
});

// Support Google Search Console HTML File Verification (e.g. google1234567890abcdef.html)
app.get("/google:code([a-zA-Z0-9_-]+).html", (req, res) => {
  const code = req.params.code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`google-site-verification: google${code}.html`);
});

// Favicon and Icon Routes for Google Search crawler, browsers and PWA
const servePublicImage = (filename: string, contentType: string = "image/png") => (_req: express.Request, res: express.Response) => {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
  const p = path.join(process.cwd(), "public", filename);
  if (fs.existsSync(p)) return res.sendFile(p);
  const rootP = path.join(process.cwd(), filename);
  if (fs.existsSync(rootP)) return res.sendFile(rootP);
  res.status(404).end();
};

app.get("/favicon.ico", servePublicImage("favicon.ico", "image/x-icon"));
app.get("/icon.png", servePublicImage("icon.png", "image/png"));
app.get("/Icon.png", servePublicImage("Icon.png", "image/png"));
app.get("/apkicon.png", servePublicImage("apkicon.png", "image/png"));
app.get("/screenshot.png", servePublicImage("screenshot.png", "image/png"));
app.get("/favicon.png", servePublicImage("favicon.png", "image/png"));
app.get("/favicon-48x48.png", servePublicImage("favicon-48x48.png", "image/png"));
app.get("/favicon-64x64.png", servePublicImage("favicon-64x64.png", "image/png"));
app.get("/favicon-96x96.png", servePublicImage("favicon-96x96.png", "image/png"));
app.get("/apple-touch-icon.png", servePublicImage("apple-touch-icon.png", "image/png"));
app.get("/pwa-192x192.png", servePublicImage("pwa-192x192.png", "image/png"));
app.get("/pwa-512x512.png", servePublicImage("pwa-512x512.png", "image/png"));
app.get("/pwa-maskable-512x512.png", servePublicImage("pwa-maskable-512x512.png", "image/png"));

// Digital Asset Links in-memory registry for PWABuilder TWA APKs (Hides Chrome URL bar)
interface AssetLinkTarget {
  namespace: string;
  package_name: string;
  sha256_cert_fingerprints: string[];
}
interface AssetLinkEntry {
  relation: string[];
  target: AssetLinkTarget;
}

let customAssetLinks: AssetLinkEntry[] = [];

function loadAssetLinks(): AssetLinkEntry[] {
  const publicPath = path.join(process.cwd(), "public", ".well-known", "assetlinks.json");
  const distPath = path.join(process.cwd(), "dist", ".well-known", "assetlinks.json");
  const targetFile = fs.existsSync(publicPath) ? publicPath : distPath;

  let baseEntries: AssetLinkEntry[] = [];
  try {
    if (fs.existsSync(targetFile)) {
      const content = fs.readFileSync(targetFile, 'utf-8');
      baseEntries = JSON.parse(content);
    }
  } catch (e) {
    console.warn("Failed reading assetlinks.json:", e);
  }

  // Merge base entries and customAssetLinks without duplicates
  const map = new Map<string, AssetLinkEntry>();
  for (const item of [...baseEntries, ...customAssetLinks]) {
    const key = `${item.target.package_name}_${item.target.sha256_cert_fingerprints.join('_')}`;
    map.set(key, item);
  }
  return Array.from(map.values());
}

// Digital Asset Links verification for Android TWA (Hides Chrome URL bar)
app.get(["/.well-known/assetlinks.json", "/assetlinks.json"], (_req, res) => {
  const entries = loadAssetLinks();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(entries);
});

// API to inspect and add custom package name & SHA256 fingerprints from PWABuilder
app.get("/api/assetlinks", (_req, res) => {
  const entries = loadAssetLinks();
  res.json({ success: true, entries });
});

app.post("/api/assetlinks", (req, res) => {
  try {
    const { packageName, sha256Fingerprint } = req.body;
    if (!packageName || !sha256Fingerprint) {
      return res.status(400).json({ success: false, message: "packageName and sha256Fingerprint are required." });
    }

    const cleanPkg = String(packageName).trim();
    // Normalize fingerprint: uppercase, ensure colons or space-delimited
    const cleanFp = String(sha256Fingerprint).trim().toUpperCase();

    const newEntry: AssetLinkEntry = {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: cleanPkg,
        sha256_cert_fingerprints: [cleanFp]
      }
    };

    customAssetLinks.push(newEntry);

    // Also persist to public/.well-known/assetlinks.json so it survives
    const all = loadAssetLinks();
    const publicDir = path.join(process.cwd(), "public", ".well-known");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(path.join(publicDir, "assetlinks.json"), JSON.stringify(all, null, 2), 'utf-8');

    const distDir = path.join(process.cwd(), "dist", ".well-known");
    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, "assetlinks.json"), JSON.stringify(all, null, 2), 'utf-8');
    }

    res.json({
      success: true,
      message: `AssetLinks successfully updated with package '${cleanPkg}' and fingerprint '${cleanFp}'. URL bar will be hidden on your next APK launch!`,
      entries: all
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "Failed saving assetlinks" });
  }
});


async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.CLOUD_RUN_JOB) ||
    (typeof __filename !== "undefined" && __filename.endsWith(".cjs")) ||
    (fs.existsSync(path.join(process.cwd(), "dist", "index.html")) && !process.env.VITE_DEV_SERVER);

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Resolve dist path reliably whether running from workspace or dist
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : (typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'dist'));

    app.use(express.static(distPath, { dotfiles: 'allow' }));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application build not found. Please run npm run build.');
      }
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`AtoPlay Booster Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
