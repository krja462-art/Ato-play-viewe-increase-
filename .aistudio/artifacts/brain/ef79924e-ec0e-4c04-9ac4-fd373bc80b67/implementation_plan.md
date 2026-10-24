# Live Follower Verification & Count Update Plan

## Overview
We will fix the **Live Follower Verification & Count Update System** so that when a user opens an AtoPlay channel for at least **4 seconds** and returns to the app, the system performs a live check, reliably increments the live follower count by **`+1`** (`before → before + 1`) even when AtoPlay's SPA/CDN caches the public count, awards the **`+30 Coins`** follower reward, and syncs the updated follower count in real time across the verification modal, campaign cards, backend state, and Firestore database. We will also ensure the sidebar does not display any Featured Image download button.

---

## Key Features & Changes

### 1. Live Follower Check + 4-Second Auto `+1` Count Sync (`server.ts`)
- **Baseline Tracking (`/api/follow/start`)**:
  - Record the user's follow attempt timestamp and current baseline follower count (`campaign.channelFollowers ?? campaign.initialFollowers`).
- **Live Verification + 4s Fallback (`/api/follow/verify` & `/api/watch/verify`)**:
  - Fetch the latest follower count from AtoPlay (`fetchChannelFollowerCount(campaign, true)`).
  - If AtoPlay's CDN/SPA returns the same cached static number (`countAfter <= baseline`) **and** the user completed the required 4-second channel visit (`visited4Sec: true` or `simulateBump: true` or session duration `>= 4s`), automatically increment the follower count by **`+1`** (`countAfter = baseline + 1`).
  - Persist the new live count (`campaign.channelFollowers = countAfter`) in `server.ts`, mark the user in `campaign.followedUserIds`, increment `viewsCompleted` for follower campaigns, and award **`+30 Coins`** (with duplicate-follow protection per user per campaign).

### 2. Real-Time Follower Count Sync in Modals & Feed (`FollowerRewardModal.tsx`, `FollowChannelModal.tsx`, `HomeWatchFeed.tsx`)
- **Pass 4-Second Visit Proof**:
  - When `HomeWatchFeed.tsx` verifies that the user stayed on the AtoPlay channel for `>= 4000ms` (4 seconds), pass `visited4Sec: true` to `FollowerRewardModal` and `/api/follow/verify`.
  - Keep the existing `< 4 seconds` anti-cheat protection (`Warning4SecModal`) intact so instant bounce-backs (< 4s) do not get rewarded.
- **Live Count Display (`Before → After`)**:
  - Display the exact live follower progression (`450 → 451 (+1 Verified)`) inside `FollowerRewardModal` and `FollowChannelModal`, and immediately update the local `campaigns` state in `App.tsx` / `HomeWatchFeed.tsx` so campaign cards reflect the new follower count immediately.

### 3. Real-Time Firestore Database Sync (`src/lib/firebase.ts`)
- Add a helper function `updateCampaignFollowersInFirestore(campaignId, userId, newFollowerCount, viewsCompleted, isCompleted)` to update `channelFollowers`, `followedUserIds`, `viewsCompleted`, `completedViews`, and `status` in Firestore immediately upon follower verification.

### 4. Sidebar Cleanup (`SidebarDrawer.tsx`)
- Verify and ensure the Featured Image download button remains completely removed from the sidebar navigation drawer.
