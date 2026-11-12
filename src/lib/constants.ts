import {
  CoupleConfig,
  GameId,
  HeartDuelState,
  LoveQuizState,
  MemberId,
  MemoryItem,
  ThemeId,
  TicTacToeState,
  TruthOrDareCard,
  TruthOrDareState,
} from '@/types/universe';

export const PROFILE_META: Record<
  MemberId,
  { emoji: string; tagline: string; accent: string; badge: string }
> = {
  avinash: {
    emoji: '💗',
    tagline: 'Her safe place & favorite notification',
    accent: 'from-pink-500 via-rose-500 to-fuchsia-600',
    badge: '💗',
  },
  athulya: {
    emoji: '🌹',
    tagline: 'His moonlight, muse & whole universe',
    accent: 'from-rose-500 via-pink-500 to-amber-400',
    badge: '🌹',
  },
};

export const DEFAULT_COUPLE_CONFIG: CoupleConfig = {
  names: {
    avinash: 'Avinash',
    athulya: 'Athulya',
  },
  namesEditedOnce: {
    avinash: false,
    athulya: false,
  },
  passwords: {
    avinash: 'Avi123',
    athulya: 'Sree123',
  },
  roomPasscode: process.env.NEXT_PUBLIC_DEFAULT_ROOM_PASSCODE || '',
  anniversaryDate: '2025-02-14',
  nextMeetingDate: '2026-12-25T19:00',
  nextMeetingTitle: 'Our Next Date Night',
  theme: 'midnight-rose',
};

export const THEMES: Record<
  ThemeId,
  {
    name: string;
    subtitle: string;
    swatch: string;
    bgPrimary: string;
    bgSecondary: string;
    accentGlow: string;
  }
> = {
  'midnight-rose': {
    name: 'Midnight Rose',
    subtitle: 'Deep wine, velvet rose & warm gold',
    swatch: 'linear-gradient(135deg, #2b0717, #ec4899, #f59e0b)',
    bgPrimary: '#080205',
    bgSecondary: '#1f0612',
    accentGlow: 'rgba(236, 72, 153, 0.25)',
  },
  sunset: {
    name: 'Sunset',
    subtitle: 'Amber dusk, coral blush & twilight plum',
    swatch: 'linear-gradient(135deg, #26091b, #f97316, #f43f5e)',
    bgPrimary: '#0c0407',
    bgSecondary: '#2a0d16',
    accentGlow: 'rgba(249, 115, 22, 0.24)',
  },
  'neon-love': {
    name: 'Neon Love',
    subtitle: 'Electric magenta, violet aura & starlight',
    swatch: 'linear-gradient(135deg, #130428, #e879f9, #38bdf8)',
    bgPrimary: '#060212',
    bgSecondary: '#1b0636',
    accentGlow: 'rgba(232, 121, 249, 0.28)',
  },
};

export const QUICK_REACTIONS = ['❤️', '💗', '🥰', '🌹', '😘', '🔥', '🥹', '✨'];

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Love & Hearts',
    emojis: ['❤️', '💗', '💖', '💘', '💝', '💞', '💓', '🌹', '🥀', '💋', '🫂', '🫶', '💍', '✨'],
  },
  {
    label: 'Sweet & Soft',
    emojis: ['🥰', '😍', '😘', '🥹', '🥺', '😊', '🤭', '😌', '🫠', '😴', '🌙', '⭐', '🦋', '🍓'],
  },
  {
    label: 'Playful',
    emojis: ['😜', '😏', '🔥', '🙈', '🙉', '💃', '🕺', '🥂', '🍫', '🎶', '📸', '💌', '🎉', '💫'],
  },
];

// Built-in SVG/animated romantic stickers & GIF-style animated cards (zero broken external links!)
export const ROMANTIC_GIFS: { id: string; label: string; url: string }[] = [
  {
    id: 'gif-hug',
    label: 'Warm Hug',
    url: 'https://media.giphy.com/media/lrr9rHuoJOE0w/giphy.gif',
  },
  {
    id: 'gif-kiss',
    label: 'Blow a Kiss',
    url: 'https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif',
  },
  {
    id: 'gif-heart-eyes',
    label: 'Heart Eyes',
    url: 'https://media.giphy.com/media/26FLdmIp6wJr91JAI/giphy.gif',
  },
  {
    id: 'gif-miss-you',
    label: 'Miss You',
    url: 'https://media.giphy.com/media/14urMYvFxIKEms/giphy.gif',
  },
  {
    id: 'gif-cuddle',
    label: 'Cuddle Time',
    url: 'https://media.giphy.com/media/3oEdv4hwWTzBhWvaU0/giphy.gif',
  },
  {
    id: 'gif-love-you',
    label: 'Love You',
    url: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif',
  },
];

export const GAME_CATALOG: {
  id: GameId;
  title: string;
  subtitle: string;
  emoji: string;
  badge: string;
}[] = [
  {
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    subtitle: '💗 vs 🌹 • Strict live turn order & heart confetti',
    emoji: '💗',
    badge: 'Live Sync',
  },
  {
    id: 'heart-duel',
    title: 'Heart Duel',
    subtitle: '20-sec rapid heart tapping • Avinash vs Athulya',
    emoji: '💘',
    badge: 'Arcade',
  },
  {
    id: 'truth-or-dare',
    title: 'Truth or Dare',
    subtitle: 'Synced couple deck + add your own secret cards',
    emoji: '🃏',
    badge: 'Couples Deck',
  },
  {
    id: 'love-quiz',
    title: 'Love Quiz',
    subtitle: '"How well do you know me?" Answer & guess live',
    emoji: '🔮',
    badge: '2-Phase',
  },
  {
    id: 'memory-match',
    title: 'Memory Match',
    subtitle: 'Turn-by-turn couples photo & moment matching',
    emoji: '📸',
    badge: 'Turn-Based',
  },
];

export const INITIAL_TIC_TAC_TOE: TicTacToeState = {
  board: Array(9).fill(null),
  turn: 'avinash',
  winner: null,
  winningLine: null,
  round: 1,
  scores: { avinash: 0, athulya: 0 },
  updatedAt: 0,
};

export const INITIAL_HEART_DUEL: HeartDuelState = {
  status: 'idle',
  roundId: 'init',
  startedAt: 0,
  durationSec: 20,
  liveScores: { avinash: 0, athulya: 0 },
  finishedPlayers: {},
  bestScores: { avinash: 0, athulya: 0 },
  wins: { avinash: 0, athulya: 0 },
  updatedAt: 0,
};

export const TRUTH_OR_DARE_DECK: TruthOrDareCard[] = [
  {
    id: 'tod-1',
    type: 'truth',
    spice: 'sweet',
    prompt: 'What was the exact moment you realized you were falling for me?',
  },
  {
    id: 'tod-2',
    type: 'dare',
    spice: 'sweet',
    prompt: 'Send me a 10-second voice note whispering three things you adore about me.',
  },
  {
    id: 'tod-3',
    type: 'truth',
    spice: 'deep',
    prompt: 'Which quiet, ordinary memory of us makes you smile whenever you think of it?',
  },
  {
    id: 'tod-4',
    type: 'dare',
    spice: 'playful',
    prompt: 'Send a selfie right now with the most dramatic kiss face you can do.',
  },
  {
    id: 'tod-5',
    type: 'truth',
    spice: 'playful',
    prompt: 'What is one tiny habit of mine that you secretly find irresistibly cute?',
  },
  {
    id: 'tod-6',
    type: 'dare',
    spice: 'sweet',
    prompt: 'Write a 2-line poem about us in the chat right after this card.',
  },
  {
    id: 'tod-7',
    type: 'truth',
    spice: 'deep',
    prompt: 'What is one dream destination or trip you want us to take together next year?',
  },
  {
    id: 'tod-8',
    type: 'dare',
    spice: 'playful',
    prompt: 'Press the "Miss you" button three times in a row and tell me why right now.',
  },
  {
    id: 'tod-9',
    type: 'truth',
    spice: 'sweet',
    prompt: 'Which song immediately reminds you of me every single time it plays?',
  },
  {
    id: 'tod-10',
    type: 'dare',
    spice: 'deep',
    prompt: 'Pick one photo from our Memories or camera roll and share the story behind it.',
  },
  {
    id: 'tod-11',
    type: 'truth',
    spice: 'playful',
    prompt: 'Who usually gets jealous or clingy first, and how do you melt them?',
  },
  {
    id: 'tod-12',
    type: 'dare',
    spice: 'sweet',
    prompt: 'Promise me one spontaneous surprise for the next time we meet in person.',
  },
];

export const INITIAL_TRUTH_OR_DARE: TruthOrDareState = {
  currentCard: TRUTH_OR_DARE_DECK[0],
  drawnBy: null,
  targetPlayer: null,
  cardIndex: 0,
  completedCount: 0,
  updatedAt: 0,
};

export const LOVE_QUIZ_QUESTIONS: {
  id: number;
  question: string;
  options: string[];
}[] = [
  {
    id: 0,
    question: 'My ideal cozy late-night date with you is...',
    options: [
      'Stargazing & deep talks with music',
      'Movie marathon & midnight snacks',
      'A long night drive with no destination',
      'Cooking together & dancing in the kitchen',
    ],
  },
  {
    id: 1,
    question: 'When I miss you the most, what do I crave first?',
    options: [
      'Hearing your voice on a call',
      'A long tight hug that lasts forever',
      'Flooding your chat with sweet texts',
      'Looking through our favorite photos',
    ],
  },
  {
    id: 2,
    question: 'What instantly melts my mood on a rough day?',
    options: [
      'A forehead kiss & quiet reassurance',
      'Surprise comfort food or coffee',
      'Making me laugh until I forget',
      'Listening without trying to fix it',
    ],
  },
  {
    id: 3,
    question: 'Which love language hits me the hardest?',
    options: [
      'Quality undivided time together',
      'Handwritten notes & sweet words',
      'Holding hands & physical closeness',
      'Thoughtful little surprises',
    ],
  },
  {
    id: 4,
    question: 'If we woke up with a free weekend right now, I would pick...',
    options: [
      'A misty hill station cabin',
      'A sunset beach walk & dinner',
      'Staying in bed all morning together',
      'Exploring a new city hand in hand',
    ],
  },
];

export const INITIAL_LOVE_QUIZ: LoveQuizState = {
  status: 'answering',
  questionIndex: 0,
  selfAnswers: { avinash: {}, athulya: {} },
  guesses: { avinash: {}, athulya: {} },
  readyForNext: {},
  updatedAt: 0,
};

export const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-1',
    title: 'The Night Our Universe Began',
    caption: 'The very first spark when two hearts quietly chose each other.',
    date: '2025-02-14',
    addedBy: 'avinash',
    kind: 'milestone',
    createdAt: 1739491200000,
  },
  {
    id: 'mem-2',
    title: 'Late Night Calls Until Sunrise',
    caption: 'Hours felt like minutes, and neither of us wanted to hang up first.',
    date: '2025-05-20',
    addedBy: 'athulya',
    kind: 'milestone',
    createdAt: 1747699200000,
  },
];

export const MEMORY_FALLBACK_SYMBOLS = [
  { pairId: 'rose', label: 'Midnight Rose', emoji: '🌹' },
  { pairId: 'heart', label: 'Twin Hearts', emoji: '💗' },
  { pairId: 'moon', label: 'Moonlight', emoji: '🌙' },
  { pairId: 'sparkle', label: 'Starlight', emoji: '✨' },
  { pairId: 'letter', label: 'Love Note', emoji: '💌' },
  { pairId: 'ring', label: 'Forever', emoji: '💍' },
];

export const nowMs = (): number => Date.now();

