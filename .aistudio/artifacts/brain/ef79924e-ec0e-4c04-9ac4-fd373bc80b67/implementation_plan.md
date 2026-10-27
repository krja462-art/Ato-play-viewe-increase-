# Remove Entire AtoPlay Profile Sync System & Restore Original Google Login

## Overview
Completely remove the AtoPlay username and profile picture login/auto-sync system across the entire app (Login Screen, Slide Bar, Follower Logs, Watch Feed, Frontend API, Firebase Auth, and Backend Server) and restore the clean original **"Continue with Google"** system.

## Key Changes

### 1. Login Screen (`src/components/SplashScreen.tsx`)
- Remove the AtoPlay Email & Password sync button/form and remove the `(login your AtoPlay gmail account)` subtitle from the Google button.
- Restore the clean original **"Continue with Google"** button, **"Open App & Creator Toolkit (Instant Access)"** button, and standard WebView fallback login.

### 2. Slide Bar (`src/components/SlideDrawer.tsx`)
- Remove all AtoPlay profile sync UI from the Slide Bar:
  - Remove the AtoPlay Email & Password sync form.
  - Remove the `@username or channel link` manual sync input and Sync button.
  - Remove the **"AtoPlay Account Synced"** badge, `@handle` display, and refresh sync button.
- Restore the clean original **Google Account Verified** profile card showing the user's Google Name, Gmail address, Google Avatar, and Total Coins.

### 3. Auth, Profile & Follower Logs (`src/App.tsx`, `src/lib/api.ts`, `src/lib/firebase.ts`, `src/components/HomeWatchFeed.tsx`, `src/components/FollowChannelModal.tsx`)
- Remove all automatic and manual AtoPlay profile syncing (`syncAtoPlayAccountProfile`, `syncAtoPlayAccountByGmail`, `loginAndFetchAtoPlayProfile`, `atoplayUsername`, `atoplayAvatar`, `atoplaySynced`).
- Restore standard Google Sign-In (`syncFirebaseUserWithFirestore`) using the user's Google `displayName`, `email`, and `photoURL`.
- Restore Follower Logs (`FollowChannelModal.tsx`) and Home Watch Feed (`HomeWatchFeed.tsx`) to use the user's standard Google username and profile picture.

### 4. Backend Server (`server.ts`)
- Remove AtoPlay profile discovery/login sync endpoints (`/api/atoplay/sync-profile`) and remove AtoPlay profile scraping from `/api/auth/firebase-login` and `/api/auth/google`, returning to standard Google user authentication.
