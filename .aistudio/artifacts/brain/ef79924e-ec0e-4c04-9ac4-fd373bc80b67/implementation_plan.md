# Daily Missions & Bonus Coin Rewards on Home Feed

Introduce an interactive, collapsible **Daily Missions** tracker card at the top of the Home feed where creators can track daily goals (`Watch 5 Videos`, `Follow 3 Creator Channels`, `Create 1 Campaign or Use AI Assistant`, and `Complete All Daily Tasks Mega Bonus`) with real-time visual progress bars and instant automatic bonus coin rewards upon completion.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and UX decisions incorporate your confirmed answers and govern how Daily Missions behave across the app:

- **Confirmed Placement & Style**: Rendered as a **collapsible card at the top of the Home feed** (above the Video Views / Follower Campaigns segmented toggle), showing an overall daily progress bar even when collapsed so creators can expand or collapse it anytime.
- **Confirmed Mission Tasks**: Includes all 4 selected daily tasks:
  1. **Watch 5 Videos** (`+150 Bonus Coins`)
  2. **Follow 3 Creator Channels** (`+100 Bonus Coins`)
  3. **Create 1 Campaign or Use AI Assistant** (`+80 Bonus Coins`)
  4. **Complete All Daily Tasks Mega Bonus** (`+200 Mega Bonus Coins` when all 3 core tasks reach 100%)
- **Confirmed Reward Mechanism**: **Auto-credits bonus coins immediately** as soon as a mission reaches 100% completion, triggering the celebratory 3D coin toast, sound, confetti, and syncing the updated coin balance to Cloud Firestore and local storage.

---

## 1. Overview & Core Concept

- **What It Does**: Tracks a creator's daily engagement across video watching, channel following, and creator studio tools (Campaign creation or AI Assistant generation). Each action increments the corresponding daily counter for the current calendar date (`YYYY-MM-DD`), animates the task's progress bar, and automatically credits bonus coins the moment a threshold is reached.
- **Target Audience / Persona**: Content creators on mobile and desktop who want structured daily goals and extra virtual coins to promote their own videos and channels faster.
- **Key Value**: Boosts daily retention and gives creators a clear, rewarding path to earn up to **+530 extra bonus coins every day** through organic platform participation.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Zero-State / Morning Launch**: When a creator opens the Home feed, the **Daily Missions** card sits at the top showing `0 / 3 Missions Completed · Up to +530 Bonus Coins` with a sleek overall progress bar and a collapse/expand chevron (`min-h-[44px]` touch target).
  2. **Live Progress & Deep-Link Shortcuts**: Expanding the card reveals the 4 mission rows. Each incomplete mission displays its icon, title, tabular numeric progress (`2 / 5` or `1 / 3`), smooth animated fill bar, reward amount (`+150 Coins`), and a quick-action button (`Watch`, `Follow`, `Open AI`) that switches to the relevant tab or section.
  3. **Instant Auto-Credit Celebration**: The moment a user finishes their 5th video watch, 3rd channel follow, or 1st campaign/AI prompt of the day, the mission marks itself `Completed`, plays the coin celebration sound + confetti, displays an on-screen `+150 Bonus Coins Auto-Credited!` banner, and updates the user's wallet balance immediately.
  4. **Mega Bonus Cascade**: Completing the 3rd daily mission automatically triggers the 4th mission (**Complete All Daily Tasks Mega Bonus**), awarding an additional `+200 Coins` automatically.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Tactile mobile-first tracker card adhering to the **Mobile & Touch-First Applications** design constitution (`rounded-2xl` outer container, clean unboxed metadata with `·` separators, `tabular-nums` counters, and $\ge 44\text{px}$ touch targets).
  - *Color Palette & Mood*: Crisp `bg-white` card surface with subtle `border-zinc-200/80` framing, vibrant `bg-blue-600` and `bg-emerald-600` progress bar fills, and warm amber accents (`text-amber-900`) paired with the 3D `RealCoin` icon for rewards.
  - *Typography & Hierarchy*: Bold `Plus Jakarta Sans` section headers paired with `JetBrains Mono` / `tabular-nums` progress counters (`3/5`) so numbers never jitter when updating.
- **Interactive Feedback & Motion**: Smooth `transition-all duration-500` width transitions on progress bars, instant completed checkmarks, and auto-dismissing celebration toasts.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Daily Reset & Cross-Component Event Tracking**
  - *Chosen Approach*: Store daily mission progress keyed by user ID and current local date (`atoplay_daily_missions_${userId}_${YYYY-MM-DD}`) with a custom window event (`atoplay-mission-progress`) and helper utility so actions in `HomeWatchFeed` (watching videos, following channels), `Campaigns` (creating a campaign), and `AIVideoAssistant` (generating AI SEO content) all update mission progress seamlessly and auto-credit coins without duplicate payouts.
  - *Why*: Guarantees zero-latency progress updates across tabs and automatic midnight resets without requiring manual refreshes.
- **Decision 2: Dual Persistence (Local + Cloud Firestore Wallet Sync)**
  - *Chosen Approach*: Persist mission completion flags per day so a completed mission can never be double-credited on the same day, while immediately syncing the auto-credited coin balance to both the backend wallet endpoint and Cloud Firestore (`saveUserCoinsToFirestore`).
  - *Why*: Ensures total coin integrity across page reloads and devices.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       Daily Missions Tracker Utility                    │
│  • Date-keyed state (YYYY-MM-DD) per User ID                            │
│  • Tracks: videosWatched (0..5), channelsFollowed (0..3),               │
│            studioActionUsed (0..1), megaBonusClaimed (boolean)          │
└───────────────┬─────────────────────────┬───────────────────────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│   Activity Producers          │ │   Collapsible DailyMissionsCard       │
│  • Video Watch Verified (+1)  │ │  • Header: Summary + Overall Bar      │
│  • Channel Follow Verified(+1)│ │  • 4 Mission Rows with Progress Bars  │
│  • Campaign / AI Used (+1)    │ │  • Quick Action Navigation Buttons    │
└───────────────┬───────────────┘ └───────────────────┬───────────────────┘
                │                                     │
                └─────────────────┬───────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Auto-Credit Reward & Wallet Sync                     │
│  • Detects threshold reached -> Marks mission rewarded                  │
│  • Triggers Coin Toast + Confetti + Audio                               │
│  • Updates User Wallet State + Cloud Firestore + Server Session         │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `DailyMissionProgress`: `{ date: string; videosWatched: number; channelsFollowed: number; studioUsed: number; rewardedIds: string[] }`
  - 4 defined mission descriptors with target count, current count, coin reward, and completion status.
- **Interactive Component & State Mapping**:
  - **Collapse/Expand Toggle**: Toggles card body visibility while keeping the summary progress bar visible in the header.
  - **Task Action Buttons**: Clicking `Watch` switches `homeSection` to `'video'`; clicking `Follow` switches `homeSection` to `'follower'`; clicking `Use AI / Create` navigates to `'ai-assistant'` or `'campaigns'`.
  - **Auto-Credit Handler**: Evaluates mission thresholds on every progress increment; if newly completed, adds the mission's reward (plus the Mega Bonus if all 3 core tasks are now complete) to `user.coins` and calls `onCoinEarned` + `saveUserCoinsToFirestore`.
