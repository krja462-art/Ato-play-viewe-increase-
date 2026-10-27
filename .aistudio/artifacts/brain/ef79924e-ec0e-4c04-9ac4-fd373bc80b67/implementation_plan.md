# Channel Followers Tracker Implementation Plan

## 1. Overview & Goal
Replace the existing Creator Tools page (`CreatorTools.tsx`) with a dedicated **Channel Followers Tracker ("My Followers")** tool so AtoPlay creators can easily see every user who followed their AtoPlay channel, inspect live channel follower counts, search by AtoPlay channel link or username, and report users who unfollowed (automatically deducting 30 coins and issuing a warning).

## 2. Key Features & User Experience
- **Navigation Update (`Navbar.tsx` & `App.tsx`)**:
  - Update the navigation label and icon from "Creator Tools / Tools" to **"Followers"** (with the `Users` icon) in both the desktop header and mobile bottom navigation bar.
  - Pass the logged-in `user` object into `CreatorTools` so it can automatically load the creator's follower campaigns and channel data.
- **Channel Summary & Live Follower Count Header**:
  - Automatically detect the user's AtoPlay channel from their active/past Follower Campaigns or synced AtoPlay channel profile.
  - Display the channel avatar, channel name, total live AtoPlay channel follower count (fetched live via `fetchLiveAtoPlayFollowerCount`), and total app-verified followers count.
  - Include a **Channel Link / Username Search Bar** so the user can also paste any AtoPlay channel URL or `@username` to inspect its live AtoPlay follower stats and matching campaign follower logs.
- **Who Followed My Channel List (Follower Cards)**:
  - Aggregate and deduplicate all follower logs from both the backend (`/api/campaigns/:id/followers` and `/api/channels/followers`) and Cloud Firestore (`follow_logs` collection by `creatorId` / `campaignId` / `channelUrl`).
  - Filter and search followers by username/name or filter between **All Followers**, **Verified Active**, and **Reported / Unfollowed**.
  - Each follower row displays:
    - **Follower AtoPlay Profile Photo & Badge** (with clean fallback avatar if no photo is set).
    - **Follower AtoPlay Username & Display Name** (`@username`).
    - **Follow Timestamp** (relative time and formatted date/time) and the campaign/channel they followed.
    - **Report Unfollow Button**: Allows the channel owner to report a user who unfollowed on AtoPlay, immediately marking the log as `reported`, deducting 30 coins from the offender, and sending a real-time warning notification via both `/api/campaigns/:id/report-follower` and `reportFakeFollowInFirestore`.

## 3. Technical Changes
1. **Backend (`server.ts`)**:
   - Add `GET /api/my-followers` endpoint that returns all `followLogs` belonging to the authenticated creator (`creatorId === user.id`) or matching a queried `channelUrl` / `channelName`, enriched with each follower's latest AtoPlay profile photo and username.
2. **Firestore Helper (`src/lib/firebase.ts`)**:
   - Add `getCreatorFollowLogsFromFirestore(creatorId: string, campaignIds: string[])` to fetch and enrich all `follow_logs` for the user's follower campaigns directly from Cloud Firestore.
3. **Followers Tool UI (`src/components/CreatorTools.tsx`)**:
   - Replace the old 4-tab toolkit (SEO, Calculator, Notepad, Device Settings) with the full **Channel Followers Tracker** interface designed for mobile-first touch ergonomics (`44px+` touch targets, clean hairline dividers, tabular numerals, and instant filter tabs).
4. **Navigation & Wiring (`src/components/Navbar.tsx`, `src/App.tsx`)**:
   - Pass `user` prop to `<CreatorTools user={user} />` and update the tab icon/label to **Followers**.
