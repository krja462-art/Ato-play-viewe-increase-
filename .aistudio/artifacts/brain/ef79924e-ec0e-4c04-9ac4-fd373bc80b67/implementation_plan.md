# Remove Creator Controls from Home Cards & Realistic 3D Gold Coin Design

This update removes Creator Controls (`Delete`, `View`, `Open Channel`, and `My Campaign` badges) from the Home feed by showing a creator's own active campaigns exclusively inside the **My Campaigns** tab (while keeping them active on all other users' Home feeds), and upgrades every coin indicator across the app to a realistic **3D Metallic Gold Coin** with beveled edges and a subtle specular shine.

## User Review & Critical Decisions

> [!IMPORTANT]
> Both key product and visual design decisions have been confirmed through your answers:

- **Confirmed Decision 1 (Home Card & Creator Controls)**: Creator's own campaigns and their management controls (`Delete`, `View`, `My Campaign` badge) are completely removed from the Home feed. Creators manage and delete their campaigns exclusively in the **My Campaigns** tab, while their active campaigns remain visible on the Home feed for all other users until the target views/followers are completed or the campaign is deleted.
- **Confirmed Decision 2 (Realistic 3D Coin Look)**: A custom **3D Metallic Gold Coin** with multi-stop gold gradients, a beveled rim, inner embossed emblem, and specular shine effect will be displayed across the Top Header wallet counter, Home Video & Follower cards, Campaign creation modals, and on-screen `+60 / +30 Coin Added` celebration toasts.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Clean Watch-Only Home Feed**: Removes all creator management clutter (`Delete`, `View`, `Open Channel`, `My Campaign` labels) from Home cards and filters out the logged-in creator's own campaigns from their personal Home view so Home is strictly for watching and following other creators.
  2. **Realistic 3D Gold Coin Component**: Replaces flat vector coin icons with a tactile, three-dimensional metallic gold coin featuring a 24K gold rim, recessed inner core, embossed star/crown detail, and a light-reflection sheen.
- **Target Audience / Persona**: AtoPlay video creators and viewers who want a clean, distraction-free Home feed and a rewarding, authentic tactile coin economy.
- **Key Value**: Eliminates accidental self-campaign clicks or clutter on the Home feed while making coin rewards feel visually premium and tangible.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Creating & Managing Campaigns**: When a user creates a Video or Follower campaign, it immediately appears in their **My Campaigns** tab (with full progress stats and the `Delete` button) and is broadcast to all other users' **Home** feeds. The creator's own Home feed stays clean and only shows other creators' campaigns they can watch or follow to earn coins.
  2. **Earning & Viewing Coins**: Users see the realistic 3D metallic coin in the top navigation bar (with a smooth scale/shine pulse when coins increase), alongside `+60 Coins` / `+30 Coins` reward amounts on Home cards, and inside the floating `+60 Coin Added!` / `+30 Coin Added!` celebration banner.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Tactile mobile-first creator utility with high-contrast 3D metallic reward accents.
  - *Color Palette & Mood*:
    - Neutral Canvas (`60%`): Crisp white (`#FFFFFF`) and light zinc (`#F4F4F5`) surfaces.
    - Structural Surfaces (`30%`): Subtle zinc hairlines (`#E4E4E7`) and deep slate typography (`#18181B`).
    - Accent & 3D Gold Coin (`10%`): Primary brand blue (`#2563EB`), emerald follower accent (`#059669`), and multi-stop metallic gold (`#FFFbeb` highlight -> `#FDE047` bright gold -> `#F59E0B` warm gold -> `#B45309` deep bronze rim shadow).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for crisp UI headings and card titles; `JetBrains Mono` with `tabular-nums` for coin balances, countdown timers, and campaign IDs.
  - *Component Styling & Layout*:
    - **Home Cards**: Streamlined layout featuring the 16:9 thumbnail (or channel banner), title, `#ID`, `60s Watch` indicator, 3D Gold Coin reward amount (`+60 Coins` / `+30 Coins`), and a single primary action button (`Watch (60s)` or `Follow Channel`).
    - **3D Metallic Gold Coin**: SVG-crafted layered coin with outer 3D edge thickness, inner notched ring, embossed center star emblem, drop shadow, and diagonal gloss highlight.
- **Interactive Feedback & Motion**:
  - Smooth GPU-composited (`transform`, `opacity`) coin shine sweep and a 150ms scale bounce on the header coin badge whenever new coins are earned.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Isolating Creator's Own Campaigns to "My Campaigns"**
  - *Chosen Approach*: Filter out campaigns where `campaign.userId === currentUser.id` on the Home feed query/filter layer while keeping them in the **My Campaigns** (`filter=my`) view and visible to all other users (`campaign.userId !== currentUser.id`).
  - *Why*: Users cannot earn coins from watching their own videos anyway; keeping own campaigns in **My Campaigns** removes duplicate controls from the Home card and keeps the Home feed focused 100% on earning coins.
  - *Alternatives Considered*: Keeping the creator's card on Home without buttons was rejected because it occupies feed space without offering an actionable earning task.
- **Decision 2: Pure Layered SVG + CSS 3D Metallic Coin vs. Raster Image**
  - *Chosen Approach*: Build a dedicated, scalable 3D Metallic Gold Coin component using multi-stop SVG radial/linear gradients, inner shadows, and specular highlight layers.
  - *Why*: Renders at razor-sharp retina resolution at any size (`14px` inline badge up to `48px` celebration toast) with zero network latency or broken image risk.
  - *Alternatives Considered*: Static PNG/JPG coin images were passed over because they blur at different sizes and add network requests.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Campaign Data & Sync Layer                       │
│  ┌──────────────────────┐   ┌──────────────────────┐   ┌─────────────┐  │
│  │   Cloud Firestore    │◄─►│   Express API Server │◄─►│ Local Cache │  │
│  └──────────┬───────────┘   └──────────┬───────────┘   └──────┬──────┘  │
└─────────────┼──────────────────────────┼──────────────────────┼─────────┘
              │                          │                      │
              ▼                          ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Campaign Feed Routing & Filter                     │
│  • Home Feed Filter: status === 'active' && compViews < reqViews        │
│                      && campaign.userId !== currentUser.id              │
│                      && !watchedByCurrentUser                           │
│  • My Campaigns Filter: campaign.userId === currentUser.id              │
└───────────────────┬─────────────────────────────────────┬───────────────┘
                    │                                     │
                    ▼                                     ▼
┌───────────────────────────────────────┐   ┌─────────────────────────────┐
│           HomeWatchFeed               │   │       My Campaigns Tab      │
│  • Clean Video & Follower Cards       │   │  • Creator's Active/Done    │
│  • No Creator Delete/View Controls    │   │    Campaigns                │
│  • Watch (60s) & Follow Actions Only  │   │  • Full Delete & Refund     │
└───────────────────┬───────────────────┘   └─────────────┬───────────────┘
                    │                                     │
                    └──────────────────┬──────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Realistic 3D Metallic Gold Coin UI                     │
│  • Top Navbar Wallet Counter (Animated Count + 3D Coin Pulse)           │
│  • Home Video & Follower Reward Displays (+60 / +30 3D Gold Coin)       │
│  • Floating On-Screen Celebration Toast (+60 / +30 Coin Added!)         │
│  • Campaign Creation Cost & Wallet Modals                               │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `Campaign`: Retains `userId`, `campaignType` (`'video' | 'follower'`), `viewsRequired`, `viewsCompleted`, `completedUserIds`, and `followedUserIds`.
  - **Public Feed Filter**: Excludes `campaign.userId === currentUser.id` for the requesting user only, ensuring every other user continues to see the campaign on their Home feed until `viewsCompleted >= viewsRequired` or the creator deletes it in **My Campaigns**.
- **Interactive Component & State Mapping**:
  - **Home Cards**: Clicking a Video Card or `Watch (60s)` button immediately starts the 60-second watch session; clicking `Follow Channel` opens the AtoPlay channel and verifies the follower increase on return. No creator `Delete` or `View` buttons are rendered on Home cards.
  - **3D Coin Component**: Accepts `size` (`xs`, `sm`, `md`, `lg`, `xl`) and `animate` props to render a realistic 3D gold coin across the Navbar, Home cards, Campaign modals, SlideDrawer, and reward toasts.
