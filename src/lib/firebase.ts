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
  doc, 
  getDoc, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User } from '../types';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore with auto-detecting long-polling for proxy/iframe compatibility
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
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
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

/**
 * Real Google Account Sign-In via Firebase Redirect (for mobile browsers or strict popup blockers)
 */
export const signInWithGoogleRedirect = async (): Promise<void> => {
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

/**
 * Synchronize Google Firebase User profile with Cloud Firestore `/users/{uid}`
 * Loads saved coins and state if existing user, or awards 300 Welcome Bonus Coins if new user.
 */
export const syncFirebaseUserWithFirestore = async (fbUser: FirebaseUser): Promise<User> => {
  const userRef = doc(db, 'users', fbUser.uid);
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  try {
    const docSnap = await getDoc(userRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const existingUser: User = {
        id: fbUser.uid,
        name: data.name || fbUser.displayName || 'AtoPlay Creator',
        email: fbUser.email || data.email || '',
        coins: typeof data.coins === 'number' ? data.coins : 300,
        avatar: fbUser.photoURL || data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        streak: typeof data.streak === 'number' ? data.streak : 1,
        lastCheckIn: data.lastCheckIn || today,
        createdAt: data.createdAt || now,
        referralCode: data.referralCode || `REF-${fbUser.uid.slice(-4).toUpperCase()}`,
        referralsCount: typeof data.referralsCount === 'number' ? data.referralsCount : 0,
        referralEarnings: typeof data.referralEarnings === 'number' ? data.referralEarnings : 0,
        referredBy: data.referredBy
      };

      // Keep avatar and name updated
      if (fbUser.displayName || fbUser.photoURL) {
        updateDoc(userRef, {
          name: fbUser.displayName || existingUser.name,
          avatar: fbUser.photoURL || existingUser.avatar
        }).catch(() => {});
      }

      return existingUser;
    }
  } catch (readErr) {
    console.warn('Could not read user doc from Firestore, checking fallback:', readErr);
  }

  // Create new user profile with 300 Bonus Coins
  const newUser: User = {
    id: fbUser.uid,
    name: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'AtoPlay Creator'),
    email: fbUser.email || '',
    coins: 300, // 300 Free Welcome Bonus Coins
    avatar: fbUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    streak: 1,
    lastCheckIn: today,
    createdAt: now,
    referralCode: `REF-${fbUser.uid.slice(-4).toUpperCase()}`,
    referralsCount: 0,
    referralEarnings: 0
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
export const saveUserCoinsToFirestore = async (userId: string, newCoins: number): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { coins: newCoins });
  } catch (err) {
    console.warn('Error updating coins in Firestore:', err);
  }
};

export { onAuthStateChanged };
export type { FirebaseUser };
