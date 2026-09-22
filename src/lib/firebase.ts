import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  setLogLevel,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  collection,
  getDocs,
  query,
  limit,
  onSnapshot,
  where
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User, Campaign, FollowLog } from '../types';
import { cleanVideoUrl } from './videoExtractor';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Suppress benign connection retry / offline warnings in sandbox environment
setLogLevel('silent');

// Initialize Firestore with auto-detect long-polling to prevent WebSocket timeouts in iframe/proxy environments
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  },
  firebaseConfig.firestoreDatabaseId || undefined
);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Real Google Account Sign-In via Firebase Popup
 */
export const signInWithGoogle = async (): Promise<FirebaseUser> => {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

/**
 * Real Google Account Sign-In via Firebase Redirect (for mobile browsers or strict popup blockers)
 */
export const signInWithGoogleRedirect = async (): Promise<void> => {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(auth, googleProvider);
};

/**
 * Check redirect sign-in result on page mount
 */
export const checkRedirectResult = async (): Promise<FirebaseUser | null> => {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    console.warn('Firebase getRedirectResult:', err);
    return null;
  }
};

/**
 * Sign out from Firebase Auth
 */
export const logOut = async (): Promise<void> => {
  await signOut(auth);
};

export const ADMIN_EMAIL = 'krja462@gmail.com';
export const ADMIN_UNLIMITED_COINS = 999999999;

/**
 * Synchronize Google Firebase User profile with Cloud Firestore `/users/{uid}`
 * Loads saved coins and state if existing user, or awards 100 Welcome Bonus Coins if new user.
 * Grants Unlimited Coins (999,999,999) to Admin Account (krja462@gmail.com).
 */
export const syncFirebaseUserWithFirestore = async (fbUser: FirebaseUser, pendingReferralCode?: string): Promise<User> => {
  const userRef = doc(db, 'users', fbUser.uid);
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const cleanEmail = (fbUser.email || '').toLowerCase().trim();
  const isAdmin = cleanEmail === ADMIN_EMAIL || fbUser.uid.includes('krja462');

  try {
    const docSnap = await getDoc(userRef);
    
    // Check if client had higher local coins before refresh
    let localSavedCoins: number | null = null;
    let localAtoPlayUsername: string | null = null;
    try {
      const raw = localStorage.getItem('atoviewer_user');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.id === fbUser.uid) {
          if (typeof p.coins === 'number') localSavedCoins = p.coins;
          if (p.atoPlayUsername) localAtoPlayUsername = p.atoPlayUsername;
        }
      }
    } catch {}

    if (docSnap.exists()) {
      const data = docSnap.data();
      const firestoreCoins = typeof data.coins === 'number' ? data.coins : 100;
      const finalCoins = isAdmin 
        ? ADMIN_UNLIMITED_COINS 
        : Math.max(firestoreCoins, localSavedCoins ?? 100);

      const existingUser: User = {
        id: fbUser.uid,
        name: data.name || fbUser.displayName || (isAdmin ? 'Admin (KRJA)' : 'AtoPlay Creator'),
        email: fbUser.email || data.email || cleanEmail,
        coins: finalCoins,
        avatar: fbUser.photoURL || data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: typeof data.streak === 'number' ? data.streak : 1,
        lastCheckIn: data.lastCheckIn || today,
        createdAt: data.createdAt || now,
        referralCode: data.referralCode || (isAdmin ? 'REF-KRJA' : `REF-${fbUser.uid.slice(-4).toUpperCase()}`),
        referralsCount: typeof data.referralsCount === 'number' ? data.referralsCount : 0,
        referralEarnings: typeof data.referralEarnings === 'number' ? data.referralEarnings : 0,
        referredBy: data.referredBy,
        isAdmin: isAdmin ? true : Boolean(data.isAdmin),
        atoPlayUsername: data.atoPlayUsername || localAtoPlayUsername || '',
        warningCount: typeof data.warningCount === 'number' ? data.warningCount : 0,
        isFollowRestricted: Boolean(data.isFollowRestricted)
      };

      setDoc(userRef, {
        name: existingUser.name,
        avatar: existingUser.avatar,
        coins: finalCoins,
        isAdmin: isAdmin ? true : Boolean(data.isAdmin),
        atoPlayUsername: existingUser.atoPlayUsername,
        warningCount: existingUser.warningCount,
        isFollowRestricted: existingUser.isFollowRestricted
      }, { merge: true }).catch(() => {});

      return existingUser;
    }
  } catch (readErr) {
    console.warn('Could not read user doc from Firestore, checking fallback:', readErr);
  }

  let localInitialCoins = pendingReferralCode ? 350 : 100;
  let localAtoPlayUsernameFallback = '';
  try {
    const raw = localStorage.getItem('atoviewer_user');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.id === fbUser.uid) {
        if (typeof p.coins === 'number') localInitialCoins = Math.max(localInitialCoins, p.coins);
        if (p.atoPlayUsername) localAtoPlayUsernameFallback = p.atoPlayUsername;
      }
    }
  } catch {}

  const newUser: User = {
    id: fbUser.uid,
    name: fbUser.displayName || (isAdmin ? 'Admin (KRJA)' : (cleanEmail ? cleanEmail.split('@')[0] : 'AtoPlay Creator')),
    email: cleanEmail,
    coins: isAdmin ? ADMIN_UNLIMITED_COINS : localInitialCoins,
    avatar: fbUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    streak: 1,
    lastCheckIn: today,
    createdAt: now,
    referralCode: isAdmin ? 'REF-KRJA' : `REF-${fbUser.uid.slice(-4).toUpperCase()}`,
    referralsCount: 0,
    referralEarnings: 0,
    referredBy: pendingReferralCode || undefined,
    isAdmin: isAdmin ? true : undefined,
    atoPlayUsername: localAtoPlayUsernameFallback,
    warningCount: 0,
    isFollowRestricted: false
  };

  try {
    await setDoc(userRef, newUser, { merge: true });
  } catch (writeErr) {
    console.warn('Could not persist new user doc to Firestore:', writeErr);
  }

  return newUser;
};

/**
 * Update user coins in Cloud Firestore (persists safely across refresh and devices)
 */
export const saveUserCoinsToFirestore = async (userId: string, newCoins: number, email?: string): Promise<void> => {
  if (!userId || userId.startsWith('guest_')) return;
  const isAdmin = email?.toLowerCase().trim() === ADMIN_EMAIL || userId.includes('krja462');
  const coinsToPersist = isAdmin ? ADMIN_UNLIMITED_COINS : newCoins;

  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { 
      coins: coinsToPersist,
      updatedAt: new Date().toISOString(),
      ...(isAdmin ? { isAdmin: true } : {})
    }, { merge: true });
  } catch (err) {
    console.warn('Error updating coins in Firestore:', err);
  }
};

/**
 * Fetch latest user coin balance from Cloud Firestore
 */
export const getUserCoinsFromFirestore = async (userId: string): Promise<number | null> => {
  if (!userId || userId.startsWith('guest_')) return null;
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.coins === 'number') {
        return data.coins;
      }
    }
  } catch (err) {
    console.warn('Error fetching user coins from Firestore:', err);
  }
  return null;
};

/**
 * Real-time listener for user wallet balance in Firestore
 */
export const subscribeToUserCoins = (userId: string, onUpdate: (coins: number) => void): (() => void) => {
  if (!userId || userId.startsWith('guest_')) return () => {};
  try {
    const userRef = doc(db, 'users', userId);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.coins === 'number') {
          onUpdate(data.coins);
        }
      }
    }, (err) => {
      console.warn('subscribeToUserCoins note:', err);
    });
  } catch {
    return () => {};
  }
};

/**
 * Save or sync a created campaign to Cloud Firestore
 */
export const saveCampaignToFirestore = async (campaign: Campaign): Promise<void> => {
  if (!campaign || !campaign.id) return;
  try {
    const campRef = doc(db, 'campaigns', campaign.id);
    await setDoc(campRef, {
      ...campaign,
      videoUrl: cleanVideoUrl(campaign.videoUrl || ''),
      viewsRequired: campaign.viewsRequired ?? campaign.targetViews ?? 10,
      viewsCompleted: campaign.viewsCompleted ?? campaign.completedViews ?? 0,
      rewardPerView: campaign.rewardPerView ?? 60
    });
  } catch (err) {
    console.warn('Error saving campaign to Firestore:', err);
  }
};

/**
 * Update completed views for a campaign in Cloud Firestore and save user UID to completed list
 */
export const updateCampaignViewsInFirestore = async (
  campaignId: string, 
  userId?: string,
  newViewsCompleted?: number, 
  isCompleted?: boolean
): Promise<void> => {
  if (!campaignId) return;
  try {
    const campRef = doc(db, 'campaigns', campaignId);
    const updates: Record<string, any> = {};

    if (typeof newViewsCompleted === 'number') {
      updates.viewsCompleted = newViewsCompleted;
      updates.completedViews = newViewsCompleted;
      updates.status = isCompleted ? 'completed' : 'active';
    } else {
      updates.viewsCompleted = increment(1);
      updates.completedViews = increment(1);
    }

    if (userId) {
      updates.completedUserIds = arrayUnion(userId);
    }

    await updateDoc(campRef, updates);
  } catch (err) {
    console.warn('Error updating campaign views in Firestore:', err);
  }
};

/**
 * Delete or refund campaign in Cloud Firestore
 */
export const deleteCampaignInFirestore = async (campaignId: string): Promise<void> => {
  if (!campaignId) return;
  try {
    const campRef = doc(db, 'campaigns', campaignId);
    await deleteDoc(campRef);
  } catch (err) {
    console.warn('Error deleting campaign from Firestore:', err);
  }
};

/**
 * Fetch all public active campaigns from Cloud Firestore.
 * Strictly respects user requirements:
 * 1. Shows other users' campaigns to every user ("har user home page dusre user ke campaign dikhe")
 * 2. If a user completes 60s watch, it is removed from that specific user's page ("ek bar jo user 60 s dekh le us user ke page se hat")
 * 3. Continues showing to all other users until target views completed ("baki all user ke page per dikhe")
 */
export const getPublicCampaignsFromFirestore = async (currentUserId?: string): Promise<Campaign[]> => {
  try {
    const colRef = collection(db, 'campaigns');
    const q = query(colRef, limit(100));
    const snapshot = await getDocs(q);

    const publicCampaigns: Campaign[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      if (!data) return;

      // Clean/purge any legacy starter demo campaigns from Firestore
      if (
        docSnap.id === 'camp_starter_1' || 
        docSnap.id === 'camp_starter_2' || 
        String(data.userId || '').startsWith('creator_starter')
      ) {
        deleteDoc(doc(db, 'campaigns', docSnap.id)).catch(() => {});
        return;
      }

      const reqViews = Number(data.viewsRequired ?? data.targetViews ?? 10);
      const compViews = Number(data.viewsCompleted ?? data.completedViews ?? 0);
      const status = data.status || 'active';
      const completedUserIds: string[] = Array.isArray(data.completedUserIds) ? data.completedUserIds : [];

      // Filter: only active campaigns with remaining views
      if (status !== 'active' || compViews >= reqViews) {
        return;
      }

      // If user is authenticated:
      if (currentUserId) {
        // Creator's own campaign is managed in "Campaigns" tab, not in earn feed
        if (data.userId === currentUserId) {
          return;
        }
        // If this user already completed 60s watch, hide from this user's page
        if (completedUserIds.includes(currentUserId)) {
          return;
        }
      }

      const camp: Campaign = {
        id: docSnap.id,
        userId: data.userId || 'creator',
        userName: data.userName || 'AtoPlay Creator',
        videoUrl: cleanVideoUrl(data.videoUrl || ''),
        title: data.title || 'AtoPlay Video Promotion',
        thumbnailUrl: data.thumbnailUrl || 'https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp',
        viewsRequired: reqViews,
        viewsCompleted: compViews,
        rewardPerView: Number(data.rewardPerView || 60),
        targetViews: reqViews,
        completedViews: compViews,
        durationSeconds: Number(data.durationSeconds || 60),
        totalCoinsCost: Number(data.totalCoinsCost || 800),
        status: 'active',
        createdAt: data.createdAt || new Date().toISOString(),
        displayId: data.displayId || '48A1',
        countryFlag: data.countryFlag || '🇮🇳',
        channelName: data.channelName,
        durationText: data.durationText || '1:00',
        completedUserIds
      };

      publicCampaigns.push(camp);
    });

    // Sort newest first
    publicCampaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return publicCampaigns;
  } catch (err) {
    console.warn('Could not fetch public campaigns from Firestore:', err);
    return [];
  }
};

/**
 * Fetch all campaigns created by a specific user from Cloud Firestore
 */
export const getMyCampaignsFromFirestore = async (userId: string): Promise<Campaign[]> => {
  if (!userId) return [];
  try {
    const colRef = collection(db, 'campaigns');
    const snapshot = await getDocs(colRef);
    const myCampaigns: Campaign[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      if (data && data.userId === userId) {
        myCampaigns.push({
          id: docSnap.id,
          userId: data.userId,
          userName: data.userName || 'My Campaign',
          videoUrl: cleanVideoUrl(data.videoUrl || ''),
          title: data.title || 'AtoPlay Video Promotion',
          thumbnailUrl: data.thumbnailUrl,
          viewsRequired: Number(data.viewsRequired ?? data.targetViews ?? 10),
          viewsCompleted: Number(data.viewsCompleted ?? data.completedViews ?? 0),
          rewardPerView: Number(data.rewardPerView || 60),
          targetViews: Number(data.targetViews ?? data.viewsRequired ?? 10),
          completedViews: Number(data.completedViews ?? data.viewsCompleted ?? 0),
          durationSeconds: Number(data.durationSeconds || 60),
          totalCoinsCost: Number(data.totalCoinsCost || 800),
          status: data.status || 'active',
          createdAt: data.createdAt || new Date().toISOString(),
          displayId: data.displayId || '48A1',
          countryFlag: data.countryFlag || '🇮🇳',
          channelName: data.channelName,
          durationText: data.durationText || '1:00',
          completedUserIds: Array.isArray(data.completedUserIds) ? data.completedUserIds : []
        });
      }
    });

    myCampaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return myCampaigns;
  } catch (err) {
    console.warn('Could not fetch my campaigns from Firestore:', err);
    return [];
  }
};

/**
 * Completely remove and delete ALL campaigns from Cloud Firestore
 */
export const clearAllCampaignsFromFirestore = async (): Promise<void> => {
  try {
    const colRef = collection(db, 'campaigns');
    const snapshot = await getDocs(colRef);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'campaigns', d.id)));
    await Promise.all(deletePromises);
    console.log(`Cleared ${snapshot.docs.length} campaigns from Cloud Firestore.`);
  } catch (err) {
    console.warn('Could not clear all campaigns from Firestore:', err);
  }
};

/**
 * Clean and remove all demo/starter campaigns from Firestore
 */
export const purgeStarterCampaignsFromFirestore = async (): Promise<void> => {
  try {
    const starterIds = ["camp_starter_1", "camp_starter_2"];
    for (const id of starterIds) {
      const campRef = doc(db, 'campaigns', id);
      const snap = await getDoc(campRef);
      if (snap.exists()) {
        await deleteDoc(campRef);
      }
    }
  } catch (err) {
    console.warn('Could not clean starter campaigns from Firestore:', err);
  }
};

// Keep backward-compatible alias so existing callers purge starters instead of creating them
export const seedStarterCampaignsToFirestore = purgeStarterCampaignsFromFirestore;

/**
 * Save user support message to Cloud Firestore destined for krja462@gmail.com
 */
export const saveSupportMessageToFirestore = async (messageData: {
  userId: string;
  userName: string;
  userEmail: string;
  targetEmail?: string;
  subject: string;
  message: string;
}): Promise<string> => {
  try {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'support_messages', messageId);
    await setDoc(docRef, {
      id: messageId,
      userId: messageData.userId || 'anonymous',
      userName: messageData.userName || 'AtoPlay User',
      userEmail: messageData.userEmail || '',
      targetEmail: 'krja462@gmail.com',
      subject: messageData.subject || 'Support Request',
      message: messageData.message || '',
      createdAt: new Date().toISOString(),
      status: 'new'
    });
    return messageId;
  } catch (err) {
    console.warn('Could not save support message to Firestore:', err);
    return '';
  }
};

/**
 * Get all registered users from Cloud Firestore
 */
export const getAllFirestoreUsers = async (): Promise<User[]> => {
  try {
    const q = query(collection(db, 'users'));
    const snapshot = await getDocs(q);
    const list: User[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        name: data.name || 'Creator',
        email: data.email || '',
        coins: typeof data.coins === 'number' ? data.coins : 100,
        avatar: data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: data.streak || 1,
        createdAt: data.createdAt || new Date().toISOString(),
        referralCode: data.referralCode || '',
        referralsCount: data.referralsCount || 0,
        referralEarnings: data.referralEarnings || 0,
        referredBy: data.referredBy,
        isAdmin: data.isAdmin
      });
    });
    return list;
  } catch (err) {
    console.warn('Error fetching users from Firestore:', err);
    return [];
  }
};

/**
 * Update user coins in Cloud Firestore
 */
export const updateFirestoreUserCoins = async (userId: string, newCoins: number): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { coins: newCoins, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('Error updating user coins in Firestore:', err);
  }
};

/**
 * Permanently delete user from Cloud Firestore
 */
export const deleteFirestoreUser = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  } catch (err) {
    console.warn('Error deleting user from Firestore:', err);
  }
};

/**
 * Block user in Cloud Firestore
 */
export const blockFirestoreUser = async (userId: string, isBlocked: boolean): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { isBlocked, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('Error blocking user in Firestore:', err);
  }
};

/**
 * Save AtoPlay Channel Name / Username to User Profile in Firestore
 */
export const saveUserAtoPlayUsernameToFirestore = async (userId: string, atoPlayUsername: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { 
      atoPlayUsername: atoPlayUsername.trim(), 
      updatedAt: new Date().toISOString() 
    }, { merge: true });
  } catch (err) {
    console.warn('Error saving AtoPlay username in Firestore:', err);
  }
};

/**
 * Save Follow Log to Firestore /follow_logs/{logId}
 */
export const saveFollowLogToFirestore = async (log: FollowLog): Promise<void> => {
  try {
    const logRef = doc(db, 'follow_logs', log.id);
    await setDoc(logRef, log, { merge: true });
  } catch (err) {
    console.warn('Error saving follow log to Firestore:', err);
  }
};

/**
 * Fetch all Follow Logs for a specific Campaign from Firestore
 */
export const getFollowLogsFromFirestore = async (campaignId: string): Promise<FollowLog[]> => {
  try {
    const logsRef = collection(db, 'follow_logs');
    const q = query(logsRef, where('campaignId', '==', campaignId));
    const snapshot = await getDocs(q);
    const logs: FollowLog[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        campaignId: data.campaignId,
        creatorId: data.creatorId,
        followerUserId: data.followerUserId,
        followerUsername: data.followerUsername || 'Unknown',
        timestamp: data.timestamp || new Date().toISOString(),
        status: (data.status as 'active' | 'reported') || 'active',
        campaignTitle: data.campaignTitle,
        reportedAt: data.reportedAt
      });
    });
    // Sort newest first
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn('Error fetching follow logs from Firestore:', err);
    return [];
  }
};

/**
 * Report fake follow in Firestore:
 * - Marks log as 'reported'
 * - Increments warningCount for follower
 * - If warningCount >= 3, sets isFollowRestricted = true and deducts 30 coins (minimum 0)
 */
export const reportFakeFollowInFirestore = async (
  logId: string, 
  followerUserId: string
): Promise<{ warningCount: number; isRestricted: boolean }> => {
  try {
    // 1. Mark follow log as reported
    const logRef = doc(db, 'follow_logs', logId);
    await updateDoc(logRef, {
      status: 'reported',
      reportedAt: new Date().toISOString()
    });

    // 2. Fetch follower doc to check warnings and update
    const followerRef = doc(db, 'users', followerUserId);
    const followerSnap = await getDoc(followerRef);
    let newWarningCount = 1;
    let isRestricted = false;
    let currentCoins = 0;

    if (followerSnap.exists()) {
      const fData = followerSnap.data();
      const prevWarnings = typeof fData.warningCount === 'number' ? fData.warningCount : 0;
      newWarningCount = prevWarnings + 1;
      isRestricted = newWarningCount >= 3 || Boolean(fData.isFollowRestricted);
      currentCoins = typeof fData.coins === 'number' ? fData.coins : 0;

      // Deduct 30 coins for fake claim (clamped to 0)
      const adjustedCoins = Math.max(0, currentCoins - 30);

      await updateDoc(followerRef, {
        warningCount: newWarningCount,
        isFollowRestricted: isRestricted,
        coins: adjustedCoins,
        updatedAt: new Date().toISOString()
      });
    } else {
      await setDoc(followerRef, {
        warningCount: 1,
        isFollowRestricted: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    return { warningCount: newWarningCount, isRestricted };
  } catch (err) {
    console.warn('Error reporting fake follow in Firestore:', err);
    return { warningCount: 1, isRestricted: false };
  }
};

export { onAuthStateChanged };
export type { FirebaseUser };
