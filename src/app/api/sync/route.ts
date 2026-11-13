import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_COUPLE_CONFIG,
  DEFAULT_MEMORIES,
  INITIAL_HEART_DUEL,
  INITIAL_LOVE_QUIZ,
  INITIAL_TIC_TAC_TOE,
  INITIAL_TRUTH_OR_DARE,
} from '@/lib/constants';
import {
  CallSession,
  ChatMessage,
  CoupleConfig,
  GameHistoryEntry,
  GameInvite,
  MemberId,
  MemberPresence,
  MemoryItem,
  TruthOrDareCard,
} from '@/types/universe';

interface ServerSyncStore {
  messages: ChatMessage[];
  presence: Record<MemberId, MemberPresence>;
  activeCall: CallSession | null;
  iceCandidates: {
    callId: string;
    offerCandidates: RTCIceCandidateInit[];
    answerCandidates: RTCIceCandidateInit[];
  };
  games: Record<string, unknown>;
  activeInvite: GameInvite | null;
  gameHistory: GameHistoryEntry[];
  customCards: TruthOrDareCard[];
  memories: MemoryItem[];
  config: CoupleConfig;
  lastUpdated: number;
}

declare global {
  var __OLU_STORE__: ServerSyncStore | undefined;
  var __OLU_SSE_CLIENTS__: Set<ReadableStreamDefaultController> | undefined;
}

const SEED_CHAT_MESSAGES: ChatMessage[] = [
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

function getStore(): ServerSyncStore {
  if (!global.__OLU_STORE__) {
    global.__OLU_STORE__ = {
      messages: [...SEED_CHAT_MESSAGES],
      presence: {
        avinash: { memberId: 'avinash', online: false, lastSeen: 0, typing: false },
        athulya: { memberId: 'athulya', online: false, lastSeen: 0, typing: false },
      },
      activeCall: null,
      iceCandidates: {
        callId: '',
        offerCandidates: [],
        answerCandidates: [],
      },
      games: {
        'tic-tac-toe': INITIAL_TIC_TAC_TOE,
        'heart-duel': INITIAL_HEART_DUEL,
        'truth-or-dare': INITIAL_TRUTH_OR_DARE,
        'love-quiz': INITIAL_LOVE_QUIZ,
      },
      activeInvite: null,
      gameHistory: [],
      customCards: [],
      memories: [...DEFAULT_MEMORIES],
      config: { ...DEFAULT_COUPLE_CONFIG },
      lastUpdated: Date.now(),
    };
  }
  return global.__OLU_STORE__;
}

function getSseClients(): Set<ReadableStreamDefaultController> {
  if (!global.__OLU_SSE_CLIENTS__) {
    global.__OLU_SSE_CLIENTS__ = new Set();
  }
  return global.__OLU_SSE_CLIENTS__;
}

const encoder = new TextEncoder();

function broadcastEvent(type: string, payload: unknown) {
  const clients = getSseClients();
  const chunk = encoder.encode(
    `data: ${JSON.stringify({ type, payload, timestamp: Date.now() })}\n\n`
  );
  clients.forEach((controller) => {
    try {
      controller.enqueue(chunk);
    } catch {
      clients.delete(controller);
    }
  });
}

export async function GET(req: NextRequest) {
  const store = getStore();
  const url = new URL(req.url);

  // Real-Time Server-Sent Events (SSE) Stream
  if (url.searchParams.get('stream') === 'true') {
    const clients = getSseClients();
    let clientController: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(controller) {
        clientController = controller;
        clients.add(controller);

        // Immediate initial handshake payload
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'init',
              payload: {
                messages: store.messages,
                presence: store.presence,
                activeCall: store.activeCall,
                iceCandidates: store.iceCandidates,
                games: store.games,
                activeInvite: store.activeInvite,
                gameHistory: store.gameHistory,
                customCards: store.customCards,
                memories: store.memories,
                config: store.config,
                lastUpdated: store.lastUpdated,
              },
              timestamp: Date.now(),
            })}\n\n`
          )
        );
      },
      cancel() {
        if (clientController) {
          clients.delete(clientController);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  // Fallback snapshot polling
  const since = Number(url.searchParams.get('since') || '0');

  return NextResponse.json({
    messages: store.messages,
    presence: store.presence,
    activeCall: store.activeCall,
    iceCandidates: store.iceCandidates,
    games: store.games,
    activeInvite: store.activeInvite,
    gameHistory: store.gameHistory,
    customCards: store.customCards,
    memories: store.memories,
    config: store.config,
    serverTime: Date.now(),
    lastUpdated: store.lastUpdated,
    changed: store.lastUpdated > since,
  });
}

export async function POST(req: NextRequest) {
  const store = getStore();
  const body = await req.json().catch(() => null);

  if (!body || !body.action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  store.lastUpdated = Date.now();

  switch (body.action) {
    case 'send_message': {
      const msg: ChatMessage = {
        id: body.msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...body.msg,
        createdAt: body.msg.createdAt || Date.now(),
      };
      store.messages.push(msg);
      if (store.messages.length > 500) {
        store.messages = store.messages.slice(-500);
      }
      // Instant push to all connected partners!
      broadcastEvent('new_message', msg);
      return NextResponse.json({ ok: true, message: msg });
    }

    case 'mark_status': {
      const ids = new Set(body.messageIds || []);
      store.messages = store.messages.map((m) =>
        ids.has(m.id) ? { ...m, status: body.status } : m
      );
      broadcastEvent('mark_status', { messageIds: body.messageIds, status: body.status });
      return NextResponse.json({ ok: true });
    }

    case 'toggle_reaction': {
      store.messages = store.messages.map((m) => {
        if (m.id !== body.messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        if (reactions[body.memberId as MemberId] === body.emoji) {
          delete reactions[body.memberId as MemberId];
        } else {
          reactions[body.memberId as MemberId] = body.emoji;
        }
        return { ...m, reactions };
      });
      broadcastEvent('reaction', {
        messageId: body.messageId,
        memberId: body.memberId,
        emoji: body.emoji,
      });
      return NextResponse.json({ ok: true });
    }

    case 'clear_chat': {
      store.messages = [];
      broadcastEvent('clear_chat', {});
      return NextResponse.json({ ok: true });
    }

    case 'update_presence': {
      const member = body.memberId as MemberId;
      if (member) {
        store.presence[member] = {
          ...store.presence[member],
          ...body.presence,
          memberId: member,
        };
        broadcastEvent('presence', { memberId: member, presence: store.presence[member] });
      }
      return NextResponse.json({ ok: true });
    }

    case 'save_call': {
      store.activeCall = body.call || null;
      if (!body.call || body.call.status === 'ended' || body.call.status === 'declined') {
        store.iceCandidates = { callId: '', offerCandidates: [], answerCandidates: [] };
      } else if (body.call.id && store.iceCandidates.callId !== body.call.id) {
        store.iceCandidates = { callId: body.call.id, offerCandidates: [], answerCandidates: [] };
      }
      broadcastEvent('active_call', store.activeCall);
      return NextResponse.json({ ok: true });
    }

    case 'add_ice': {
      if (store.iceCandidates.callId === body.callId) {
        const role = body.role as 'offerCandidates' | 'answerCandidates';
        if (role === 'offerCandidates') {
          store.iceCandidates.offerCandidates.push(body.candidate);
        } else if (role === 'answerCandidates') {
          store.iceCandidates.answerCandidates.push(body.candidate);
        }
        broadcastEvent('ice_candidate', {
          callId: body.callId,
          role: body.role,
          candidate: body.candidate,
        });
      }
      return NextResponse.json({ ok: true });
    }

    case 'save_game': {
      store.games[body.gameId] = body.state;
      broadcastEvent('game_state', { gameId: body.gameId, state: body.state });
      return NextResponse.json({ ok: true });
    }

    case 'send_invite': {
      store.activeInvite = body.invite || null;
      broadcastEvent('game_invite', store.activeInvite);
      return NextResponse.json({ ok: true });
    }

    case 'add_history': {
      const entry: GameHistoryEntry = {
        id: `gh-${Date.now()}`,
        ...body.entry,
      };
      store.gameHistory.unshift(entry);
      if (store.gameHistory.length > 50) {
        store.gameHistory = store.gameHistory.slice(0, 50);
      }
      broadcastEvent('game_history', entry);
      return NextResponse.json({ ok: true });
    }

    case 'add_custom_card': {
      const card: TruthOrDareCard = {
        id: `custom-${Date.now()}`,
        ...body.card,
        isCustom: true,
      };
      store.customCards.push(card);
      broadcastEvent('custom_card', card);
      return NextResponse.json({ ok: true });
    }

    case 'add_memory': {
      const memory: MemoryItem = {
        id: `mem-${Date.now()}`,
        ...body.memory,
      };
      store.memories.unshift(memory);
      broadcastEvent('memory', memory);
      return NextResponse.json({ ok: true });
    }

    case 'delete_memory': {
      store.memories = store.memories.filter((m) => m.id !== body.id);
      broadcastEvent('delete_memory', { id: body.id });
      return NextResponse.json({ ok: true });
    }

    case 'save_config': {
      store.config = {
        ...store.config,
        ...body.config,
      };
      broadcastEvent('config', store.config);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
