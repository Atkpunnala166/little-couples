# Our Little Universe 💗🌹

A private, romantic couples-only web app & installable PWA built exclusively for **Avinash** (`💗`) and **Athulya** (`🌹`) using **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Framer Motion**, and **Firebase**.

---

## ✨ Features

### 🔐 Private Profile Gate
- **"Who's here tonight?"** screen with two profile cards: **Avinash** 💗 and **Athulya** 🌹.
- Protected by individual passwords (**Avinash:** `Avi123`, **Athulya:** `Sree123`) plus an optional shared couple room passcode configurable in **Settings**.
- Persists your profile in `localStorage` + Firestore `users/{uid}` so returning opens straight into Chat.
- Display names can be customized once in Settings; quick **Switch Profile** button included.

### 💌 Realtime Chat & Video Calling
- Realtime messages via Firestore `onSnapshot`, permanently stored with sender, timestamp, and `sent` / `delivered` / `seen` ticks.
- Typing indicator, online / last seen status, reply quotes, heart/emoji reactions, emoji picker, GIF picker, image uploads, and voice notes.
- **"Miss you" 💗** button triggers a live floating-hearts shower on your partner's screen.
- **Video & Voice Calls** powered by WebRTC (`RTCPeerConnection`) with Firestore signaling, incoming call ringtone & accept/decline screen, PiP local video, mic/camera toggles, and call duration logs in chat.
- Infinite scroll for older messages, message search, **Memory of the Day** quote card, auto-scroll, and unread divider.

### 🔔 Smart Notifications
- Non-blocking top pink glass toast (`💌 Athulya: ...` or game updates like `"Athulya made a move in Tic-Tac-Toe"`) that auto-hides after ~3.5s; tap to jump straight to Chat or that Game.
- Soft synthesized Web Audio chime, mobile vibration, and unread badges on Chat & Games tabs.
- Background push notifications via **Firebase Cloud Messaging (FCM)** + `/api/notify` when the app is backgrounded or closed.

### 🎮 Two-Player Live Games
1. **Tic-Tac-Toe** (`💗` vs `🌹`) — Strict live turn order, winning line glow, heart confetti, and New Round.
2. **Heart Duel** — 20-second arcade tap-the-hearts challenge with live `Avinash vs Athulya` scoreboard & all-time best scores.
3. **Truth or Dare** — Synced card draw appearing on both phones simultaneously + custom card creator.
4. **Love Quiz ("How well do you know me?")** — Answer about yourself, guess your partner's answers, compare scores.
5. **Memory Match** — Turn-by-turn couples photo & moment matching.
- Includes live **Play & Invite** notifications and permanent **Game History** & win counter.

### 🌙 Love Vibe, Memories & Settings
- Dark wine & obsidian glassmorphism with subtle grain, floating hearts/sparkles, and **Playfair Display** italic headings.
- **Days-together counter**, live ticking **Countdown to Next Meeting**, **Shared Photo Gallery**, and **Memories Timeline**.
- Theme switcher (**Midnight Rose**, **Sunset**, **Neon Love**) and optional **Lofi Love Radio** ambient music toggle.

---

## 🚀 Local Setup

```bash
cd our-little-universe
npm install
npm run dev
```

Open `http://localhost:3000`.

> **Instant Cross-Device & Multi-Tab Sync:** The app features a dual sync engine. It works immediately across two phones on the same Wi-Fi, over the internet, and between browser tabs using the built-in `/api/sync` real-time channel + `BroadcastChannel`. When Firebase keys are added to `.env.local`, Firestore provides permanent cloud database backup and storage!

---

## 🔥 Firebase Setup (Cloud Sync Across Phones)

1. **Create a Firebase Project** at [console.firebase.google.com](https://console.firebase.google.com).
2. **Enable Anonymous Authentication**:
   - Go to **Build -> Authentication -> Sign-in method**.
   - Enable **Anonymous**.
3. **Create Cloud Firestore**:
   - Go to **Build -> Firestore Database -> Create database**.
   - Deploy the included security rules (`firestore.rules`) so only the two authenticated couple UIDs can read/write:
     ```bash
     firebase deploy --only firestore:rules
     ```
4. **Enable Firebase Storage** (for photos, voice notes, and gallery):
   - Go to **Build -> Storage -> Get started**.
   - Deploy `storage.rules`:
     ```bash
     firebase deploy --only storage
     ```
5. **Get Web App Config & FCM VAPID Key**:
   - Go to **Project Settings -> General -> Your apps -> Web app (`</>`)** and copy the config keys into `.env.local`.
   - Go to **Project Settings -> Cloud Messaging -> Web Push certificates -> Generate key pair** and paste the key into `NEXT_PUBLIC_FIREBASE_VAPID_KEY` in `.env.local`.
   - Also update `DEFAULT_CONFIG` inside `public/firebase-messaging-sw.js` with the same web config for background notifications when the tab is closed.
6. **Optional Server-Side Background Push (`/api/notify`)**:
   - In **Project Settings -> Service accounts -> Generate new private key**, download the JSON file and paste it as a single-line string into `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local` (or Vercel Environment Variables).

---

## 🌐 Deploy

### Option A: Deploy to Vercel (Recommended for Next.js + `/api/notify`)
1. Push `our-little-universe` to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add all variables from `.env.example` in **Vercel Project -> Settings -> Environment Variables**.
4. Click **Deploy** — HTTPS is automatic (required for PWA install, Microphone/Camera WebRTC, and FCM push notifications).

### Option B: Deploy with Firebase App Hosting / Hosting
- For full Next.js SSR + `/api/notify`, use **Firebase App Hosting** (`firebase apphosting:backends:create`).
- Note that `firestore.rules` and `storage.rules` are already configured in `firebase.json`.
