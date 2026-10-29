# Implementation Plan: Gemini-Style AI Video Growth Assistant with Voice-to-Text (`Web Speech API`)

## Overview
We will redesign the **AI Assistant** page (`/src/components/AIVideoAssistant.tsx`) to match the clean, minimalist mobile assistant layout from your screenshot while integrating the browser **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`) for voice-to-text dictation.

---

## Key Features & UX Flow

### 1. Minimalist Gemini-Inspired Page Layout & "New Chat" Support
- **Top Header Bar (Inside AI Assistant Page)**:
  - Displays the assistant title (**AtoPlay AI** with current active Task & Language indicator) on the left and a **New Chat (`+ New Chat`)** button on the right so creators can start a fresh session anytime.
- **Zero-State Welcome Screen (When Chat is Empty)**:
  - Centered 4-point colorful sparkle icon and **"Where should we start?"** heading on a soft airy canvas.
  - 4 clickable starter rows above the input bar (one for each Creator Task: *Viral Titles & SEO Tags*, *Video Script & 15s Hook*, *Thumbnail Concept Guide*, *Description & Hashtags*) so tapping any row sets the task and pre-fills or prompts the user immediately.
- **Scrollable Chat & Result Feed**:
  - When the user submits a topic, the conversation and structured AI result cards appear directly on the page above the fixed bottom input bar.
  - Each generated result includes **one-click Copy buttons** for Titles, SEO Tags, Hook Script, Thumbnail Text, Description, Hashtags, and Full Output.

### 2. Fixed Bottom Pill Input Bar (Above Mobile Bottom Navbar)
- Positioned cleanly above the mobile navigation bar (`fixed bottom-16 md:bottom-4 left-0 right-0 z-30`) so it never overlaps with the bottom navbar.
- **Left `+` (Plus) Button**:
  - Tapping `+` opens a smooth **Bottom Sheet / Action Drawer** right above the input bar where the user can:
    1. **Choose Creator Task**:
       - *Auto-Detect Task*
       - *1. Title & SEO Tag Generator*
       - *2. Video Script & Idea Generator*
       - *3. Thumbnail Concept Guide*
       - *4. Description & Hashtag Writer*
    2. **Select Output Language**:
       - *Hinglish (Mix)*
       - *Hindi (हिंदी)*
       - *English*
    3. **Start a New Chat**: Clear current page results and return to the fresh welcome screen.
- **Center Input Box**:
  - Displays the selected task/language indicator and allows typing or editing dictated voice text before sending.
- **Right Voice Input (`Mic`) & `Send` Buttons**:
  - **Microphone Button**: Starts/stops live voice-to-text dictation via the browser Web Speech API.
  - **Send Button**: Appears/activates to submit the prompt and display the AI response on the page.

### 3. Browser Web Speech API Integration (Voice-to-Text)
- Uses `window.SpeechRecognition || window.webkitSpeechRecognition`.
- **Language Matching**:
  - Automatically sets recognition language based on the user's selected language:
    - **Hindi** $\rightarrow$ `hi-IN`
    - **Hinglish / English** $\rightarrow$ `en-IN`
- **Review Before Sending**:
  - Spoken words populate directly into the input box (including live interim speech preview while speaking) so the creator can review or edit the text before tapping Send.
- **Visual Listening Feedback**:
  - Shows a clear `"Listening..."` state on the input bar and microphone button while recording, plus a helpful fallback message if the browser does not support Web Speech API.

---

## Files to Modify
1. **`/src/components/AIVideoAssistant.tsx`**:
   - Replace the two-column layout with the Gemini-inspired full-height chat canvas, `"Where should we start?"` welcome state, New Chat reset control, fixed bottom pill input bar (`+` button, text field, Web Speech API microphone button, send button), and the `+` bottom sheet selector for Creator Task and Language.
2. **`/src/App.tsx`**:
   - Ensure main container spacing accommodates the fixed bottom AI input bar smoothly on both mobile and desktop viewports.
