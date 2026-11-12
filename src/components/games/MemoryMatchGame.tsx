'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { MEMORY_FALLBACK_SYMBOLS, nowMs, PROFILE_META } from '@/lib/constants';
import { soundEngine } from '@/lib/audio';
import {
  addGameHistory,
  saveGameState,
  subscribeGameState,
  subscribeMemories,
} from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { MemoryCard, MemoryItem, MemoryMatchState } from '@/types/universe';

function buildShuffledDeck(memories: MemoryItem[]): MemoryCard[] {
  const photos = memories.filter((m) => m.imageUrl).slice(0, 6);
  const pairs = MEMORY_FALLBACK_SYMBOLS.map((sym, idx) => {
    const photo = photos[idx];
    return {
      pairId: photo ? `photo-${photo.id}` : sym.pairId,
      label: photo ? photo.title : sym.label,
      emoji: sym.emoji,
      imageUrl: photo?.imageUrl,
    };
  });

  const doubled = [...pairs, ...pairs].map((item, index) => ({
    ...item,
    id: index,
    flipped: false,
    matchedBy: null,
  }));

  for (let i = doubled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
  }
  return doubled.map((c, idx) => ({ ...c, id: idx }));
}

const INITIAL_MEMORY_MATCH: MemoryMatchState = {
  cards: buildShuffledDeck([]),
  flippedIndices: [],
  turn: 'avinash',
  scores: { avinash: 0, athulya: 0 },
  winner: null,
  moves: 0,
  updatedAt: 0,
};

export function MemoryMatchGame() {
  const { activeMember, partnerId, config, prefs, notifyGameEvent } = useUniverse();
  const [game, setGame] = useState<MemoryMatchState>(INITIAL_MEMORY_MATCH);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    const u1 = subscribeGameState<MemoryMatchState>(
      'memory-match',
      INITIAL_MEMORY_MATCH,
      setGame
    );
    const u2 = subscribeMemories(setMemories);
    return () => {
      u1();
      u2();
    };
  }, []);

  if (!activeMember || !partnerId) return null;

  const isMyTurn = !game.winner && game.turn === activeMember;

  const handleFlip = async (index: number) => {
    if (!isMyTurn || locking) return;
    const card = game.cards[index];
    if (!card || card.flipped || card.matchedBy) return;
    if (game.flippedIndices.includes(index)) return;

    soundEngine.playHeartPop(prefs.muteSound);
    const nextCards = game.cards.map((c, i) => (i === index ? { ...c, flipped: true } : c));
    const nextFlipped = [...game.flippedIndices, index];

    if (nextFlipped.length < 2) {
      await saveGameState<MemoryMatchState>('memory-match', {
        ...game,
        cards: nextCards,
        flippedIndices: nextFlipped,
        updatedAt: nowMs(),
      });
      return;
    }

    // Two cards flipped
    const [firstIdx, secondIdx] = nextFlipped;
    const first = nextCards[firstIdx];
    const second = nextCards[secondIdx];
    const isMatch = first.pairId === second.pairId;

    if (isMatch) {
      const matchedCards = nextCards.map((c, i) =>
        i === firstIdx || i === secondIdx ? { ...c, matchedBy: activeMember } : c
      );
      const nextScores = {
        ...game.scores,
        [activeMember]: (game.scores[activeMember] || 0) + 1,
      };
      const allMatched = matchedCards.every((c) => c.matchedBy !== null);
      let winner: MemoryMatchState['winner'] = null;
      if (allMatched) {
        winner =
          nextScores.avinash === nextScores.athulya
            ? 'draw'
            : nextScores.avinash > nextScores.athulya
              ? 'avinash'
              : 'athulya';
        soundEngine.playWin(prefs.muteSound);
        confetti({ particleCount: 80, spread: 80 });
        await addGameHistory({
          gameId: 'memory-match',
          gameName: 'Memory Match',
          winner,
          summary: `${config.names.avinash} ${nextScores.avinash} - ${nextScores.athulya} ${config.names.athulya}`,
          playedAt: nowMs(),
        });
      }

      await saveGameState<MemoryMatchState>('memory-match', {
        ...game,
        cards: matchedCards,
        flippedIndices: [],
        scores: nextScores,
        winner,
        moves: game.moves + 1,
        updatedAt: nowMs(),
      });
    } else {
      setLocking(true);
      await saveGameState<MemoryMatchState>('memory-match', {
        ...game,
        cards: nextCards,
        flippedIndices: nextFlipped,
        moves: game.moves + 1,
        updatedAt: nowMs(),
      });

      window.setTimeout(async () => {
        const resetCards = nextCards.map((c, i) =>
          i === firstIdx || i === secondIdx ? { ...c, flipped: false } : c
        );
        await saveGameState<MemoryMatchState>('memory-match', {
          ...game,
          cards: resetCards,
          flippedIndices: [],
          turn: partnerId,
          moves: game.moves + 1,
          updatedAt: Date.now(),
        });
        notifyGameEvent('memory-match', `Your turn in Memory Match!`);
        setLocking(false);
      }, 950);
    }
  };

  const handleNewGame = async () => {
    await saveGameState<MemoryMatchState>('memory-match', {
      cards: buildShuffledDeck(memories),
      flippedIndices: [],
      turn: 'avinash',
      scores: { avinash: 0, athulya: 0 },
      winner: null,
      moves: 0,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-romantic italic text-2xl sm:text-3xl text-white">
            Couples Memory Match
          </h3>
          <p className="text-xs text-pink-200/70">
            Turn-by-turn matching • Match a pair to keep your turn!
          </p>
        </div>

        <button
          type="button"
          onClick={handleNewGame}
          className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-4 py-2 text-xs font-semibold text-white flex items-center gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Shuffle Deck</span>
        </button>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-black/35 border border-white/10 px-4 py-2.5 text-xs">
        <span className="font-semibold text-pink-200">
          💗 {config.names.avinash}: {game.scores.avinash}
        </span>
        <span className="text-pink-100 font-medium">
          {game.winner
            ? game.winner === 'draw'
              ? 'Sweet Draw!'
              : `${config.names[game.winner]} wins! 🎉`
            : isMyTurn
              ? 'Your Turn ✨'
              : `${config.names[game.turn]}'s Turn`}
        </span>
        <span className="font-semibold text-rose-200">
          {game.scores.athulya} :{config.names.athulya} 🌹
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {game.cards.map((card, idx) => {
          const revealed = card.flipped || card.matchedBy !== null;
          return (
            <motion.button
              key={card.id}
              type="button"
              disabled={!isMyTurn || revealed || locking}
              whileTap={!revealed && isMyTurn ? { scale: 0.94 } : undefined}
              onClick={() => handleFlip(idx)}
              className={`aspect-square rounded-2xl border overflow-hidden flex flex-col items-center justify-center transition-all ${
                card.matchedBy
                  ? 'border-emerald-400/50 bg-emerald-500/15'
                  : revealed
                    ? 'border-pink-400/55 bg-pink-500/20'
                    : isMyTurn
                      ? 'border-white/15 bg-black/40 hover:border-pink-400/45 cursor-pointer'
                      : 'border-white/10 bg-black/30 opacity-75 cursor-not-allowed'
              }`}
            >
              {revealed ? (
                card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUrl}
                    alt={card.label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-center p-1">
                    <span className="text-3xl block">{card.emoji}</span>
                    <span className="text-[10px] text-pink-100/80 block mt-1 truncate max-w-[72px]">
                      {card.label}
                    </span>
                  </div>
                )
              ) : (
                <span className="text-xl text-pink-300/60">
                  {PROFILE_META[game.turn].emoji}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

