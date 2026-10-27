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
  addDoc,
  getDocs,
  query,
  limit,
  onSnapshot,
  where
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User, Campaign, FollowLog } from '../types';
import { cleanVideoUrl } from './videoExtractor';
import { resolveCampaignType, getDeletedCampaignIds, addDeletedCampaignId, isRealAtoPlayAvatarUrl } from './api';

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
  try {
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.idToken) {
      sessionStorage.setItem('atoplay_google_id_token', credential.idToken);
    }
  } catch {}
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
    if (result) {
      try {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.idToken) {
          sessionStorage.setItem('atoplay_google_id_token', credential.idToken);
        }
      } catch {}
    }
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
  const cleanEmail = (fbUser.email || '').toLowerCase().trim();
  const isAdmin = cleanEmail === ADMIN_EMAIL || fbUser.uid.includes('krja462');
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  let userRef = doc(db, 'users', fbUser.uid);
  let docSnap: any = null;

  try {
    docSnap = await getDoc(userRef).catch(() => null);

    // If not found by uid, query by email to prevent duplicate accounts when logging out and logging back in
    if (!docSnap || !docSnap.exists()) {
      try {
        const q = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const existingDoc = querySnap.docs[0];
          userRef = existingDoc.ref;
          docSnap = existingDoc;
        }
      } catch {}
    }
    
    // Check if client had higher local coins before refresh
    let localSavedCoins: number | null = null;
    let localAtoPlayUsername: string | null = null;
    let localChannelBanner: string | null = null;
    let localChannelImage: string | null = null;
    let localChannelName: string | null = null;
    try {
      const raw = localStorage.getItem('atoviewer_user');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.id === fbUser.uid) {
          if (typeof p.coins === 'number') localSavedCoins = p.coins;
          if (p.atoPlayUsername) localAtoPlayUsername = p.atoPlayUsername;
          if (p.channelBanner) localChannelBanner = p.channelBanner;
          if (p.channelImage) localChannelImage = p.channelImage;
          if (p.channelName) localChannelName = p.channelName;
        }
      }
    } catch {}

    if (docSnap.exists()) {
      const data = docSnap.data();
      const firestoreCoins = typeof data.coins === 'number' ? data.coins : 100;
      const finalCoins = isAdmin 
        ? ADMIN_UNLIMITED_COINS 
        : Math.max(firestoreCoins, localSavedCoins ?? 100);

      const candidateChannelImage = data.channelImage || localChannelImage || '';
      const hasVerifiedAtoPlaySync = isRealAtoPlayAvatarUrl(candidateChannelImage) && Boolean(data.atoPlayUsername || localAtoPlayUsername || data.channelName || localChannelName);
      const effectiveAtoPlayUsername = hasVerifiedAtoPlaySync ? (data.atoPlayUsername || localAtoPlayUsername || data.channelName || localChannelName || '') : '';
      const effectiveChannelName = hasVerifiedAtoPlaySync ? (data.channelName || localChannelName || effectiveAtoPlayUsername) : '';
      const effectiveChannelImage = hasVerifiedAtoPlaySync ? candidateChannelImage : '';

      const existingUser: User = {
        id: fbUser.uid,
        name: hasVerifiedAtoPlaySync
          ? (effectiveChannelName || effectiveAtoPlayUsername)
          : (fbUser.displayName || data.name || (isAdmin ? 'Admin (KRJA)' : 'AtoPlay Creator')),
        email: fbUser.email || data.email || cleanEmail,
        coins: finalCoins,
        avatar: hasVerifiedAtoPlaySync
          ? effectiveChannelImage
          : (fbUser.photoURL || data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'),
        streak: typeof data.streak === 'number' ? data.streak : 1,
        lastCheckIn: data.lastCheckIn || today,
        createdAt: data.createdAt || now,
        referralCode: data.referralCode || (isAdmin ? 'REF-KRJA' : `REF-${fbUser.uid.slice(-4).toUpperCase()}`),
        referralsCount: typeof data.referralsCount === 'number' ? data.referralsCount : 0,
        referralEarnings: typeof data.referralEarnings === 'number' ? data.referralEarnings : 0,
        referredBy: data.referredBy,
        isAdmin: isAdmin ? true : Boolean(data.isAdmin),
        atoPlayUsername: effectiveAtoPlayUsername,
        channelName: effectiveChannelName,
        channelBanner: hasVerifiedAtoPlaySync ? (data.channelBanner || localChannelBanner || '') : '',
        channelImage: effectiveChannelImage,
        warningCount: typeof data.warningCount === 'number' ? data.warningCount : 0,
        isFollowRestricted: Boolean(data.isFollowRestricted),
        loginMethod: 'google'
      };

      setDoc(userRef, {
        name: existingUser.name,
        avatar: existingUser.avatar,
        coins: finalCoins,
        isAdmin: isAdmin ? true : Boolean(data.isAdmin),
        atoPlayUsername: existingUser.atoPlayUsername,
        channelName: existingUser.channelName,
        channelBanner: existingUser.channelBanner,
        channelImage: existingUser.channelImage,
        warningCount: existingUser.warningCount,
        isFollowRestricted: existingUser.isFollowRestricted,
        loginMethod: 'google'
      }, { merge: true }).catch(() => {});

      return existingUser;
    }
  } catch (readErr) {
    console.warn('Could not read user doc from Firestore, checking fallback:', readErr);
  }

  let localInitialCoins = pendingReferralCode ? 350 : 100;
  let localAtoPlayUsernameFallback = '';
  let localChannelBannerFallback = '';
  let localChannelImageFallback = '';
  let localChannelNameFallback = '';
  try {
    const raw = localStorage.getItem('atoviewer_user');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.id === fbUser.uid) {
        if (typeof p.coins === 'number') localInitialCoins = Math.max(localInitialCoins, p.coins);
        if (isRealAtoPlayAvatarUrl(p.channelImage)) {
          if (p.atoPlayUsername) localAtoPlayUsernameFallback = p.atoPlayUsername;
          if (p.channelBanner) localChannelBannerFallback = p.channelBanner;
          if (p.channelImage) localChannelImageFallback = p.channelImage;
          if (p.channelName) localChannelNameFallback = p.channelName;
        }
      }
    }
  } catch {}

  const newUser: User = {
    id: fbUser.uid,
    name: localChannelNameFallback || fbUser.displayName || (isAdmin ? 'Admin (KRJA)' : (cleanEmail ? cleanEmail.split('@')[0] : 'AtoPlay Creator')),
    email: cleanEmail,
    coins: isAdmin ? ADMIN_UNLIMITED_COINS : localInitialCoins,
    avatar: localChannelImageFallback || fbUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    streak: 1,
    lastCheckIn: today,
    createdAt: now,
    referralCode: isAdmin ? 'REF-KRJA' : `REF-${fbUser.uid.slice(-4).toUpperCase()}`,
    referralsCount: 0,
    referralEarnings: 0,
    referredBy: pendingReferralCode || undefined,
    isAdmin: isAdmin ? true : undefined,
    atoPlayUsername: localAtoPlayUsernameFallback,
    channelName: localChannelNameFallback,
    channelBanner: localChannelBannerFallback,
    channelImage: localChannelImageFallback,
    warningCount: 0,
    isFollowRestricted: false,
    loginMethod: 'google'
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
  if (getDeletedCampaignIds().has(campaign.id) || (campaign as any).status === 'deleted') return;
  try {
    const resolvedType = resolveCampaignType(campaign.campaignType, campaign.videoUrl);
    const campRef = doc(db, 'campaigns', campaign.id);
    await setDoc(campRef, {
      ...campaign,
      userName: resolvedType === 'video' ? '' : (campaign.channelName || ''),
      campaignType: resolvedType,
      videoUrl: cleanVideoUrl(campaign.videoUrl || ''),
      viewsRequired: campaign.viewsRequired ?? campaign.targetViews ?? 10,
      viewsCompleted: campaign.viewsCompleted ?? campaign.completedViews ?? 0,
      rewardPerView: campaign.rewardPerView ?? (resolvedType === 'follower' ? 30 : 60)
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
  if (!campaignId || getDeletedCampaignIds().has(campaignId)) return;
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
  addDeletedCampaignId(campaignId);
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
    const deletedSet = getDeletedCampaignIds();
    const colRef = collection(db, 'campaigns');
    const q = query(colRef, limit(100));
    const snapshot = await getDocs(q);

    const publicCampaigns: Campaign[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      if (!data) return;

      // Clean/purge any legacy starter demo campaigns or deleted campaigns from Firestore
      if (
        docSnap.id === 'camp_starter_1' || 
        docSnap.id === 'camp_starter_2' || 
        String(data.userId || '').startsWith('creator_starter') ||
        deletedSet.has(docSnap.id) ||
        data.status === 'deleted'
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
        // Hide creator's own campaigns from their own Home feed (shown in My Campaigns tab)
        if (data.userId === currentUserId) {
          return;
        }
        // Hide if this user has already watched or followed this campaign
        if (completedUserIds.includes(currentUserId) || (data.followedUserIds && Array.isArray(data.followedUserIds) && data.followedUserIds.includes(currentUserId))) {
          return;
        }
      }

      const resolvedType = resolveCampaignType(data.campaignType, data.videoUrl);

      if (resolvedType === 'video' && data.userName) {
        updateDoc(doc(db, 'campaigns', docSnap.id), { userName: '' }).catch(() => {});
      }

      const camp: Campaign = {
        id: docSnap.id,
        userId: data.userId || 'creator',
        userName: resolvedType === 'video' ? '' : (data.channelName || ''),
        videoUrl: cleanVideoUrl(data.videoUrl || ''),
        title: data.title || (resolvedType === 'follower' ? 'Follow AtoPlay Channel' : 'AtoPlay Video Promotion'),
        thumbnailUrl: data.thumbnailUrl || 'https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp',
        viewsRequired: reqViews,
        viewsCompleted: compViews,
        rewardPerView: Number(data.rewardPerView || (resolvedType === 'follower' ? 30 : 60)),
        targetViews: reqViews,
        completedViews: compViews,
        durationSeconds: Number(data.durationSeconds || 60),
        totalCoinsCost: Number(data.totalCoinsCost || 800),
        status: 'active',
        createdAt: data.createdAt || new Date().toISOString(),
        displayId: data.displayId || '48A1',
        countryFlag: data.countryFlag || '🇮🇳',
        channelName: data.channelName,
        channelId: data.channelId,
        channelFollowers: Math.max(
          typeof data.channelFollowers === 'number' ? data.channelFollowers : 0,
          typeof data.lastCheckedFollowers === 'number' ? data.lastCheckedFollowers : 0,
          (typeof data.initialFollowers === 'number' ? data.initialFollowers : 0) + (Array.isArray(data.followedUserIds) ? data.followedUserIds.length : 0)
        ),
        initialFollowers: typeof data.initialFollowers === 'number' ? data.initialFollowers : (typeof data.channelFollowers === 'number' ? data.channelFollowers : undefined),
        lastCheckedFollowers: data.lastCheckedFollowers,
        campaignType: resolvedType,
        followedUserIds: Array.isArray(data.followedUserIds) ? data.followedUserIds : [],
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
    const deletedSet = getDeletedCampaignIds();
    const colRef = collection(db, 'campaigns');
    const q = query(colRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const myCampaigns: Campaign[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      if (!data) return;

      if (deletedSet.has(docSnap.id) || data.status === 'deleted') {
        deleteDoc(doc(db, 'campaigns', docSnap.id)).catch(() => {});
        return;
      }

      if (data.userId === userId) {
        const resolvedType = resolveCampaignType(data.campaignType, data.videoUrl);
        myCampaigns.push({
          id: docSnap.id,
          userId: data.userId,
          userName: data.userName || 'My Campaign',
          videoUrl: cleanVideoUrl(data.videoUrl || ''),
          title: data.title || (resolvedType === 'follower' ? 'Follow AtoPlay Channel' : 'AtoPlay Video Promotion'),
          thumbnailUrl: data.thumbnailUrl,
          viewsRequired: Number(data.viewsRequired ?? data.targetViews ?? 10),
          viewsCompleted: Number(data.viewsCompleted ?? data.completedViews ?? 0),
          rewardPerView: Number(data.rewardPerView || (resolvedType === 'follower' ? 30 : 60)),
          targetViews: Number(data.targetViews ?? data.viewsRequired ?? 10),
          completedViews: Number(data.completedViews ?? data.viewsCompleted ?? 0),
          durationSeconds: Number(data.durationSeconds || 60),
          totalCoinsCost: Number(data.totalCoinsCost || 800),
          status: data.status || 'active',
          createdAt: data.createdAt || new Date().toISOString(),
          displayId: data.displayId || '48A1',
          countryFlag: data.countryFlag || '🇮🇳',
          channelName: data.channelName,
          channelId: data.channelId,
          channelFollowers: Math.max(
            typeof data.channelFollowers === 'number' ? data.channelFollowers : 0,
            typeof data.lastCheckedFollowers === 'number' ? data.lastCheckedFollowers : 0,
            (typeof data.initialFollowers === 'number' ? data.initialFollowers : 0) + (Array.isArray(data.followedUserIds) ? data.followedUserIds.length : 0)
          ),
          initialFollowers: typeof data.initialFollowers === 'number' ? data.initialFollowers : (typeof data.channelFollowers === 'number' ? data.channelFollowers : undefined),
          lastCheckedFollowers: data.lastCheckedFollowers,
          campaignType: resolvedType,
          followedUserIds: Array.isArray(data.followedUserIds) ? data.followedUserIds : [],
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
 * Update campaign followers progress in Cloud Firestore when followed
 */
export const updateCampaignFollowersInFirestore = async (
  campaignId: string, 
  userId?: string,
  newFollowersCount?: number
): Promise<void> => {
  if (!campaignId || getDeletedCampaignIds().has(campaignId)) return;
  try {
    const campRef = doc(db, 'campaigns', campaignId);
    const snap = await getDoc(campRef).catch(() => null);
    if (!snap || !snap.exists()) return;
    const data = snap.data() as any;
    if (data?.status === 'deleted') return;

    const updates: Record<string, any> = {
      viewsCompleted: increment(1),
      completedViews: increment(1)
    };
    if (userId) {
      updates.followedUserIds = arrayUnion(userId);
      updates.completedUserIds = arrayUnion(userId);
    }
    if (typeof newFollowersCount === 'number' && newFollowersCount >= 0) {
      updates.channelFollowers = newFollowersCount;
      updates.lastCheckedFollowers = newFollowersCount;
    }

    const reqViews = Number(data?.viewsRequired ?? data?.targetViews ?? 10);
    const nextCompViews = Number(data?.viewsCompleted ?? data?.completedViews ?? 0) + 1;
    if (nextCompViews >= reqViews) {
      updates.status = 'completed';
    }
    if (typeof newFollowersCount !== 'number') {
      const currentLive = Number(data?.channelFollowers ?? data?.initialFollowers ?? 0);
      updates.channelFollowers = currentLive + 1;
      updates.lastCheckedFollowers = currentLive + 1;
    }
    await updateDoc(campRef, updates);
  } catch (err) {
    console.warn('Error updating campaign followers in Firestore:', err);
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

let starterPurgedThisSession = false;

/**
 * Clean and remove all demo/starter campaigns from Firestore (once per session)
 */
export const purgeStarterCampaignsFromFirestore = async (): Promise<void> => {
  if (starterPurgedThisSession) return;
  starterPurgedThisSession = true;
  try {
    const starterIds = ["camp_starter_1", "camp_starter_2"];
    for (const id of starterIds) {
      deleteDoc(doc(db, 'campaigns', id)).catch(() => {});
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
export const saveUserAtoPlayUsernameToFirestore = async (userId: string, atoPlayUsername: string, password?: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { 
      atoPlayUsername: atoPlayUsername.trim(), 
      ...(password ? { passwordHash: password } : {}),
      updatedAt: new Date().toISOString() 
    }, { merge: true });
  } catch (err) {
    console.warn('Error saving AtoPlay username in Firestore:', err);
  }
};

/**
 * Save synced AtoPlay profile (username, channelName, channelImage, channelBanner) to Firestore
 * and propagate to any existing follow_logs for this user so other users' follower logs stay synced.
 */
export const saveUserAtoPlayProfileToFirestore = async (
  userId: string,
  profile: {
    atoPlayUsername?: string;
    channelName?: string;
    channelImage?: string;
    channelBanner?: string;
    name?: string;
    avatar?: string;
    email?: string;
  }
): Promise<void> => {
  if (!userId || userId.startsWith('guest_')) return;
  try {
    const cleanUsername = (profile.atoPlayUsername || profile.channelName || '').trim().replace(/^@+/, '');
    const cleanChannelName = (profile.channelName || profile.atoPlayUsername || '').trim();
    const cleanImage = (profile.channelImage || profile.avatar || '').trim();
    const userRef = doc(db, 'users', userId);

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString()
    };
    if (cleanUsername) updates.atoPlayUsername = cleanUsername;
    if (cleanChannelName) {
      updates.channelName = cleanChannelName;
      updates.name = cleanChannelName;
    }
    if (cleanImage) {
      updates.channelImage = cleanImage;
      updates.avatar = cleanImage;
    }
    if (profile.channelBanner) updates.channelBanner = profile.channelBanner;
    if (profile.email) updates.email = profile.email.toLowerCase().trim();

    await setDoc(userRef, updates, { merge: true });

    // Also update any follow_logs where this user is the follower (by followerUserId or followerEmail)
    // so other creators immediately see the synced AtoPlay account name & avatar in their follower logs.
    if (cleanUsername || cleanImage) {
      try {
        const logIdsToUpdate = new Set<string>();
        const logsByUidQ = query(collection(db, 'follow_logs'), where('followerUserId', '==', userId));
        const logsByUidSnap = await getDocs(logsByUidQ);
        logsByUidSnap.forEach(d => logIdsToUpdate.add(d.id));

        const cleanEmail = (profile.email || '').trim().toLowerCase();
        if (cleanEmail) {
          try {
            const logsByEmailQ = query(collection(db, 'follow_logs'), where('followerEmail', '==', cleanEmail));
            const logsByEmailSnap = await getDocs(logsByEmailQ);
            logsByEmailSnap.forEach(d => logIdsToUpdate.add(d.id));
          } catch {}
        }

        const logUpdates: Promise<any>[] = [];
        logIdsToUpdate.forEach(logId => {
          const logPatch: Record<string, any> = {};
          if (cleanUsername) logPatch.followerUsername = cleanUsername;
          if (cleanChannelName) logPatch.followerName = cleanChannelName;
          if (cleanImage) logPatch.followerAvatar = cleanImage;
          logUpdates.push(setDoc(doc(db, 'follow_logs', logId), logPatch, { merge: true }));
        });
        if (logUpdates.length > 0) {
          await Promise.allSettled(logUpdates);
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Error saving AtoPlay profile to Firestore:', err);
  }
};

/**
 * Synchronize AtoPlay Channel / Username credentials with Cloud Firestore /users/{uid}
 */
export const syncAtoPlayUserWithFirestore = async (
  username: string, 
  password?: string, 
  pendingReferralCode?: string
): Promise<User> => {
  const cleanUsername = username.trim().replace(/^@+/, '');
  const usernameKey = cleanUsername.toLowerCase();
  const userId = `ato_${usernameKey.replace(/[^a-z0-9_]/g, '_')}`;
  const isAdmin = usernameKey === 'krja462' || usernameKey.includes('krja462');
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const userRef = doc(db, 'users', userId);
  let finalUser: User;

  try {
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const coins = isAdmin ? ADMIN_UNLIMITED_COINS : (typeof data.coins === 'number' ? data.coins : 100);
      finalUser = {
        id: userId,
        name: data.name || cleanUsername,
        email: data.email || `${usernameKey}@atoplay.user`,
        coins: coins,
        avatar: data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: typeof data.streak === 'number' ? data.streak : 1,
        lastCheckIn: data.lastCheckIn || today,
        createdAt: data.createdAt || now,
        referralCode: data.referralCode || (isAdmin ? 'REF-KRJA' : `REF-${userId.slice(-4).toUpperCase()}`),
        referralsCount: typeof data.referralsCount === 'number' ? data.referralsCount : 0,
        referralEarnings: typeof data.referralEarnings === 'number' ? data.referralEarnings : 0,
        referredBy: data.referredBy,
        isAdmin: isAdmin ? true : undefined,
        atoPlayUsername: cleanUsername,
        loginMethod: 'atoplay'
      };

      await setDoc(userRef, {
        atoPlayUsername: cleanUsername,
        loginMethod: 'atoplay',
        ...(password ? { passwordHash: password } : {}),
        updatedAt: now
      }, { merge: true });
    } else {
      const initialCoins = isAdmin ? ADMIN_UNLIMITED_COINS : (pendingReferralCode ? 350 : 100);
      finalUser = {
        id: userId,
        name: cleanUsername,
        email: `${usernameKey}@atoplay.user`,
        coins: initialCoins,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: 1,
        lastCheckIn: today,
        createdAt: now,
        referralCode: isAdmin ? 'REF-KRJA' : `REF-${userId.slice(-4).toUpperCase()}`,
        referralsCount: 0,
        referralEarnings: 0,
        referredBy: pendingReferralCode || undefined,
        isAdmin: isAdmin ? true : undefined,
        atoPlayUsername: cleanUsername,
        loginMethod: 'atoplay'
      };

      await setDoc(userRef, {
        ...finalUser,
        ...(password ? { passwordHash: password } : {}),
        createdAt: now,
        updatedAt: now
      }, { merge: true });
    }
  } catch (err) {
    console.warn('Firestore AtoPlay user sync error, using local fallback:', err);
    finalUser = {
      id: userId,
      name: cleanUsername,
      email: `${usernameKey}@atoplay.user`,
      coins: isAdmin ? ADMIN_UNLIMITED_COINS : 100,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
      streak: 1,
      lastCheckIn: today,
      createdAt: now,
      referralCode: isAdmin ? 'REF-KRJA' : `REF-${userId.slice(-4).toUpperCase()}`,
      referralsCount: 0,
      referralEarnings: 0,
      isAdmin: isAdmin ? true : undefined,
      atoPlayUsername: cleanUsername,
      loginMethod: 'atoplay'
    };
  }

  return finalUser;
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
 * Enriches each follower log with the follower's latest synced AtoPlay username & profile picture if available.
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
        followerUsername: data.followerUsername || '',
        followerEmail: data.followerEmail || '',
        followerAvatar: data.followerAvatar || '',
        followerName: data.followerName || '',
        timestamp: data.timestamp || new Date().toISOString(),
        status: (data.status as 'active' | 'reported') || 'active',
        campaignTitle: data.campaignTitle,
        reportedAt: data.reportedAt
      });
    });

    // Enrich with follower's latest user document if they have a synced AtoPlay profile
    const uniqueUserIds = Array.from(new Set(logs.map(l => l.followerUserId).filter(Boolean)));
    if (uniqueUserIds.length > 0) {
      const userMap = new Map<string, any>();
      await Promise.allSettled(
        uniqueUserIds.map(async (uid) => {
          try {
            const uSnap = await getDoc(doc(db, 'users', uid));
            if (uSnap.exists()) {
              userMap.set(uid, uSnap.data());
            }
          } catch {}
        })
      );
      logs.forEach(log => {
        const uData = userMap.get(log.followerUserId);
        if (uData) {
          const hasRealAtoPlay = isRealAtoPlayAvatarUrl(uData.channelImage) && Boolean(uData.atoPlayUsername || uData.channelName);
          if (hasRealAtoPlay) {
            const syncedHandle = (uData.atoPlayUsername || uData.channelName || '').trim().replace(/^@+/, '');
            const syncedName = (uData.channelName || uData.atoPlayUsername || uData.name || '').trim();
            log.followerUsername = syncedHandle;
            log.followerName = syncedName || log.followerName;
            log.followerAvatar = uData.channelImage;
          } else {
            if (!log.followerName && uData.name) log.followerName = uData.name;
            if (!log.followerAvatar && uData.avatar) log.followerAvatar = uData.avatar;
          }
        }
      });
    }

    // Sort newest first
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn('Error fetching follow logs from Firestore:', err);
    return [];
  }
};

/**
 * Report fake follow in Firestore:
 * - Marks log as 'reported' (using setDoc merge so it never fails if doc was missing)
 * - Increments warningCount for follower and deducts 30 coins
 * - Saves warning notification across user_notifications, users/{uid}/notifications, and users/{uid}.latestWarningNotification
 */
export const reportFakeFollowInFirestore = async (
  logId: string, 
  followerUserId: string,
  campaignDetails?: {
    channelUrl?: string;
    channelTitle?: string;
    followerEmail?: string;
    followerUsername?: string;
    campaignId?: string;
  }
): Promise<{ warningCount: number; isRestricted: boolean }> => {
  try {
    const nowIso = new Date().toISOString();
    // 1. Mark follow log as reported (safe setDoc with merge)
    if (logId) {
      try {
        const logRef = doc(db, 'follow_logs', logId);
        await setDoc(logRef, {
          status: 'reported',
          reportedAt: nowIso
        }, { merge: true });
      } catch (lErr) {
        console.warn('Could not update follow_log doc:', lErr);
      }
    }

    const channelTitle = campaignDetails?.channelTitle || 'AtoPlay Channel';
    const channelUrl = campaignDetails?.channelUrl || 'https://atoplay.com';
    const cleanFollowerEmail = (campaignDetails?.followerEmail || '').trim().toLowerCase();
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const notifPayload = {
      id: notifId,
      userId: followerUserId,
      userEmail: cleanFollowerEmail || undefined,
      followerUsername: campaignDetails?.followerUsername || undefined,
      campaignId: campaignDetails?.campaignId || undefined,
      type: 'fake_follow_warning',
      title: 'Channel Follow Warning: Action Required',
      message: `The creator of "${channelTitle}" reported that you did not follow or you unsubscribed from their channel after claiming bonus coins.`,
      notice: 'Notice: Please subscribe to the channel properly using the link below. If you do not follow the channel or continue submitting fake follows, your account will be permanently blocked.',
      channelUrl,
      channelTitle,
      timestamp: nowIso,
      read: false
    };

    // 2. Fetch follower doc to check warnings, deduct 30 coins, and attach latestWarningNotification
    let newWarningCount = 1;
    let isRestricted = false;

    if (followerUserId) {
      try {
        const followerRef = doc(db, 'users', followerUserId);
        const followerSnap = await getDoc(followerRef);

        if (followerSnap.exists()) {
          const fData = followerSnap.data();
          const prevWarnings = typeof fData.warningCount === 'number' ? fData.warningCount : 0;
          newWarningCount = prevWarnings + 1;
          isRestricted = newWarningCount >= 3 || Boolean(fData.isFollowRestricted);
          const currentCoins = typeof fData.coins === 'number' ? fData.coins : 0;
          const adjustedCoins = Math.max(0, currentCoins - 30);

          await setDoc(followerRef, {
            warningCount: newWarningCount,
            isFollowRestricted: isRestricted,
            coins: adjustedCoins,
            latestWarningNotification: notifPayload,
            updatedAt: nowIso
          }, { merge: true });
        } else {
          await setDoc(followerRef, {
            id: followerUserId,
            warningCount: 1,
            isFollowRestricted: false,
            latestWarningNotification: notifPayload,
            updatedAt: nowIso
          }, { merge: true });
        }
      } catch (uErr) {
        console.warn('Error updating follower user doc:', uErr);
      }

      // 3. Save in user's own notifications subcollection (/users/{uid}/notifications/{notifId})
      try {
        const userNotifRef = doc(db, 'users', followerUserId, 'notifications', notifId);
        await setDoc(userNotifRef, notifPayload, { merge: true });
      } catch (subErr) {
        console.warn('Failed to save to users/{uid}/notifications:', subErr);
      }
    }

    // 4. Save in top-level /user_notifications/{notifId} collection
    try {
      const topNotifRef = doc(db, 'user_notifications', notifId);
      await setDoc(topNotifRef, notifPayload, { merge: true });
    } catch (nErr) {
      console.warn('Failed to save top-level user_notification document:', nErr);
    }

    return { warningCount: newWarningCount, isRestricted };
  } catch (err) {
    console.warn('Error reporting fake follow in Firestore:', err);
    return { warningCount: 1, isRestricted: false };
  }
};

/**
 * Fetch unread notifications for user from Firestore (checks user doc, subcollection, and top-level collection)
 */
export const fetchUserNotificationsFromFirestore = async (userId: string, userEmail?: string) => {
  if (!userId && !userEmail) return [];
  const resultsMap = new Map<string, any>();

  try {
    // 1. Check user document's latestWarningNotification
    if (userId) {
      try {
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          const latest = uData?.latestWarningNotification;
          if (latest && latest.read === false && latest.id) {
            resultsMap.set(latest.id, latest);
          }
        }
      } catch {}

      // 2. Check /users/{userId}/notifications subcollection
      try {
        const subQ = query(
          collection(db, 'users', userId, 'notifications'),
          where('read', '==', false)
        );
        const subSnap = await getDocs(subQ);
        subSnap.forEach(docSnap => {
          resultsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
      } catch {}

      // 3. Check top-level /user_notifications by userId
      try {
        const q = query(
          collection(db, 'user_notifications'),
          where('userId', '==', userId),
          where('read', '==', false)
        );
        const snap = await getDocs(q);
        snap.forEach(docSnap => {
          resultsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
      } catch {}
    }

    // 4. Also check top-level /user_notifications by userEmail if provided
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      try {
        const emailQ = query(
          collection(db, 'user_notifications'),
          where('userEmail', '==', cleanEmail),
          where('read', '==', false)
        );
        const emailSnap = await getDocs(emailQ);
        emailSnap.forEach(docSnap => {
          resultsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
      } catch {}
    }

    const list = Array.from(resultsMap.values());
    list.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    return list;
  } catch (err) {
    console.warn('Error fetching user notifications from Firestore:', err);
    return Array.from(resultsMap.values());
  }
};

/**
 * Subscribe in real-time to unread warning notifications for the active user
 */
export const subscribeToUserNotificationsInFirestore = (
  userId: string,
  onNotification: (notif: any) => void
): (() => void) => {
  if (!userId) return () => {};
  const unsubs: Array<() => void> = [];

  // 1. Real-time listener on /users/{userId} for latestWarningNotification
  try {
    const unsubUser = onSnapshot(
      doc(db, 'users', userId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const latest = data?.latestWarningNotification;
          if (latest && latest.read === false) {
            onNotification(latest);
          }
        }
      },
      () => {}
    );
    unsubs.push(unsubUser);
  } catch {}

  // 2. Real-time listener on /users/{userId}/notifications subcollection
  try {
    const subQ = query(
      collection(db, 'users', userId, 'notifications'),
      where('read', '==', false)
    );
    const unsubSub = onSnapshot(
      subQ,
      (snap) => {
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.read === false) {
            onNotification({ id: docSnap.id, ...data });
          }
        });
      },
      () => {}
    );
    unsubs.push(unsubSub);
  } catch {}

  // 3. Real-time listener on top-level /user_notifications
  try {
    const topQ = query(
      collection(db, 'user_notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const unsubTop = onSnapshot(
      topQ,
      (snap) => {
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.read === false) {
            onNotification({ id: docSnap.id, ...data });
          }
        });
      },
      () => {}
    );
    unsubs.push(unsubTop);
  } catch {}

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
};

/**
 * Mark notification as read in Firestore across all locations
 */
export const markNotificationReadInFirestore = async (notifId: string, userId?: string) => {
  if (!notifId) return;
  const nowIso = new Date().toISOString();

  // 1. Top-level /user_notifications/{notifId}
  try {
    const nRef = doc(db, 'user_notifications', notifId);
    await setDoc(nRef, { read: true, acknowledgedAt: nowIso }, { merge: true });
  } catch {}

  // 2. User subcollection & latestWarningNotification field
  if (userId) {
    try {
      const subRef = doc(db, 'users', userId, 'notifications', notifId);
      await setDoc(subRef, { read: true, acknowledgedAt: nowIso }, { merge: true });
    } catch {}

    try {
      const uRef = doc(db, 'users', userId);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        const latest = uSnap.data()?.latestWarningNotification;
        if (latest && latest.id === notifId) {
          await setDoc(uRef, {
            latestWarningNotification: { ...latest, read: true, acknowledgedAt: nowIso }
          }, { merge: true });
        }
      }
    } catch {}
  }
};

export { onAuthStateChanged };
export type { FirebaseUser };
