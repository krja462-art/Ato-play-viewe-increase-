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
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User, Campaign } from '../types';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Suppress benign connection retry / offline warnings in sandbox environment
setLogLevel('error');

// Initialize Firestore with forced HTTP long-polling to prevent WebSocket timeouts in iframe/proxy environments
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
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
export const syncFirebaseUserWithFirestore = async (fbUser: FirebaseUser): Promise<User> => {
  const userRef = doc(db, 'users', fbUser.uid);
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const cleanEmail = (fbUser.email || '').toLowerCase().trim();
  const isAdmin = cleanEmail === ADMIN_EMAIL || fbUser.uid.includes('krja462');

  try {
    const docSnap = await getDoc(userRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const existingUser: User = {
        id: fbUser.uid,
        name: data.name || fbUser.displayName || (isAdmin ? 'Admin (KRJA)' : 'AtoPlay Creator'),
        email: fbUser.email || data.email || cleanEmail,
        coins: isAdmin ? ADMIN_UNLIMITED_COINS : (typeof data.coins === 'number' ? data.coins : 100),
        avatar: fbUser.photoURL || data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: typeof data.streak === 'number' ? data.streak : 1,
        lastCheckIn: data.lastCheckIn || today,
        createdAt: data.createdAt || now,
        referralCode: data.referralCode || (isAdmin ? 'REF-KRJA' : `REF-${fbUser.uid.slice(-4).toUpperCase()}`),
        referralsCount: typeof data.referralsCount === 'number' ? data.referralsCount : 0,
        referralEarnings: typeof data.referralEarnings === 'number' ? data.referralEarnings : 0,
        referredBy: data.referredBy,
        isAdmin: isAdmin ? true : Boolean(data.isAdmin)
      };

      // Keep avatar, name, and admin unlimited coins updated in Firestore
      updateDoc(userRef, {
        name: existingUser.name,
        avatar: existingUser.avatar,
        coins: isAdmin ? ADMIN_UNLIMITED_COINS : existingUser.coins,
        isAdmin: isAdmin ? true : Boolean(data.isAdmin)
      }).catch(() => {});

      return existingUser;
    }
  } catch (readErr) {
    console.warn('Could not read user doc from Firestore, checking fallback:', readErr);
  }

  // Create new user profile with unlimited coins if admin or 100 Welcome Bonus Coins
  const newUser: User = {
    id: fbUser.uid,
    name: fbUser.displayName || (isAdmin ? 'Admin (KRJA)' : (cleanEmail ? cleanEmail.split('@')[0] : 'AtoPlay Creator')),
    email: cleanEmail,
    coins: isAdmin ? ADMIN_UNLIMITED_COINS : 100, // Unlimited coins for Admin, 100 Welcome Bonus Coins for new user
    avatar: fbUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    streak: 1,
    lastCheckIn: today,
    createdAt: now,
    referralCode: isAdmin ? 'REF-KRJA' : `REF-${fbUser.uid.slice(-4).toUpperCase()}`,
    referralsCount: 0,
    referralEarnings: 0,
    isAdmin: isAdmin ? true : undefined
  };

  try {
    await setDoc(userRef, newUser);
  } catch (writeErr) {
    console.warn('Could not persist new user doc to Firestore:', writeErr);
  }

  return newUser;
};

/**
 * Update user coins in Cloud Firestore
 */
export const saveUserCoinsToFirestore = async (userId: string, newCoins: number, email?: string): Promise<void> => {
  if (!userId || userId.startsWith('guest_')) return;
  const isAdmin = email?.toLowerCase().trim() === ADMIN_EMAIL || userId.includes('krja462');
  const coinsToPersist = isAdmin ? ADMIN_UNLIMITED_COINS : newCoins;

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { 
      coins: coinsToPersist,
      ...(isAdmin ? { isAdmin: true } : {})
    });
  } catch (err) {
    console.warn('Error updating coins in Firestore:', err);
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
        videoUrl: data.videoUrl || '',
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
          videoUrl: data.videoUrl,
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

export { onAuthStateChanged };
export type { FirebaseUser };
