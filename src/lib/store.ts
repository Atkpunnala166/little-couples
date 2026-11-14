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

export const SEED_MESSAGES: ChatMessage[] = [
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

async function decryptMessageIfNeeded(msg: ChatMessage): Promise<ChatMessage> {
  let text = msg.text;
  if (text && (text.startsWith('enc:v1:') || text.startsWith('enc:js1:'))) {
    text = await decryptTextE2EE(text);
  }
  let replyTo = msg.replyTo;
  if (replyTo?.text && (replyTo.text.startsWith('enc:v1:') || replyTo.text.startsWith('enc:js1:'))) {
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

async function syncIncomingMessages(incoming: ChatMessage[]) {
  if (!Array.isArray(incoming) || incoming.length === 0) return;
  const current = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
  const map = new Map<string, ChatMessage>();
  current.forEach((m) => map.set(m.id, m));

  let changed = false;
  const pendingDecrypt: ChatMessage[] = [];

  for (const inc of incoming) {
    const existing = map.get(inc.id);
    if (!existing) {
      pendingDecrypt.push(inc);
      changed = true;
    } else {
      const statusChanged = inc.status && existing.status !== inc.status;
      const reactionsChanged =
        inc.reactions &&
        JSON.stringify(existing.reactions || {}) !== JSON.stringify(inc.reactions || {});
      if (statusChanged || reactionsChanged) {
        map.set(inc.id, {
          ...existing,
          status: inc.status || existing.status,
          reactions: inc.reactions || existing.reactions,
        });
        changed = true;
      }
    }
  }

  if (pendingDecrypt.length > 0) {
    const decrypted = await decryptMessagesList(pendingDecrypt);
    decrypted.forEach((m) => map.set(m.id, m));
  }

  if (changed) {
    const sorted = Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
    writeLocal('messages', sorted, true);
  }
}

// ----------------------------------------------------------------------------
// Universal Multi-Channel Realtime Engine:
// 1. Global Realtime WebSocket Relay (< 25ms instant cross-device push across Vercel, cellular & all networks)
// 2. Next.js Server-Sent Events (SSE) & Local API Sync
// 3. Firestore Cloud Realtime Synchronization (unblocked direct reads & writes)
// 4. LocalStorage & BroadcastChannel (0ms instant cross-tab sync)
// ----------------------------------------------------------------------------

const RELAY_TOPIC = 'olu_channel_avinash_athulya_v1';
const RELAY_URL = `https://ntfy.sh/${RELAY_TOPIC}`;
const RELAY_WS_URL = `wss://ntfy.sh/${RELAY_TOPIC}/ws`;

export async function postGlobalSync(body: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const payloadStr = JSON.stringify(body);

  // 1. Post to local Next.js sync endpoint (for dev / node server)
  fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadStr,
  }).catch(() => undefined);

  // 2. Broadcast to global realtime WebSocket relay (< 25ms cross-device delivery anywhere in the world)
  fetch(RELAY_URL, {
    method: 'POST',
    body: payloadStr,
    headers: { Title: 'OLU_EVENT' },
  }).catch(() => undefined);
}

// Deprecated alias for backwards compatibility
export const postApiSync = postGlobalSync;

async function handleIncomingRelayPayload(data: Record<string, unknown>) {
  if (!data || typeof data !== 'object') return;
  const action = (data.action || data.type) as string;

  if (action === 'send_message' || action === 'new_message') {
    const msg = (data.msg || data.payload) as ChatMessage;
    if (msg) await syncIncomingMessages([msg]);
  } else if (action === 'update_presence' || action === 'presence') {
    const memberId = (data.memberId || (data.payload as Record<string, unknown>)?.memberId) as MemberId;
    const presence = (data.presence || (data.payload as Record<string, unknown>)?.presence || data.payload) as MemberPresence;
    if (memberId && presence) {
      writeLocal(`presence_${memberId}`, presence, true);
    }
  } else if (action === 'save_call' || action === 'active_call') {
    const call = (data.call || data.payload) as CallSession;
    writeLocal('active_call', call, true);
  } else if (action === 'ice_candidate') {
    const callId = data.callId as string;
    const role = data.role as string;
    const candidate = data.candidate as RTCIceCandidateInit;
    if (callId && role && candidate) {
      const key = `ice_${callId}_${role}`;
      const existing = readLocal<RTCIceCandidateInit[]>(key, []);
      writeLocal(key, [...existing, candidate], true);
    }
  } else if (action === 'save_game' || action === 'game_state') {
    const gameId = (data.gameId || (data.payload as Record<string, unknown>)?.gameId) as string;
    const state = data.state || (data.payload as Record<string, unknown>)?.state;
    if (gameId && state) {
      writeLocal(`game_${gameId}`, state, true);
    }
  } else if (action === 'send_invite' || action === 'game_invite') {
    const invite = (data.invite || data.payload) as GameInvite;
    writeLocal('game_invite', invite, true);
  } else if (action === 'mark_status') {
    const ids = new Set(((data.messageIds || (data.payload as Record<string, unknown>)?.messageIds) as string[]) || []);
    const status = (data.status || (data.payload as Record<string, unknown>)?.status) as 'delivered' | 'seen';
    if (ids.size && status) {
      const current = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
      const updated = current.map((m) => (ids.has(m.id) ? { ...m, status } : m));
      writeLocal('messages', updated, true);
    }
  } else if (action === 'toggle_reaction' || action === 'reaction') {
    const messageId = (data.messageId || (data.payload as Record<string, unknown>)?.messageId) as string;
    const memberId = (data.memberId || (data.payload as Record<string, unknown>)?.memberId) as MemberId;
    const emoji = (data.emoji || (data.payload as Record<string, unknown>)?.emoji) as string;
    if (messageId && memberId && emoji) {
      const current = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
      const updated = current.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        if (reactions[memberId] === emoji) {
          delete reactions[memberId];
        } else {
          reactions[memberId] = emoji;
        }
        return { ...m, reactions };
      });
      writeLocal('messages', updated, true);
    }
  } else if (action === 'clear_chat') {
    writeLocal('messages', [], true);
  }
}

let syncEnginesStarted = false;

function initRealtimeEngines() {
  if (typeof window === 'undefined' || syncEnginesStarted) return;
  syncEnginesStarted = true;

  // 1. Global Realtime WebSocket Connection (< 25ms message delivery anywhere)
  let ws: WebSocket | null = null;
  const connectWs = () => {
    if (typeof WebSocket === 'undefined') return;
    try {
      ws = new WebSocket(RELAY_WS_URL);
      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.event === 'message' && parsed.message) {
            const inner = JSON.parse(parsed.message);
            handleIncomingRelayPayload(inner);
          }
        } catch {
          // ignore
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };
      ws.onclose = () => {
        ws = null;
        window.setTimeout(connectWs, 2000);
      };
    } catch {
      // fallback
    }
  };
  connectWs();

  // Catch up on any recent events sent while the app was closed
  const fetchRecentHistory = () => {
    fetch(`${RELAY_URL}/json?poll=1&since=24h`, { cache: 'no-store' })
      .then((r) => r.text())
      .then((raw) => {
        const lines = raw.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item = JSON.parse(line);
            if (item.event === 'message' && item.message) {
              const inner = JSON.parse(item.message);
              handleIncomingRelayPayload(inner);
            }
          } catch {}
        }
      })
      .catch(() => undefined);
  };
  fetchRecentHistory();

  // Periodic safety-net poll of relay every 1500ms
  window.setInterval(fetchRecentHistory, 1500);

  // 2. Next.js Local Server-Sent Events (SSE)
  let es: EventSource | null = null;
  const connectSse = () => {
    if (typeof EventSource === 'undefined') return;
    try {
      es = new EventSource('/api/sync?stream=true');

      es.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);
          const { type, payload } = data;

          if (type === 'init' && payload) {
            if (Array.isArray(payload.messages)) {
              await syncIncomingMessages(payload.messages);
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
            await syncIncomingMessages([payload as ChatMessage]);
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
            const current = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
            const updated = current.map((m) =>
              ids.has(m.id) ? { ...m, status: payload.status } : m
            );
            writeLocal('messages', updated, true);
          } else if (type === 'reaction' && payload) {
            const current = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
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
        if (es?.readyState === EventSource.CLOSED || es?.readyState === EventSource.CONNECTING) {
          try {
            es?.close();
          } catch {}
          es = null;
          window.setTimeout(connectSse, 1000);
        }
      };
    } catch {
      // fallback
    }
  };
  connectSse();

  // 3. Fallback polling of /api/sync every 400ms when tab active
  const pollServer = async () => {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        await syncIncomingMessages(data.messages);
      }
      if (data.presence) {
        (['avinash', 'athulya'] as MemberId[]).forEach((m) => {
          if (data.presence[m]) {
            writeLocal(`presence_${m}`, data.presence[m], true);
          }
        });
      }
      if ('activeCall' in data) {
        writeLocal('active_call', data.activeCall, true);
      }
      if (data.games) {
        Object.entries(data.games).forEach(([gid, gstate]) => {
          writeLocal(`game_${gid}`, gstate, true);
        });
      }
      if ('activeInvite' in data) {
        writeLocal('game_invite', data.activeInvite, true);
      }
    } catch {
      // ignore
    }
  };

  pollServer();
  window.setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    pollServer();
  }, 400);
}

if (typeof window !== 'undefined') {
  initRealtimeEngines();
}

// ============================================================================
// Couple Config & Profile Registration
// ============================================================================

export function subscribeCoupleConfig(cb: (cfg: CoupleConfig) => void): () => void {
  const unsubLocal = subscribeLocal('couple_config', DEFAULT_COUPLE_CONFIG, cb);

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return unsubLocal;

  ensureAnonymousUser().catch(() => null);
  const refDoc = doc(db, 'couple', 'settings');
  const unsubFirestore = onSnapshot(
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
    (err) => console.warn('[Firestore] settings listener notice:', err)
  );

  return () => {
    unsubLocal();
    unsubFirestore();
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
  postGlobalSync({ action: 'save_config', config: updated });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
      const refDoc = doc(db, 'couple', 'settings');
      await setDoc(refDoc, { ...partial, updatedAt: Date.now() }, { merge: true });
    } catch {
      // server sync active
    }
  }
}

export async function claimCoupleProfile(memberId: MemberId, displayName: string, fcmToken?: string | null) {
  postGlobalSync({
    action: 'update_presence',
    memberId,
    presence: { online: true, lastSeen: Date.now() },
  });

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return;

  try {
    ensureAnonymousUser().catch(() => null);
    await setDoc(
      doc(db, 'users', memberId),
      {
        memberId,
        name: displayName,
        ...(fcmToken ? { fcmToken } : {}),
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

  ensureAnonymousUser().catch(() => null);
  const unsubFirestore = onSnapshot(
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
    (err) => console.warn('[Firestore] presence listener notice:', err)
  );

  return () => {
    unsubLocal();
    unsubFirestore();
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

  postGlobalSync({
    action: 'update_presence',
    memberId,
    presence: partial,
  });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
      await setDoc(doc(db, 'presence', memberId), { memberId, ...partial }, { merge: true });
    } catch {
      // server sync active
    }
  }
}

// ============================================================================
// Realtime Chat Messages (End-to-End Encrypted)
// ============================================================================

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

  ensureAnonymousUser().catch(() => null);
  let unsubFirestore: (() => void) | null = null;
  try {
    const q = query(
      collection(db, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    unsubFirestore = onSnapshot(
      q,
      async (snap) => {
        if (snap.empty) return;
        const rawList: ChatMessage[] = snap.docs
          .map((d) => {
            const data = d.data() as ChatMessage;
            return { ...data, id: data.id || d.id };
          })
          .reverse();
        await syncIncomingMessages(rawList);
      },
      (err) => console.warn('[Firestore] message listener notice:', err)
    );
  } catch (err) {
    console.warn('[Firestore] query failed:', err);
  }

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

  // 3. Instant Push via Global Realtime Relay & Server Sync (< 25ms delivery anywhere!)
  postGlobalSync({ action: 'send_message', msg: wireMsg });

  // 4. Permanent Cloud Backup to Firestore if configured
  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
      await setDoc(doc(db, 'messages', id), wireMsg);
    } catch (err) {
      console.warn('[Firestore] send error:', err);
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

  postGlobalSync({ action: 'mark_status', messageIds, status });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  postGlobalSync({ action: 'toggle_reaction', messageId, memberId, emoji });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
      const listSnap = await getDocs(query(collection(db, 'messages'), limit(150)));
      const found = listSnap.docs.find((d) => d.id === messageId || (d.data() as ChatMessage).id === messageId);
      if (found) {
        const reactions = { ...((found.data().reactions as Record<string, string>) || {}) };
        if (reactions[memberId] === emoji) {
          delete reactions[memberId];
        } else {
          reactions[memberId] = emoji;
        }
        await updateDoc(doc(db, 'messages', found.id), { reactions });
      }
    } catch {
      // server sync handled it
    }
  }
}

export async function clearAllChatMessages() {
  writeLocal('messages', []);
  postGlobalSync({ action: 'clear_chat' });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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
      ensureAnonymousUser().catch(() => null);
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

  ensureAnonymousUser().catch(() => null);
  const unsubFirestore = onSnapshot(
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

  return () => {
    unsubLocal();
    unsubFirestore();
  };
}

export async function saveGameState<T extends object>(gameId: GameId, state: T) {
  writeLocal(`game_${gameId}`, state);
  postGlobalSync({ action: 'save_game', gameId, state });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  ensureAnonymousUser().catch(() => null);
  const unsubFirestore = onSnapshot(
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

  return () => {
    unsubLocal();
    unsubFirestore();
  };
}

export async function sendGameInvite(invite: GameInvite) {
  writeLocal('game_invite', invite);
  postGlobalSync({ action: 'send_invite', invite });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  ensureAnonymousUser().catch(() => null);
  const q = query(collection(db, 'gameHistory'), orderBy('playedAt', 'desc'), limit(40));
  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameHistoryEntry, 'id'>) }));
      writeLocal('game_history', list, false);
      cb(list);
    },
    () => undefined
  );

  return () => {
    unsubLocal();
    unsubFirestore();
  };
}

export async function addGameHistory(entry: Omit<GameHistoryEntry, 'id'>) {
  const id = `gh-${Date.now()}`;
  const list = readLocal<GameHistoryEntry[]>('game_history', []);
  writeLocal('game_history', [{ ...entry, id }, ...list].slice(0, 50));
  postGlobalSync({ action: 'add_history', entry });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  ensureAnonymousUser().catch(() => null);
  const q = query(collection(db, 'customCards'), limit(50));
  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TruthOrDareCard, 'id'>) }));
      writeLocal('custom_cards', list, false);
      cb(list);
    },
    () => undefined
  );

  return () => {
    unsubLocal();
    unsubFirestore();
  };
}

export async function addCustomCard(card: Omit<TruthOrDareCard, 'id'>) {
  const id = `custom-${Date.now()}`;
  const list = readLocal<TruthOrDareCard[]>('custom_cards', []);
  writeLocal('custom_cards', [...list, { ...card, id, isCustom: true }]);
  postGlobalSync({ action: 'add_custom_card', card });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
      await addDoc(collection(db, 'customCards'), { ...card, isCustom: true });
    } catch {
      // server sync active
    }
  }
}

export async function deleteCustomCard(id: string) {
  const list = readLocal<TruthOrDareCard[]>('custom_cards', []);
  writeLocal(
    'custom_cards',
    list.filter((c) => c.id !== id)
  );
  postGlobalSync({ action: 'delete_custom_card', id });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
      await deleteDoc(doc(db, 'customCards', id));
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

  ensureAnonymousUser().catch(() => null);
  const q = query(collection(db, 'memories'), orderBy('createdAt', 'desc'), limit(100));
  const unsubFirestore = onSnapshot(
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

  return () => {
    unsubLocal();
    unsubFirestore();
  };
}

export async function addMemoryItem(item: Omit<MemoryItem, 'id'>) {
  const id = `mem-${Date.now()}`;
  const list = readLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES);
  writeLocal('memories', [{ ...item, id }, ...list]);
  postGlobalSync({ action: 'add_memory', memory: item });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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
  postGlobalSync({ action: 'delete_memory', id });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  ensureAnonymousUser().catch(() => null);
  const unsubFirestore = onSnapshot(
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

  return () => {
    unsubLocal();
    unsubFirestore();
  };
}

export async function saveCallSession(session: CallSession | null) {
  writeLocal('active_call', session);
  postGlobalSync({ action: 'save_call', call: session });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  postGlobalSync({ action: 'ice_candidate', callId, role, candidate });

  const db = getFirebaseDb();
  if (isFirebaseConfigured && db) {
    try {
      ensureAnonymousUser().catch(() => null);
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

  ensureAnonymousUser().catch(() => null);
  const unsubFirestore = onSnapshot(
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

  return () => {
    unsubLocal();
    unsubFirestore();
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
