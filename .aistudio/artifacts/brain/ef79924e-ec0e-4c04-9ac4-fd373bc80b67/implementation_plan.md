# Real AtoPlay Dashboard Account Sync Implementation Plan

## 1. Overview & Root Cause Analysis
Currently, when attempting to sync an AtoPlay account on `increase.vercel.app`, the app shows `"Action completed"` and keeps displaying the Google account avatar instead of the real AtoPlay Dashboard avatar and username (`khan rja`).
- **Root Cause 1**: On static/serverless frontend deployments (`increase.vercel.app`), `/api/atoplay/sync-profile` falls back to `handleClientFallback` in `src/lib/api.ts`, which lacked a dedicated handler and returned the generic `{ success: true, message: 'Action completed' }` response.
- **Root Cause 2**: The user's real AtoPlay Dashboard Account Name (`fname`: `"khan rja"`) and Account Avatar (`profileImage`) live on AtoPlay's authenticated profile endpoint (`GET https://api.atoplay.com/api/users/me`), which requires an AtoPlay `accessToken` obtained via AtoPlay login (`POST https://api.atoplay.com/api/auth/login`).

## 2. Core Features & User Flow
- **AtoPlay Email & Password Sync (SlideDrawer & Login Flow)**:
  - Provide a clean, direct **Sync with AtoPlay Email & Password** form inside the `SlideDrawer` (pre-filled with the signed-in user's Gmail address, e.g., `krja462@gmail.com`) and an optional quick-sync step on login.
  - Authenticate directly against `POST https://api.atoplay.com/api/auth/login` with `{ email, password }` to obtain the AtoPlay `accessToken`, then fetch `GET https://api.atoplay.com/api/users/me` with `Authorization: Bearer <accessToken>`.
  - Extract the real AtoPlay Dashboard Account Name (`[user.fname, user.lname].filter(Boolean).join(' ')`, e.g., `khan rja`) and Account Avatar (`user.profileImage`).
- **Works on Both `increase.vercel.app` & Server**:
  - Implement the AtoPlay login + `/api/users/me` profile fetch in **both** `src/lib/api.ts` (client-side fallback so `increase.vercel.app` works immediately without needing a backend proxy) and `server.ts` (`/api/atoplay/sync-profile`).
- **SlideDrawer & Follower Logs Synchronization**:
  - **SlideDrawer**: When synced, display the user's real AtoPlay Account Avatar (`profileImage`), AtoPlay Account Name (`khan rja`), and `AtoPlay Account Synced` status. If a user logs in with another Gmail account and has not synced AtoPlay, keep the standard Google Account Name and Google Avatar (`Google Account Verified`).
  - **Follower Logs (`Followers from this Channel`)**: Save the synced AtoPlay Account Name and Account Avatar to `localStorage`, Firestore (`/users/{userId}`), and retroactively update the user's existing `follow_logs` records in Firestore so other users immediately see the real AtoPlay Account Name (`khan rja`) and AtoPlay Account Avatar in their campaign follower logs.

## 3. Planned File Changes
1. **`src/lib/api.ts`**:
   - Add client-side handling for `/api/atoplay/sync-profile` inside `apiFetch` / `handleClientFallback` that authenticates with `https://api.atoplay.com/api/auth/login` using `{ email, password }`, fetches `https://api.atoplay.com/api/users/me`, and persists the returned `atoPlayName` (`fname`) and `atoPlayAvatar` (`profileImage`) to local storage and Firestore.
2. **`server.ts`**:
   - Update `POST /api/atoplay/sync-profile` to support `{ email, password }` login against `https://api.atoplay.com/api/auth/login` and profile retrieval from `https://api.atoplay.com/api/users/me`, updating the `users` and `follow_logs` tables.
3. **`src/lib/firebase.ts`**:
   - Update `saveUserAtoPlayProfileToFirestore` to also update any existing `follow_logs` documents in Firestore where `followerUserId == userId` so existing follower log entries immediately reflect the synced AtoPlay Account Name and Avatar.
4. **`src/components/SlideDrawer.tsx`**:
   - Replace the broken channel-link input with a dedicated **AtoPlay Account Login Sync** form (Email pre-filled + Password input + Sync button) that syncs the real AtoPlay Dashboard name (`khan rja`) and avatar (`profileImage`), with clear status feedback.
5. **`src/components/HomeWatchFeed.tsx` & `src/components/Campaigns.tsx`**:
   - Ensure newly recorded and displayed follower logs prioritize the synced AtoPlay Account Name and Account Avatar when present, and fall back to the Google profile when not synced.
