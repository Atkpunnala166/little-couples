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
// Local Demo / Fallback Channel (BroadcastChannel + localStorage)
// Allows instant multi-tab realtime testing even before Firebase keys are set!
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
  if (subs) subs.forEach((fn) => fn());
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

function writeLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
    notifyLocalKey(key);
    getBroadcast()?.postMessage({ key });
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

// ============================================================================
// Couple Config & Profile Registration
// ============================================================================

export function subscribeCoupleConfig(cb: (cfg: CoupleConfig) => void): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal('couple_config', DEFAULT_COUPLE_CONFIG, cb);
  }

  const refDoc = doc(db, 'couple', 'settings');
  return onSnapshot(refDoc, (snap) => {
    if (!snap.exists()) {
      cb(DEFAULT_COUPLE_CONFIG);
      return;
    }
    const data = snap.data() as Partial<CoupleConfig>;
    cb({
      ...DEFAULT_COUPLE_CONFIG,
      ...data,
      names: { ...DEFAULT_COUPLE_CONFIG.names, ...(data.names || {}) },
      namesEditedOnce: { ...DEFAULT_COUPLE_CONFIG.namesEditedOnce, ...(data.namesEditedOnce || {}) },
      passwords: { ...DEFAULT_COUPLE_CONFIG.passwords, ...(data.passwords || {}) },
    });
  });
}

export async function saveCoupleConfig(partial: Partial<CoupleConfig>) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const current = readLocal('couple_config', DEFAULT_COUPLE_CONFIG);
    writeLocal('couple_config', {
      ...current,
      ...partial,
      names: { ...current.names, ...(partial.names || {}) },
      namesEditedOnce: { ...current.namesEditedOnce, ...(partial.namesEditedOnce || {}) },
      passwords: { ...current.passwords, ...(partial.passwords || {}) },
      updatedAt: Date.now(),
    });
    return;
  }

  await ensureAnonymousUser();
  const refDoc = doc(db, 'couple', 'settings');
  await setDoc(refDoc, { ...partial, updatedAt: Date.now() }, { merge: true });
}

export async function claimCoupleProfile(memberId: MemberId, displayName: string, fcmToken?: string | null) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) return;

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

  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal(`presence_${memberId}`, fallback, cb);
  }

  return onSnapshot(doc(db, 'presence', memberId), (snap) => {
    if (!snap.exists()) {
      cb(fallback);
      return;
    }
    cb({ ...fallback, ...(snap.data() as Partial<MemberPresence>) });
  });
}

export async function updatePresence(memberId: MemberId, partial: Partial<MemberPresence>) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const current = readLocal<MemberPresence>(`presence_${memberId}`, {
      memberId,
      online: false,
      lastSeen: Date.now(),
      typing: false,
    });
    writeLocal(`presence_${memberId}`, { ...current, ...partial, memberId });
    return;
  }

  await setDoc(
    doc(db, 'presence', memberId),
    { memberId, ...partial },
    { merge: true }
  );
}

// ============================================================================
// Realtime Chat Messages (onSnapshot + Infinite Scroll + Reactions + Status)
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
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<ChatMessage[]>('messages', SEED_MESSAGES, (all) => {
      const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
      const hasMore = sorted.length > limitCount;
      cb(sorted.slice(Math.max(0, sorted.length - limitCount)), hasMore);
    });
  }

  const q = query(
    collection(db, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  return onSnapshot(q, (snap) => {
    const list: ChatMessage[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))
      .reverse();
    cb(list, snap.docs.length >= limitCount);
  });
}

export async function sendChatMessage(
  msg: Omit<ChatMessage, 'id'>
): Promise<string> {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const list = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
    writeLocal('messages', [...list, { ...msg, id }]);
    return id;
  }

  const docRef = await addDoc(collection(db, 'messages'), msg);
  return docRef.id;
}

export async function markMessagesStatus(
  messageIds: string[],
  status: 'delivered' | 'seen'
) {
  if (!messageIds.length) return;
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const list = readLocal<ChatMessage[]>('messages', SEED_MESSAGES);
    const idSet = new Set(messageIds);
    const updated = list.map((m) => (idSet.has(m.id) ? { ...m, status } : m));
    writeLocal('messages', updated);
    return;
  }

  const batch = writeBatch(db);
  messageIds.forEach((id) => {
    batch.update(doc(db, 'messages', id), { status });
  });
  await batch.commit();
}

export async function toggleMessageReaction(
  messageId: string,
  memberId: MemberId,
  emoji: string
) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
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
    return;
  }

  // Read current from DOM-provided or update directly
  const listSnap = await getDocs(query(collection(db, 'messages'), limit(200)));
  const found = listSnap.docs.find((d) => d.id === messageId);
  const existing = (found?.data()?.reactions || {}) as Partial<Record<MemberId, string>>;
  const next = { ...existing };
  if (next[memberId] === emoji) {
    delete next[memberId];
  } else {
    next[memberId] = emoji;
  }
  await updateDoc(doc(db, 'messages', messageId), { reactions: next });
}

export async function clearAllChatMessages() {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    writeLocal('messages', []);
    return;
  }

  const snap = await getDocs(collection(db, 'messages'));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
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
  if (!isFirebaseConfigured || !storage) {
    return fileToDataUrl(processed);
  }

  const ext =
    folder === 'voice-notes'
      ? 'webm'
      : fileOrBlob instanceof File && fileOrBlob.name.includes('.')
        ? fileOrBlob.name.split('.').pop()
        : 'jpg';
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, processed);
  return getDownloadURL(storageRef);
}

// ============================================================================
// Live 2-Player Games, Invites, History, Custom Cards
// ============================================================================

export function subscribeGameState<T>(
  gameId: GameId,
  initial: T,
  cb: (state: T) => void
): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal(`game_${gameId}`, initial, cb);
  }

  return onSnapshot(doc(db, 'games', gameId), (snap) => {
    if (!snap.exists()) {
      cb(initial);
      return;
    }
    cb({ ...initial, ...(snap.data() as Partial<T>) });
  });
}

export async function saveGameState<T extends object>(gameId: GameId, state: T) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    writeLocal(`game_${gameId}`, state);
    return;
  }
  await setDoc(doc(db, 'games', gameId), state, { merge: true });
}

export function subscribeGameInvite(cb: (invite: GameInvite | null) => void): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<GameInvite | null>('game_invite', null, cb);
  }

  return onSnapshot(doc(db, 'games', 'activeInvite'), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = snap.data() as GameInvite;
    cb(data?.id ? data : null);
  });
}

export async function sendGameInvite(invite: GameInvite) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    writeLocal('game_invite', invite);
    return;
  }
  await setDoc(doc(db, 'games', 'activeInvite'), invite);
}

export function subscribeGameHistory(cb: (entries: GameHistoryEntry[]) => void): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<GameHistoryEntry[]>('game_history', [], (items) =>
      cb([...items].sort((a, b) => b.playedAt - a.playedAt))
    );
  }

  const q = query(collection(db, 'gameHistory'), orderBy('playedAt', 'desc'), limit(40));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameHistoryEntry, 'id'>) })));
  });
}

export async function addGameHistory(entry: Omit<GameHistoryEntry, 'id'>) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const id = `gh-${Date.now()}`;
    const list = readLocal<GameHistoryEntry[]>('game_history', []);
    writeLocal('game_history', [{ ...entry, id }, ...list].slice(0, 50));
    return;
  }
  await addDoc(collection(db, 'gameHistory'), entry);
}

export function subscribeCustomCards(cb: (cards: TruthOrDareCard[]) => void): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<TruthOrDareCard[]>('custom_cards', [], cb);
  }

  const q = query(collection(db, 'customCards'), limit(50));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TruthOrDareCard, 'id'>) })));
  });
}

export async function addCustomCard(card: Omit<TruthOrDareCard, 'id'>) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const id = `custom-${Date.now()}`;
    const list = readLocal<TruthOrDareCard[]>('custom_cards', []);
    writeLocal('custom_cards', [...list, { ...card, id, isCustom: true }]);
    return;
  }
  await addDoc(collection(db, 'customCards'), { ...card, isCustom: true });
}

// ============================================================================
// Memories & Shared Photo Gallery
// ============================================================================

export function subscribeMemories(cb: (memories: MemoryItem[]) => void): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES, (list) =>
      cb([...list].sort((a, b) => b.date.localeCompare(a.date)))
    );
  }

  const q = query(collection(db, 'memories'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      cb(DEFAULT_MEMORIES);
      return;
    }
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemoryItem, 'id'>) })));
  });
}

export async function addMemoryItem(item: Omit<MemoryItem, 'id'>) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const id = `mem-${Date.now()}`;
    const list = readLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES);
    writeLocal('memories', [{ ...item, id }, ...list]);
    return;
  }
  await addDoc(collection(db, 'memories'), item);
}

export async function deleteMemoryItem(id: string) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const list = readLocal<MemoryItem[]>('memories', DEFAULT_MEMORIES);
    writeLocal(
      'memories',
      list.filter((m) => m.id !== id)
    );
    return;
  }
  await deleteDoc(doc(db, 'memories', id));
}

// ============================================================================
// WebRTC Video / Voice Call Signaling
// ============================================================================

export function subscribeActiveCall(cb: (call: CallSession | null) => void): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<CallSession | null>('active_call', null, cb);
  }

  return onSnapshot(doc(db, 'calls', 'active'), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = snap.data() as CallSession;
    cb(data?.id ? data : null);
  });
}

export async function saveCallSession(session: CallSession | null) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    writeLocal('active_call', session);
    return;
  }
  if (!session) {
    await setDoc(doc(db, 'calls', 'active'), { id: '', status: 'ended', endedAt: Date.now() });
    return;
  }
  await setDoc(doc(db, 'calls', 'active'), session, { merge: true });
}

export async function addIceCandidateSignal(
  callId: string,
  role: 'offerCandidates' | 'answerCandidates',
  candidate: RTCIceCandidateInit
) {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    const key = `ice_${callId}_${role}`;
    const existing = readLocal<RTCIceCandidateInit[]>(key, []);
    writeLocal(key, [...existing, candidate]);
    return;
  }
  await addDoc(collection(db, 'calls', 'active', role), {
    ...candidate,
    callId,
  });
}

export function subscribeIceCandidatesSignal(
  callId: string,
  role: 'offerCandidates' | 'answerCandidates',
  cb: (candidates: RTCIceCandidateInit[]) => void
): () => void {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured || !db) {
    return subscribeLocal<RTCIceCandidateInit[]>(`ice_${callId}_${role}`, [], cb);
  }

  return onSnapshot(collection(db, 'calls', 'active', role), (snap) => {
    const list = snap.docs
      .map((d) => d.data() as RTCIceCandidateInit & { callId?: string })
      .filter((c) => c.callId === callId);
    cb(list);
  });
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
