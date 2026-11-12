export type MemberId = 'avinash' | 'athulya';

export type AppTab = 'chat' | 'games' | 'memories' | 'settings';

export type ThemeId = 'midnight-rose' | 'sunset' | 'neon-love';

export type MessageStatus = 'sent' | 'delivered' | 'seen';

export type MediaType = 'text' | 'image' | 'gif' | 'voice' | 'call-log' | 'miss-you';

export interface ReplyReference {
  id: string;
  senderId: MemberId;
  senderName: string;
  text: string;
  mediaType?: MediaType;
}

export interface ChatMessage {
  id: string;
  senderId: MemberId;
  senderName: string;
  text: string;
  mediaType: MediaType;
  mediaUrl?: string;
  voiceDuration?: number;
  createdAt: number; // Unix ms
  status: MessageStatus;
  replyTo?: ReplyReference | null;
  reactions?: Partial<Record<MemberId, string>>;
}

export interface MemberPresence {
  memberId: MemberId;
  online: boolean;
  lastSeen: number;
  typing: boolean;
  missYouAt?: number;
  fcmToken?: string;
}

export interface CoupleConfig {
  names: Record<MemberId, string>;
  namesEditedOnce: Record<MemberId, boolean>;
  passwords: Record<MemberId, string>;
  roomPasscode: string; // Optional shared couple passcode (empty string = disabled)
  anniversaryDate: string; // YYYY-MM-DD
  nextMeetingDate: string; // YYYY-MM-DDTHH:mm
  nextMeetingTitle: string;
  theme: ThemeId;
  memberUids?: Partial<Record<MemberId, string | null>>;
  updatedAt?: number;
}

export interface LocalPreferences {
  muteSound: boolean;
  muteNotifications: boolean;
  lofiMusic: boolean;
  theme: ThemeId;
}

export interface InAppToast {
  id: string;
  title: string;
  body: string;
  icon: string;
  targetTab: AppTab;
  targetGame?: GameId;
  createdAt: number;
}

export type GameId =
  | 'tic-tac-toe'
  | 'heart-duel'
  | 'truth-or-dare'
  | 'love-quiz'
  | 'memory-match';

export interface TicTacToeState {
  board: (MemberId | null)[];
  turn: MemberId;
  winner: MemberId | 'draw' | null;
  winningLine: number[] | null;
  round: number;
  scores: Record<MemberId, number>;
  updatedAt: number;
  lastActionBy?: MemberId;
}

export interface HeartDuelState {
  status: 'idle' | 'playing' | 'finished';
  roundId: string;
  startedAt: number;
  durationSec: number;
  liveScores: Record<MemberId, number>;
  finishedPlayers: Partial<Record<MemberId, boolean>>;
  bestScores: Record<MemberId, number>;
  wins: Record<MemberId, number>;
  updatedAt: number;
}

export interface TruthOrDareCard {
  id: string;
  type: 'truth' | 'dare';
  spice: 'sweet' | 'deep' | 'playful';
  prompt: string;
  isCustom?: boolean;
  addedBy?: MemberId;
}

export interface TruthOrDareState {
  currentCard: TruthOrDareCard | null;
  drawnBy: MemberId | null;
  targetPlayer: MemberId | null;
  cardIndex: number;
  completedCount: number;
  updatedAt: number;
}

export interface LoveQuizState {
  status: 'answering' | 'guessing' | 'results';
  questionIndex: number;
  // Each player records their own true answer (index 0-3) per question
  selfAnswers: Record<MemberId, Record<number, number>>;
  // Each player guesses the partner's answer (index 0-3) per question
  guesses: Record<MemberId, Record<number, number>>;
  readyForNext: Partial<Record<MemberId, boolean>>;
  updatedAt: number;
}

export interface MemoryCard {
  id: number;
  pairId: string;
  label: string;
  emoji: string;
  imageUrl?: string;
  flipped: boolean;
  matchedBy: MemberId | null;
}

export interface MemoryMatchState {
  cards: MemoryCard[];
  flippedIndices: number[];
  turn: MemberId;
  scores: Record<MemberId, number>;
  winner: MemberId | 'draw' | null;
  moves: number;
  updatedAt: number;
}

export interface GameInvite {
  id: string;
  gameId: GameId;
  from: MemberId;
  createdAt: number;
  accepted?: boolean;
}

export interface GameHistoryEntry {
  id: string;
  gameId: GameId;
  gameName: string;
  winner: MemberId | 'draw';
  summary: string;
  playedAt: number;
}

export interface MemoryItem {
  id: string;
  title: string;
  caption: string;
  date: string; // YYYY-MM-DD
  imageUrl?: string;
  addedBy: MemberId;
  kind: 'photo' | 'milestone';
  createdAt: number;
}

export interface CallSession {
  id: string;
  callerId: MemberId;
  calleeId: MemberId;
  mode: 'video' | 'audio';
  status: 'ringing' | 'connected' | 'ended' | 'declined';
  offer?: { type: RTCSdpType; sdp: string };
  answer?: { type: RTCSdpType; sdp: string };
  createdAt: number;
  connectedAt?: number;
  endedAt?: number;
}
