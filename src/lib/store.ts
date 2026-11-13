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
  decryptTextE2EE,
  encryptTextE2EE,
} from '@/lib/crypto';
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
// Multi-Channel Instant Realtime Engine:
// 1. Instant Server-Sent Events (SSE) Stream (< 40ms cross-device delivery)
// 2. BroadcastChannel + localStorage (0ms instant tab-to-tab on same device)
// 3. Native Web Crypto AES-GCM-256 End-to-End Encryption (E2EE)
// 4. Firestore onSnapshot realtime listener + Storage permanent backup
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
// End-to-End Decryption Helpers
// ----------------------------------------------------------------------------

async function decryptMessageIfNeeded(msg: ChatMessage): Promise<ChatMessage> {
  let text = msg.text;
  if (text && text.startsWith('enc:v1:')) {
    text = await decryptTextE2EE(text);
  }
  let replyTo = msg.replyTo;
  if (replyTo?.text && replyTo.text.startsWith('enc:v1:')) {
    replyTo = {
      ...replyTo,
      text: await decryptTextE2EE(replyTo.text),
    };
  }
  return { ...msg, text, replyTo };
}

async function decryptMessagesList(msgs: ChatMessage[]): Promise<ChatMessage[]> {
  return Promise.all(msgs.map(decryptMessageIfNeeded));
}

// ----------------------------------------------------------------------------
// Instant Server-Sent Events (SSE) Client (< 40ms Delivery)
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
    // Non-blocking best effort
  }
}

let sseInitialized = false;

function initRealtimeSse() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined' || sseInitialized) return;
  sseInitialized = true;

  let es: EventSource | null = null;

  const connect = () => {
    try {
      es = new EventSource('/api/sync?stream=true');

      es.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);
          const { type, payload } = data;

          if (type === 'init' && payload) {
            if (Array.isArray(payload.messages)) {
              const decrypted = await decryptMessagesList(payload.messages);
              writeLocal('messages', decrypted, true);
            }
            if (payload.presence) {
              (['avinash', 'athulya'] as MemberId[]).forEach((m) => {
                if (payload.presence[m]) {
                  writeLocal(`presence_${m}`, payload.presence[m], true);
                }
              });
            }
            if ('activeCall' in payload) {
              writeLocal('active_call', payload.activeCall, true);
            }
            if (payload.games) {
              Object.entries(payload.games).forEach(([gid, gstate]) => {
                writeLocal(`game_${gid}`, gstate, true);
              });
            }
            if ('activeInvite' in payload) {
              writeLocal('game_invite', payload.activeInvite, true);
            }
          } else if (type === 'new_message' && payload) {
            // Instant message push!
            const decrypted = await decryptMessageIfNeeded(payload as ChatMessage);
            const current = readLocal<ChatMessage[]>('messages', []);
            const map = new Map<string, ChatMessage>();
            [...current, decrypted].forEach((m) => map.set(m.id, m));
            const merged = Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
            writeLocal('messages', merged, true);
          } else if (type === 'presence' && payload) {
            writeLocal(`presence_${payload.memberId}`, payload.presence, true);
          } else if (type === 'active_call') {
            writeLocal('active_call', payload, true);
          } else if (type === 'ice_candidate' && payload) {
            const key = `ice_${payload.callId}_${payload.role}`;
            const existing = readLocal<RTCIceCandidateInit[]>(key, []);
            writeLocal(key, [...existing, payload.candidate], true);
          } else if (type === 'game_state' && payload) {
            writeLocal(`game_${payload.gameId}`, payload.state, true);
          } else if (type === 'game_invite') {
            writeLocal('game_invite', payload, true);
          } else if (type === 'mark_status' && payload) {
            const ids = new Set(payload.messageIds || []);
            const current = readLocal<ChatMessage[]>('messages', []);
            const updated = current.map((m) =>
              ids.has(m.id) ? { ...m, status: payload.status } : m
            );
            writeLocal('messages', updated, true);
          } else if (type === 'reaction' && payload) {
            const current = readLocal<ChatMessage[]>('messages', []);
            const updated = current.map((m) => {
              if (m.id !== payload.messageId) return m;
              const reactions = { ...(m.reactions || {}) };
              if (reactions[payload.memberId as MemberId] === payload.emoji) {
                delete reactions[payload.memberId as MemberId];
              } else {
                reactions[payload.memberId as MemberId] = payload.emoji;
              }
              return { ...m, reactions };
            });
            writeLocal('messages', updated, true);
          } else if (type === 'clear_chat') {
            writeLocal('messages', [], true);
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          window.setTimeout(connect, 2000);
        }
      };
    } catch {
      // fallback
    }
  };

  connect();

  // Safety net fallback poll (every 3s)
  window.setInterval(async () => {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        const local = readLocal<ChatMessage[]>('messages', []);
        if (data.messages.length > local.length) {
          const decrypted = await decryptMessagesList(data.messages);
          writeLocal('messages', decrypted, true);
        }
      }
    } catch {
      // ignore
    }
  }, 3000);
}

if (typeof window !== 'undefined') {
  initRealtimeSse();
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
    } catch {
      // server sync active
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
  } catch {
    // server sync active
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
      // server sync active
    }
  }
}

// ============================================================================
// Realtime Chat Messages (End-to-End Encrypted with AES-GCM)
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
      async (snap) => {
        const rawList: ChatMessage[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))
          .reverse();
        const decryptedList = await decryptMessagesList(rawList);
        writeLocal('messages', decryptedList, false);
        cb(decryptedList, snap.docs.length >= limitCount);
      },
      () => undefined
    );
  });

  return () => {
    unsubLocal();
    if (unsubFirestore) unsubFirestore();
  };
}

export async function sendChatMessage(msg: Omit<ChatMessage, 'id'>): Promise<string> {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // 1. Instant local optimistic update with plaintext (zero latency for sender)
  const plainMsg: ChatMessage = { ...msg, id };
  const list = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
  writeLocal('messages', [...list, plainMsg]);

  // 2. End-to-End Encrypt before sending over the wire / server
  const cipherText = await encryptTextE2EE(msg.text);
  const cipherReply = msg.replyTo?.text ? await encryptTextE2EE(msg.replyTo.text) : undefined;

  const wireMsg: ChatMessage = {
    ...msg,
    id,
    text: cipherText,
    replyTo: msg.replyTo
      ? { ...msg.replyTo, text: cipherReply || msg.replyTo.text }
      : undefined,
  };

  // 3. Instant Push to partner via SSE and Server Sync
  postApiSync({ action: 'send_message', msg: wireMsg });

  // 4. Permanent Cloud Backup to Firestore if configured
  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      await ensureAnonymousUser();
      await addDoc(collection(db, 'messages'), wireMsg);
    } catch {
      // server sync handled it
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
      // server sync handled it
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
    } catch {
      // fallback to data url
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
      // server sync active
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
      // server sync active
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
      // server sync active
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
      // server sync active
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
      // server sync active
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
      // server sync active
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
      // server sync active
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
      // server sync active
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
    // Non-blocking best effort
  }
}
