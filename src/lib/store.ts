import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  ensureAnonymousUser,
  getFirebaseDb,
  getFirebaseStorage,
  isFirebaseConfigured,
} from '@/lib/firebase';
import {
  DEFAULT_COUPLE_CONFIG,
  DEFAULT_MEMORIES,
} from '@/lib/constants';
import {
  CallSession,
  ChatMessage,
  CoupleConfig,
  GameHistoryEntry,
  GameId,
  GameInvite,
  MemberId,
  MemberPresence,
  MemoryItem,
  TruthOrDareCard,
} from '@/types/universe';

// ============================================================================
// Dual Sync Engine:
// 1. Next.js /api/sync router (Cross-device realtime over Wi-Fi / Vercel / Web)
// 2. BroadcastChannel + localStorage (Instant 0ms multi-tab sync on same machine)
// 3. Firebase Firestore + Cloud Storage (Permanent cloud sync when configured)
// ============================================================================

const LOCAL_PREFIX = 'olu_store_v1_';
const CHANNEL_NAME = 'our_little_universe_sync';

let bc: BroadcastChannel | null = null;
const localListeners = new Map<string, Set<() => void>>();

function getBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!bc) {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (e) => {
      const key = e.data?.key as string | undefined;
      if (key) notifyLocalKey(key);
    };
  }
  return bc;
}

function notifyLocalKey(key: string) {
  const subs = localListeners.get(key);
  if (subs) {
    subs.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('[Sync] Listener error:', err);
      }
    });
  }
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T, notify = true) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
    if (notify) {
      notifyLocalKey(key);
      getBroadcast()?.postMessage({ key });
    }
  } catch (err) {
    console.warn('[LocalStore] Write failed:', err);
  }
}

function subscribeLocal<T>(key: string, fallback: T, cb: (val: T) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  getBroadcast();
  const emit = () => cb(readLocal(key, fallback));
  emit();

  if (!localListeners.has(key)) localListeners.set(key, new Set());
  localListeners.get(key)!.add(emit);

  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_PREFIX + key) emit();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    localListeners.get(key)?.delete(emit);
    window.removeEventListener('storage', onStorage);
  };
}

// ----------------------------------------------------------------------------
// Background Server Sync Client (/api/sync)
// Guarantees delivery between two different phones or computers!
// ----------------------------------------------------------------------------

async function postApiSync(body: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Non-blocking best-effort
  }
}

let syncPollerStarted = false;
let lastServerUpdated = 0;

function startServerSyncPoller() {
  if (typeof window === 'undefined' || syncPollerStarted) return;
  syncPollerStarted = true;

  const poll = async () => {
    try {
      const res = await fetch(`/api/sync?since=${lastServerUpdated}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      lastServerUpdated = data.lastUpdated || Date.now();

      // Messages sync
      if (Array.isArray(data.messages)) {
        const localMsgs = readLocal<ChatMessage[]>('messages', []);
        const localIdSet = new Set(localMsgs.map((m) => m.id));
        const hasDiff =
          data.messages.length !== localMsgs.length ||
          data.messages.some(
            (m: ChatMessage) =>
              !localIdSet.has(m.id) ||
              localMsgs.find((x) => x.id === m.id)?.status !== m.status
          );
        if (hasDiff) {
          // Merge unique by ID
          const map = new Map<string, ChatMessage>();
          [...localMsgs, ...data.messages].forEach((m: ChatMessage) => {
            map.set(m.id, m);
          });
          const merged = Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
          writeLocal('messages', merged, true);
        }
      }

      // Presence sync
      if (data.presence) {
        (['avinash', 'athulya'] as MemberId[]).forEach((m) => {
          if (data.presence[m]) {
            const current = readLocal<MemberPresence>(`presence_${m}`, {
              memberId: m,
              online: false,
              lastSeen: 0,
              typing: false,
            });
            if (
              data.presence[m].online !== current.online ||
              data.presence[m].typing !== current.typing ||
              data.presence[m].missYouAt !== current.missYouAt
            ) {
              writeLocal(`presence_${m}`, data.presence[m], true);
            }
          }
        });
      }

      // Active Call sync
      if ('activeCall' in data) {
        const currentCall = readLocal<CallSession | null>('active_call', null);
        const serverCall = data.activeCall as CallSession | null;
        if (JSON.stringify(currentCall) !== JSON.stringify(serverCall)) {
          writeLocal('active_call', serverCall, true);
        }
      }

      // ICE candidates sync
      if (data.iceCandidates && data.iceCandidates.callId) {
        const callId = data.iceCandidates.callId;
        const localOffers = readLocal<RTCIceCandidateInit[]>(`ice_${callId}_offerCandidates`, []);
        const localAnswers = readLocal<RTCIceCandidateInit[]>(`ice_${callId}_answerCandidates`, []);

        if (
          Array.isArray(data.iceCandidates.offerCandidates) &&
          data.iceCandidates.offerCandidates.length > localOffers.length
        ) {
          writeLocal(`ice_${callId}_offerCandidates`, data.iceCandidates.offerCandidates, true);
        }
        if (
          Array.isArray(data.iceCandidates.answerCandidates) &&
          data.iceCandidates.answerCandidates.length > localAnswers.length
        ) {
          writeLocal(`ice_${callId}_answerCandidates`, data.iceCandidates.answerCandidates, true);
        }
      }

      // Games sync
      if (data.games) {
        Object.entries(data.games).forEach(([gid, gstate]) => {
          const current = readLocal(`game_${gid}`, null);
          if (JSON.stringify(current) !== JSON.stringify(gstate)) {
            writeLocal(`game_${gid}`, gstate, true);
          }
        });
      }

      // Active Invite sync
      if ('activeInvite' in data) {
        const currentInvite = readLocal<GameInvite | null>('game_invite', null);
        if (JSON.stringify(currentInvite) !== JSON.stringify(data.activeInvite)) {
          writeLocal('game_invite', data.activeInvite, true);
        }
      }
    } catch {
      // ignore network hiccup
    }
  };

  // Immediate poll then periodic interval
  poll();
  window.setInterval(poll, 850);
}

if (typeof window !== 'undefined') {
  startServerSyncPoller();
}

// ============================================================================
// Couple Config & Profile Registration
// ============================================================================

export function subscribeCoupleConfig(cb: (cfg: CoupleConfig) => void): () => void {
  const unsubLocal = subscribeLocal('couple_config', DEFAULT_COUPLE_CONFIG, cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    const refDoc = doc(db, 'couple', 'settings');
    unsubFirestore = onSnapshot(
      refDoc,
      (snap) => {
        if (!snap.exists()) {
          cb(DEFAULT_COUPLE_CONFIG);
          return;
        }
        const data = snap.data() as Partial<CoupleConfig>;
        const merged: CoupleConfig = {
          ...DEFAULT_COUPLE_CONFIG,
          ...data,
          names: { ...DEFAULT_COUPLE_CONFIG.names, ...(data.names || {}) },
          namesEditedOnce: { ...DEFAULT_COUPLE_CONFIG.namesEditedOnce, ...(data.namesEditedOnce || {}) },
          passwords: { ...DEFAULT_COUPLE_CONFIG.passwords, ...(data.passwords || {}) },
        };
        writeLocal('couple_config', merged, false);
        cb(merged);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCoupleConfig(partial: Partial<CoupleConfig>) {
  const current = readLocal('couple_config', DEFAULT_COUPLE_CONFIG);
  const updated: CoupleConfig = {
    ...current,
    ...partial,
    names: { ...current.names, ...(partial.names || {}) },
    namesEditedOnce: { ...current.namesEditedOnce, ...(partial.namesEditedOnce || {}) },
    passwords: { ...current.passwords, ...(partial.passwords || {}) },
    updatedAt: Date.now(),
  };
  writeLocal('couple_config', updated);
  postApiSync({ action: 'save_config', config: updated });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      const refDoc = doc(db, 'couple', 'settings');
      await setDoc(refDoc, { ...partial, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      console.warn('[Firebase] saveCoupleConfig fallback to server sync:', err);
    }
  }
}

export async function claimCoupleProfile(memberId: MemberId, displayName: string, fcmToken?: string | null) {
  postApiSync({
    action: 'update_presence',
    memberId,
    presence: { online: true, lastSeen: Date.now() },
  });

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return;

  try {
    const user = await ensureAnonymousUser();
    if (!user) return;

    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        memberId,
        name: displayName,
        ...(fcmToken ? { fcmToken } : {}),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    await setDoc(
      doc(db, 'couple', 'settings'),
      {
        memberUids: { [memberId]: user.uid },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[Firebase] claimCoupleProfile error:', err);
  }
}

// ============================================================================
// Presence (Online / Last Seen / Typing / Miss You)
// ============================================================================

export function subscribePresence(
  memberId: MemberId,
  cb: (presence: MemberPresence) => void
): () => void {
  const fallback: MemberPresence = {
    memberId,
    online: false,
    lastSeen: 0,
    typing: false,
  };

  const unsubLocal = subscribeLocal(`presence_${memberId}`, fallback, cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    unsubFirestore = onSnapshot(
      doc(db, 'presence', memberId),
      (snap) => {
        if (!snap.exists()) {
          cb(fallback);
          return;
        }
        const data = { ...fallback, ...(snap.data() as Partial<MemberPresence>) };
        writeLocal(`presence_${memberId}`, data, false);
        cb(data);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function updatePresence(memberId: MemberId, partial: Partial<MemberPresence>) {
  const current = readLocal<MemberPresence>(`presence_${memberId}`, {
    memberId,
    online: false,
    lastSeen: Date.now(),
    typing: false,
  });
  const updated = { ...current, ...partial, memberId };
  writeLocal(`presence_${memberId}`, updated);

  postApiSync({
    action: 'update_presence',
    memberId,
    presence: partial,
  });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await setDoc(doc(db, 'presence', memberId), { memberId, ...partial }, { merge: true });
    } catch {
      // server sync already delivered
    }
  }
}

// ============================================================================
// Realtime Chat Messages
// ============================================================================

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    senderId: 'avinash',
    senderName: 'Avinash',
    text: 'Welcome to Our Little Universe 💗 Just the two of us, forever.',
    mediaType: 'text',
    createdAt: 1739491200000,
    status: 'seen',
    reactions: { athulya: '🌹' },
  },
  {
    id: 'welcome-2',
    senderId: 'athulya',
    senderName: 'Athulya',
    text: 'My favorite little corner of the world 🌹✨ Missed you today!',
    mediaType: 'text',
    createdAt: 1739577600000,
    status: 'seen',
    reactions: { avinash: '💗' },
  },
];

export function subscribeMessages(
  limitCount: number,
  cb: (messages: ChatMessage[], hasMore: boolean) => void
): () => void {
  const unsubLocal = subscribeLocal<ChatMessage[]>('messages', SEED_MESSAGES, (all) => {
    const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
    const hasMore = sorted.length > limitCount;
    cb(sorted.slice(Math.max(0, sorted.length - limitCount)), hasMore);
  });

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    const q = query(
      collection(db, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))
          .reverse();
        writeLocal('messages', list, false);
        cb(list, snap.docs.length >= limitCount);
      },
      (err) => {
        console.warn('[Firestore] Messages listener error, using server sync:', err);
      }
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function sendChatMessage(msg: Omit<ChatMessage, 'id'>): Promise<string> {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fullMsg: ChatMessage = { ...msg, id };

  // 1. Instant local optimistic update
  const list = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
  writeLocal('messages', [...list, fullMsg]);

  // 2. Broadcast to server sync API (cross-device)
  postApiSync({ action: 'send_message', msg: fullMsg });

  // 3. Permanent write to Firestore if configured
  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await addDoc(collection(db, 'messages'), fullMsg);
    } catch (err) {
      console.warn('[Firestore] sendChatMessage fallback to server sync:', err);
    }
  }

  return id;
}

export async function markMessagesStatus(messageIds: string[], status: 'delivered' | 'seen') {
  if (!messageIds.length) return;

  const list = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
  const idSet = new Set(messageIds);
  const updated = list.map((m) => (idSet.has(m.id) ? { ...m, status } : m));
  writeLocal('messages', updated, false);

  postApiSync({ action: 'mark_status', messageIds, status });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      const batch = writeBatch(db);
      messageIds.forEach((id) => {
        batch.update(doc(db, 'messages', id), { status });
      });
      await batch.commit();
    } catch {
      // server sync handled it
    }
  }
}

export async function toggleMessageReaction(
  messageId: string,
  memberId: MemberId,
  emoji: string
) {
  const list = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
  const updated = list.map((m) => {
    if (m.id !== messageId) return m;
    const reactions = { ...(m.reactions || {}) };
    if (reactions[memberId] === emoji) {
      delete reactions[memberId];
    } else {
      reactions[memberId] = emoji;
    }
    return { ...m, reactions };
  });
  writeLocal('messages', updated);

  postApiSync({ action: 'toggle_reaction', messageId, memberId, emoji });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      const listSnap = await getDocs(query(collection(db, 'messages'), limit(150)));
      const found = listSnap.docs.find((d) => d.id === messageId);
      const existing = (found?.data()?.reactions || {}) as Partial<Record<MemberId, string>>;
      const next = { ...existing };
      if (next[memberId] === emoji) {
        delete next[memberId];
      } else {
        next[memberId] = emoji;
      }
      await updateDoc(doc(db, 'messages', messageId), { reactions: next });
    } catch {
      // server sync handled it
    }
  }
}

export async function clearAllChatMessages() {
  writeLocal('messages', []);
  postApiSync({ action: 'clear_chat' });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      const snap = await getDocs(collection(db, 'messages'));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// Media Upload (Images, Voice Notes, Memories) -> Firebase Storage or DataURL
// ============================================================================

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageIfNeeded(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1280;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export async function uploadMediaFile(
  fileOrBlob: File | Blob,
  folder: 'chat-media' | 'voice-notes' | 'memories'
): Promise<string> {
  const processed =
    fileOrBlob instanceof File ? await compressImageIfNeeded(fileOrBlob) : fileOrBlob;

  const storage = getFirebaseStorage();
  if (isFirebaseConfigured && storage) {
    try {
      await ensureAnonymousUser();
      const ext =
        folder === 'voice-notes'
          ? 'webm'
          : fileOrBlob instanceof File && fileOrBlob.name.includes('.')
            ? fileOrBlob.name.split('.').pop()
            : 'jpg';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, processed);
      return await getDownloadURL(storageRef);
    } catch (err) {
      console.warn('[Storage] Upload failed, falling back to data URL:', err);
    }
  }

  return fileToDataUrl(processed);
}

// ============================================================================
// Live 2-Player Games, Invites, History, Custom Cards
// ============================================================================

export function subscribeGameState<T>(
  gameId: GameId,
  initial: T,
  cb: (state: T) => void
): () => void {
  const unsubLocal = subscribeLocal(`game_${gameId}`, initial, cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    unsubFirestore = onSnapshot(
      doc(db, 'games', gameId),
      (snap) => {
        if (!snap.exists()) {
          cb(initial);
          return;
        }
        const state = { ...initial, ...(snap.data() as Partial<T>) };
        writeLocal(`game_${gameId}`, state, false);
        cb(state);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveGameState<T extends object>(gameId: GameId, state: T) {
  writeLocal(`game_${gameId}`, state);
  postApiSync({ action: 'save_game', gameId, state });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await setDoc(doc(db, 'games', gameId), state, { merge: true });
    } catch {
      // server sync handled it
    }
  }
}

export function subscribeGameInvite(cb: (invite: GameInvite | null) => void): () => void {
  const unsubLocal = subscribeLocal<GameInvite | null>('game_invite', null, cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    unsubFirestore = onSnapshot(
      doc(db, 'games', 'activeInvite'),
      (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        const data = snap.data() as GameInvite;
        const inv = data?.id ? data : null;
        writeLocal('game_invite', inv, false);
        cb(inv);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function sendGameInvite(invite: GameInvite) {
  writeLocal('game_invite', invite);
  postApiSync({ action: 'send_invite', invite });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await setDoc(doc(db, 'games', 'activeInvite'), invite);
    } catch {
      // server sync handled it
    }
  }
}

export function subscribeGameHistory(cb: (entries: GameHistoryEntry[]) => void): () => void {
  const unsubLocal = subscribeLocal<GameHistoryEntry[]>('game_history', [], (items) =>
    cb([...items].sort((a, b) => b.playedAt - a.playedAt))
  );

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    const q = query(collection(db, 'gameHistory'), orderBy('playedAt', 'desc'), limit(40));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameHistoryEntry, 'id'>) }));
        writeLocal('game_history', list, false);
        cb(list);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function addGameHistory(entry: Omit<GameHistoryEntry, 'id'>) {
  const id = `gh-${Date.now()}`;
  const list = readLocal<GameHistoryEntry[]>('game_history', []);
  writeLocal('game_history', [{ ...entry, id }, ...list].slice(0, 50));
  postApiSync({ action: 'add_history', entry });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await addDoc(collection(db, 'gameHistory'), entry);
    } catch {
      // server sync handled it
    }
  }
}

export function subscribeCustomCards(cb: (cards: TruthOrDareCard[]) => void): () => void {
  const unsubLocal = subscribeLocal<TruthOrDareCard[]>('custom_cards', [], cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    const q = query(collection(db, 'customCards'), limit(50));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TruthOrDareCard, 'id'>) }));
        writeLocal('custom_cards', list, false);
        cb(list);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function addCustomCard(card: Omit<TruthOrDareCard, 'id'>) {
  const id = `custom-${Date.now()}`;
  const list = readLocal<TruthOrDareCard[]>('custom_cards', []);
  writeLocal('custom_cards', [...list, { ...card, id, isCustom: true }]);
  postApiSync({ action: 'add_custom_card', card });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await addDoc(collection(db, 'customCards'), { ...card, isCustom: true });
    } catch {
      // server sync handled it
    }
  }
}

// ============================================================================
// Memories & Shared Photo Gallery
// ============================================================================

export function subscribeMemories(cb: (memories: MemoryItem[]) => void): () => void {
  const unsubLocal = subscribeLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES, (list) =>
    cb([...list].sort((a, b) => b.date.localeCompare(a.date)))
  );

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    const q = query(collection(db, 'memories'), orderBy('createdAt', 'desc'), limit(100));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemoryItem, 'id'>) }));
          writeLocal('memories', list, false);
          cb(list);
        }
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function addMemoryItem(item: Omit<MemoryItem, 'id'>) {
  const id = `mem-${Date.now()}`;
  const list = readLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES);
  writeLocal('memories', [{ ...item, id }, ...list]);
  postApiSync({ action: 'add_memory', memory: item });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await addDoc(collection(db, 'memories'), item);
    } catch {
      // server sync handled it
    }
  }
}

export async function deleteMemoryItem(id: string) {
  const list = readLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES);
  writeLocal(
    'memories',
    list.filter((m) => m.id !== id)
  );
  postApiSync({ action: 'delete_memory', id });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await deleteDoc(doc(db, 'memories', id));
    } catch {
      // server sync handled it
    }
  }
}

// ============================================================================
// WebRTC Video / Voice Call Signaling
// ============================================================================

export function subscribeActiveCall(cb: (call: CallSession | null) => void): () => void {
  const unsubLocal = subscribeLocal<CallSession | null>('active_call', null, cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    unsubFirestore = onSnapshot(
      doc(db, 'calls', 'active'),
      (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        const data = snap.data() as CallSession;
        const call = data?.id && data.status !== 'ended' ? data : null;
        writeLocal('active_call', call, false);
        cb(call);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function saveCallSession(session: CallSession | null) {
  writeLocal('active_call', session);
  postApiSync({ action: 'save_call', call: session });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      if (!session) {
        await setDoc(doc(db, 'calls', 'active'), { id: '', status: 'ended', endedAt: Date.now() });
      } else {
        await setDoc(doc(db, 'calls', 'active'), session, { merge: true });
      }
    } catch {
      // server sync handled it
    }
  }
}

export async function addIceCandidateSignal(
  callId: string,
  role: 'offerCandidates' | 'answerCandidates',
  candidate: RTCIceCandidateInit
) {
  const key = `ice_${callId}_${role}`;
  const existing = readLocal<RTCIceCandidateInit[]>(key, []);
  writeLocal(key, [...existing, candidate]);

  postApiSync({ action: 'add_ice', callId, role, candidate });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await addDoc(collection(db, 'calls', 'active', role), {
        ...candidate,
        callId,
      });
    } catch {
      // server sync handled it
    }
  }
}

export function subscribeIceCandidatesSignal(
  callId: string,
  role: 'offerCandidates' | 'answerCandidates',
  cb: (candidates: RTCIceCandidateInit[]) => void
): () => void {
  const unsubLocal = subscribeLocal<RTCIceCandidateInit[]>(`ice_${callId}_${role}`, [], cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  let unsubFirestore: (() => void) | null = null;
  ensureAnonymousUser().then((user) => {
    if (!user) return;
    unsubFirestore = onSnapshot(
      collection(db, 'calls', 'active', role),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as RTCIceCandidateInit & { callId?: string })
          .filter((c) => c.callId === callId);
        if (list.length) {
          writeLocal(`ice_${callId}_${role}`, list, false);
          cb(list);
        }
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

// ============================================================================
// Background Push Trigger (/api/notify)
// ============================================================================

export async function triggerPartnerPush(
  partnerToken: string | undefined,
  title: string,
  message: string,
  data?: Record<string, string>
) {
  if (!partnerToken) return;
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: partnerToken, title, message, data }),
    });
  } catch {
    // Non-blocking best-effort background push
  }
}
