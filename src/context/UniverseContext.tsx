'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_COUPLE_CONFIG,
  GAME_CATALOG,
} from '@/lib/constants';
import {
  isFirebaseConfigured,
  listenForegroundFcm,
  registerFcmPushToken,
} from '@/lib/firebase';
import { soundEngine, vibrateDevice } from '@/lib/audio';
import {
  claimCoupleProfile,
  clearAllChatMessages,
  markMessagesStatus,
  saveCoupleConfig,
  sendChatMessage,
  subscribeActiveCall,
  subscribeCoupleConfig,
  subscribeGameInvite,
  subscribeMessages,
  subscribePresence,
  triggerPartnerPush,
  updatePresence,
} from '@/lib/store';
import {
  AppTab,
  CallSession,
  ChatMessage,
  CoupleConfig,
  GameId,
  GameInvite,
  InAppToast,
  LocalPreferences,
  MemberId,
  MemberPresence,
} from '@/types/universe';

const SESSION_KEY = 'olu_active_profile_session';
const PERSIST_KEY = 'olu_active_profile';
const PREFS_KEY = 'olu_local_prefs';
const UNREAD_DIVIDER_KEY = 'olu_last_read_ts';

const DEFAULT_PREFS: LocalPreferences = {
  muteSound: false,
  muteNotifications: false,
  lofiMusic: false,
  theme: 'midnight-rose',
};

interface UniverseContextValue {
  activeMember: MemberId | null;
  partnerId: MemberId | null;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  selectedGame: GameId | null;
  setSelectedGame: (g: GameId | null) => void;
  config: CoupleConfig;
  updateConfig: (partial: Partial<CoupleConfig>) => Promise<void>;
  prefs: LocalPreferences;
  updatePrefs: (partial: Partial<LocalPreferences>) => void;
  loginAs: (member: MemberId, password: string, roomCode?: string) => Promise<{ ok: boolean; error?: string }>;
  switchProfile: () => void;
  partnerPresence: MemberPresence;
  myPresence: MemberPresence;
  setTyping: (typing: boolean) => void;
  messages: ChatMessage[];
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;
  sendMessage: (payload: Omit<ChatMessage, 'id' | 'senderId' | 'senderName' | 'createdAt' | 'status'>) => Promise<void>;
  clearChat: () => Promise<void>;
  unreadChatCount: number;
  unreadGameCount: number;
  lastReadTimestamp: number;
  toasts: InAppToast[];
  pushToast: (toast: Omit<InAppToast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  missYouBurstKey: number;
  sendMissYou: () => Promise<void>;
  activeInvite: GameInvite | null;
  notifyGameEvent: (gameId: GameId, message: string) => void;
  activeCall: CallSession | null;
  callModalOpen: boolean;
  callLaunchMode: 'video' | 'audio';
  openCallModal: (mode: 'video' | 'audio') => void;
  closeCallModal: () => void;
  fcmToken: string | null;
  enablePushNotifications: () => Promise<boolean>;
  isCloudConnected: boolean;
}

const UniverseContext = createContext<UniverseContextValue | null>(null);

export function UniverseProvider({ children }: { children: React.ReactNode }) {
  const [activeMember, setActiveMember] = useState<MemberId | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTabState] = useState<AppTab>('chat');
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const [config, setConfig] = useState<CoupleConfig>(DEFAULT_COUPLE_CONFIG);
  const [prefs, setPrefs] = useState<LocalPreferences>(DEFAULT_PREFS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(40);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState<MemberPresence>({
    memberId: 'athulya',
    online: false,
    lastSeen: 0,
    typing: false,
  });
  const [myPresence, setMyPresence] = useState<MemberPresence>({
    memberId: 'avinash',
    online: true,
    lastSeen: 0,
    typing: false,
  });
  const [toasts, setToasts] = useState<InAppToast[]>([]);
  const [missYouBurstKey, setMissYouBurstKey] = useState(0);
  const [unreadGameCount, setUnreadGameCount] = useState(0);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [activeInvite, setActiveInvite] = useState<GameInvite | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  const lastSeenMsgIdRef = useRef<string | null>(null);
  const lastMissYouRef = useRef<number>(0);
  const lastInviteIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<AppTab>(activeTab);
  const prefsRef = useRef<LocalPreferences>(prefs);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    prefsRef.current = prefs;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', prefs.theme);
    }
  }, [prefs]);

  // Hydrate saved profile & preferences + register PWA service worker
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      const savedMember = (
        window.sessionStorage.getItem(SESSION_KEY) ||
        window.localStorage.getItem(PERSIST_KEY)
      ) as MemberId | null;
      if (savedMember === 'avinash' || savedMember === 'athulya') {
        setActiveMember(savedMember);
      }
      try {
        const rawPrefs = window.localStorage.getItem(PREFS_KEY);
        if (rawPrefs) {
          setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(rawPrefs) as Partial<LocalPreferences>) });
        }
        const savedReadTs = Number(window.localStorage.getItem(UNREAD_DIVIDER_KEY) || '0');
        if (savedReadTs) setLastReadTimestamp(savedReadTs);
      } catch {
        // ignore
      }
      setHydrated(true);
    }, 0);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'OPEN_FROM_NOTIFICATION') {
          const tab = event.data.data?.tab as AppTab | undefined;
          if (tab) setActiveTabState(tab);
        }
      });
    }

    return () => window.clearTimeout(timer);
  }, []);

  const partnerId: MemberId | null = useMemo(() => {
    if (!activeMember) return null;
    return activeMember === 'avinash' ? 'athulya' : 'avinash';
  }, [activeMember]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<InAppToast, 'id' | 'createdAt'>) => {
      if (prefsRef.current.muteNotifications) return;
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const full: InAppToast = { ...toast, id, createdAt: Date.now() };
      setToasts((prev) => [full, ...prev].slice(0, 3));
      soundEngine.playNotification(prefsRef.current.muteSound);
      vibrateDevice([45, 35, 45]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 3600);
    },
    [dismissToast]
  );

  const setActiveTab = useCallback(
    (tab: AppTab) => {
      setActiveTabState(tab);
      if (tab === 'chat') {
        const now = Date.now();
        setLastReadTimestamp(now);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(UNREAD_DIVIDER_KEY, String(now));
        }
      }
      if (tab === 'games') {
        setUnreadGameCount(0);
      }
    },
    []
  );

  // Subscribe to couple config
  useEffect(() => {
    return subscribeCoupleConfig((cfg) => {
      setConfig(cfg);
      setPrefs((prev) => {
        if (cfg.theme && cfg.theme !== prev.theme) {
          const next = { ...prev, theme: cfg.theme };
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
          }
          return next;
        }
        return prev;
      });
    });
  }, []);

  // Lofi music toggle cleanup
  useEffect(() => {
    soundEngine.toggleLofi(prefs.lofiMusic);
    return () => {
      soundEngine.toggleLofi(false);
    };
  }, [prefs.lofiMusic]);

  // Subscribe to messages
  useEffect(() => {
    if (!activeMember) return;
    return subscribeMessages(messageLimit, (list, hasMore) => {
      setMessages(list);
      setHasMoreMessages(hasMore);

      const latest = list[list.length - 1];
      if (latest && latest.id !== lastSeenMsgIdRef.current) {
        const prevSeen = lastSeenMsgIdRef.current;
        lastSeenMsgIdRef.current = latest.id;

        if (prevSeen !== null && latest.senderId !== activeMember) {
          if (activeTabRef.current !== 'chat') {
            const preview =
              latest.mediaType === 'image'
                ? '📷 Sent a photo'
                : latest.mediaType === 'gif'
                  ? '🎞️ Sent a GIF'
                  : latest.mediaType === 'voice'
                    ? '🎙️ Sent a voice note'
                    : latest.text;
            pushToast({
              title: `💌 ${latest.senderName}`,
              body: preview,
              icon: '💌',
              targetTab: 'chat',
            });
          } else {
            soundEngine.playHeartPop(prefsRef.current.muteSound);
          }
        }
      }

      // Mark incoming partner messages as delivered / seen
      const incoming = list.filter((m) => m.senderId !== activeMember);
      const toDelivered = incoming.filter((m) => m.status === 'sent').map((m) => m.id);
      const toSeen =
        activeTabRef.current === 'chat'
          ? incoming.filter((m) => m.status !== 'seen').map((m) => m.id)
          : [];

      if (toSeen.length) {
        markMessagesStatus(toSeen, 'seen').catch(() => undefined);
      } else if (toDelivered.length) {
        markMessagesStatus(toDelivered, 'delivered').catch(() => undefined);
      }
    });
  }, [activeMember, messageLimit, pushToast]);

  // Also mark messages seen when switching back to chat tab
  useEffect(() => {
    if (!activeMember || activeTab !== 'chat') return;
    const unseen = messages
      .filter((m) => m.senderId !== activeMember && m.status !== 'seen')
      .map((m) => m.id);
    if (unseen.length) {
      markMessagesStatus(unseen, 'seen').catch(() => undefined);
    }
  }, [activeMember, activeTab, messages]);

  // Presence heartbeat + partner presence + miss-you burst listener
  useEffect(() => {
    if (!activeMember || !partnerId) return;

    claimCoupleProfile(activeMember, config.names[activeMember], fcmToken).catch(() => undefined);
    updatePresence(activeMember, { online: true, lastSeen: Date.now(), typing: false }).catch(
      () => undefined
    );

    const heartbeat = window.setInterval(() => {
      updatePresence(activeMember, { online: true, lastSeen: Date.now() }).catch(() => undefined);
    }, 20000);

    const handleVisibility = () => {
      updatePresence(activeMember, {
        online: document.visibilityState === 'visible',
        lastSeen: Date.now(),
        typing: false,
      }).catch(() => undefined);
    };

    const handleUnload = () => {
      updatePresence(activeMember, { online: false, lastSeen: Date.now(), typing: false }).catch(
        () => undefined
      );
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);

    const unsubPartner = subscribePresence(partnerId, (p) => {
      setPartnerPresence(p);
      if (p.missYouAt && p.missYouAt > lastMissYouRef.current) {
        const hadPrev = lastMissYouRef.current !== 0;
        lastMissYouRef.current = p.missYouAt;
        if (hadPrev || Date.now() - p.missYouAt < 10000) {
          setMissYouBurstKey((k) => k + 1);
          soundEngine.playMissYou(prefsRef.current.muteSound);
          vibrateDevice([60, 40, 90]);
          if (activeTabRef.current !== 'chat') {
            pushToast({
              title: `💗 ${config.names[partnerId]} misses you!`,
              body: 'Sending you a shower of hearts right now ✨',
              icon: '💗',
              targetTab: 'chat',
            });
          }
        }
      }
    });

    const unsubSelf = subscribePresence(activeMember, setMyPresence);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      unsubPartner();
      unsubSelf();
    };
  }, [activeMember, partnerId, config.names, fcmToken, pushToast]);

  // Game invite listener
  useEffect(() => {
    if (!activeMember || !partnerId) return;
    return subscribeGameInvite((invite) => {
      setActiveInvite(invite);
      if (invite && invite.from === partnerId && invite.id !== lastInviteIdRef.current) {
        lastInviteIdRef.current = invite.id;
        if (Date.now() - invite.createdAt < 30000) {
          const gameMeta = GAME_CATALOG.find((g) => g.id === invite.gameId);
          setUnreadGameCount((c) => (activeTabRef.current === 'games' ? 0 : c + 1));
          pushToast({
            title: `🎮 ${config.names[partnerId]} invited you!`,
            body: `Join ${gameMeta?.title || 'a game'} together now`,
            icon: gameMeta?.emoji || '🎮',
            targetTab: 'games',
            targetGame: invite.gameId,
          });
        }
      }
    });
  }, [activeMember, partnerId, config.names, pushToast]);

  // Active Video/Voice Call listener
  useEffect(() => {
    if (!activeMember) return;
    return subscribeActiveCall((call) => {
      setActiveCall(call);
      if (call && call.id && call.status === 'ringing' && call.calleeId === activeMember) {
        setCallModalOpen(true);
        soundEngine.startRingtone(prefsRef.current.muteSound);
      } else if (!call || call.status === 'ended' || call.status === 'declined') {
        soundEngine.stopRingtone();
      }
    });
  }, [activeMember]);

  // Foreground FCM listener
  useEffect(() => {
    let unsub: (() => void) | null = null;
    listenForegroundFcm((payload) => {
      pushToast({
        title: payload.title || '💌 Our Little Universe',
        body: payload.body || 'New notification',
        icon: '💌',
        targetTab: (payload.data?.tab as AppTab) || 'chat',
      });
    }).then((fn) => {
      unsub = fn;
    });
    return () => {
      if (unsub) unsub();
    };
  }, [pushToast]);

  const unreadChatCount = useMemo(() => {
    if (!activeMember) return 0;
    return messages.filter((m) => m.senderId !== activeMember && m.status !== 'seen').length;
  }, [messages, activeMember]);

  const loginAs = useCallback(
    async (member: MemberId, password: string, roomCode?: string) => {
      const expectedPassword = config.passwords[member];
      if (password.trim() !== expectedPassword) {
        return { ok: false, error: `Incorrect password for ${config.names[member]}.` };
      }
      if (config.roomPasscode && config.roomPasscode.trim() !== '') {
        if ((roomCode || '').trim() !== config.roomPasscode.trim()) {
          return { ok: false, error: 'Incorrect shared couple passcode.' };
        }
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(SESSION_KEY, member);
        window.localStorage.setItem(PERSIST_KEY, member);
      }
      setActiveMember(member);
      await claimCoupleProfile(member, config.names[member], fcmToken).catch(() => undefined);
      await updatePresence(member, { online: true, lastSeen: Date.now(), typing: false }).catch(
        () => undefined
      );
      return { ok: true };
    },
    [config, fcmToken]
  );

  const switchProfile = useCallback(() => {
    if (activeMember) {
      updatePresence(activeMember, { online: false, lastSeen: Date.now(), typing: false }).catch(
        () => undefined
      );
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(PERSIST_KEY);
    }
    setActiveMember(null);
    setSelectedGame(null);
  }, [activeMember]);

  const updateConfig = useCallback(async (partial: Partial<CoupleConfig>) => {
    await saveCoupleConfig(partial);
  }, []);

  const updatePrefs = useCallback((partial: Partial<LocalPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!activeMember) return;
      updatePresence(activeMember, { typing, lastSeen: Date.now() }).catch(() => undefined);
    },
    [activeMember]
  );

  const sendMessage = useCallback(
    async (
      payload: Omit<ChatMessage, 'id' | 'senderId' | 'senderName' | 'createdAt' | 'status'>
    ) => {
      if (!activeMember) return;
      const senderName = config.names[activeMember];
      await sendChatMessage({
        ...payload,
        senderId: activeMember,
        senderName,
        createdAt: Date.now(),
        status: partnerPresence.online ? 'delivered' : 'sent',
      });
      if (partnerPresence.fcmToken && !partnerPresence.online) {
        triggerPartnerPush(
          partnerPresence.fcmToken,
          `💌 ${senderName}`,
          payload.mediaType === 'text' ? payload.text : `Sent a ${payload.mediaType}`,
          { tab: 'chat' }
        );
      }
    },
    [activeMember, config.names, partnerPresence.online, partnerPresence.fcmToken]
  );

  const clearChat = useCallback(async () => {
    await clearAllChatMessages();
  }, []);

  const loadMoreMessages = useCallback(() => {
    setMessageLimit((c) => c + 35);
  }, []);

  const sendMissYou = useCallback(async () => {
    if (!activeMember || !partnerId) return;
    setMissYouBurstKey((k) => k + 1);
    soundEngine.playMissYou(prefsRef.current.muteSound);
    vibrateDevice([50, 30, 80]);
    await updatePresence(activeMember, { missYouAt: Date.now(), lastSeen: Date.now() });
    await sendMessage({
      text: `Sending you floating hearts — I miss you so much 💗`,
      mediaType: 'miss-you',
    });
    if (partnerPresence.fcmToken) {
      triggerPartnerPush(
        partnerPresence.fcmToken,
        `💗 ${config.names[activeMember]} misses you!`,
        'Open Our Little Universe for a shower of hearts ✨',
        { tab: 'chat' }
      );
    }
  }, [activeMember, partnerId, config.names, partnerPresence.fcmToken, sendMessage]);

  const notifyGameEvent = useCallback(
    (gameId: GameId, message: string) => {
      if (!activeMember) return;
      if (partnerPresence.fcmToken && !partnerPresence.online) {
        triggerPartnerPush(partnerPresence.fcmToken, `🎮 ${config.names[activeMember]}`, message, {
          tab: 'games',
          gameId,
        });
      }
    },
    [activeMember, config.names, partnerPresence.fcmToken, partnerPresence.online]
  );

  const [pendingCallMode, setPendingCallMode] = useState<'video' | 'audio'>('video');

  const openCallModal = useCallback((mode: 'video' | 'audio') => {
    setPendingCallMode(mode);
    setCallModalOpen(true);
  }, []);

  const closeCallModal = useCallback(() => {
    soundEngine.stopRingtone();
    setCallModalOpen(false);
  }, []);

  const enablePushNotifications = useCallback(async () => {
    const token = await registerFcmPushToken();
    if (token && activeMember) {
      setFcmToken(token);
      await updatePresence(activeMember, { fcmToken: token });
      await claimCoupleProfile(activeMember, config.names[activeMember], token);
      return true;
    }
    return false;
  }, [activeMember, config.names]);

  const value: UniverseContextValue = {
    activeMember,
    partnerId,
    activeTab,
    setActiveTab,
    selectedGame,
    setSelectedGame,
    config,
    updateConfig,
    prefs,
    updatePrefs,
    loginAs,
    switchProfile,
    partnerPresence,
    myPresence,
    setTyping,
    messages,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    clearChat,
    unreadChatCount,
    unreadGameCount,
    lastReadTimestamp,
    toasts,
    pushToast,
    dismissToast,
    missYouBurstKey,
    sendMissYou,
    activeInvite,
    notifyGameEvent,
    activeCall,
    callModalOpen,
    callLaunchMode: pendingCallMode,
    openCallModal,
    closeCallModal,
    fcmToken,
    enablePushNotifications,
    isCloudConnected: isFirebaseConfigured,
  };

  if (!hydrated) {
    return (
      <div className="universe-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">💗</div>
          <p className="font-romantic italic text-xl text-pink-200/80">Opening Our Little Universe...</p>
        </div>
      </div>
    );
  }

  return <UniverseContext.Provider value={value}>{children}</UniverseContext.Provider>;
}

export function useUniverse() {
  const ctx = useContext(UniverseContext);
  if (!ctx) throw new Error('useUniverse must be used inside UniverseProvider');
  return ctx;
}
