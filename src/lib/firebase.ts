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
  arrayUnion
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

export { onAuthStateChanged };
export type { FirebaseUser };
