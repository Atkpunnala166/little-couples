'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BellRing, History, Play, Trophy } from 'lucide-react';
import { GAME_CATALOG, nowMs, PROFILE_META } from '@/lib/constants';
import { sendGameInvite, subscribeGameHistory } from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { GameHistoryEntry, GameId } from '@/types/universe';
import { TicTacToeGame } from './games/TicTacToeGame';
import { HeartDuelGame } from './games/HeartDuelGame';
import { TruthOrDareGame } from './games/TruthOrDareGame';
import { LoveQuizGame } from './games/LoveQuizGame';
import { MemoryMatchGame } from './games/MemoryMatchGame';

export function GamesTab() {
  const {
    activeMember,
    partnerId,
    config,
    selectedGame,
    setSelectedGame,
    activeInvite,
    notifyGameEvent,
    pushToast,
  } = useUniverse();

  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setNowTick(nowMs()), 0);
    const interval = window.setInterval(() => setNowTick(nowMs()), 5000);
    const unsub = subscribeGameHistory(setHistory);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
      unsub();
    };
  }, []);

  const totalWins = useMemo(() => {
    return history.reduce(
      (acc, entry) => {
        if (entry.winner === 'avinash') acc.avinash += 1;
        if (entry.winner === 'athulya') acc.athulya += 1;
        return acc;
      },
      { avinash: 0, athulya: 0 }
    );
  }, [history]);

  if (!activeMember || !partnerId) return null;

  const handlePlayAndInvite = async (gameId: GameId) => {
    const meta = GAME_CATALOG.find((g) => g.id === gameId);
    setSelectedGame(gameId);
    await sendGameInvite({
      id: `inv-${nowMs()}`,
      gameId,
      from: activeMember,
      createdAt: nowMs(),
    });
    notifyGameEvent(
      gameId,
      `${config.names[activeMember]} invited you to play ${meta?.title || 'a game'}!`
    );
    pushToast({
      title: `✨ Invite sent to ${config.names[partnerId]}`,
      body: `Waiting in ${meta?.title || 'game room'}...`,
      icon: meta?.emoji || '🎮',
      targetTab: 'games',
      targetGame: gameId,
    });
  };

  if (selectedGame) {
    return (
      <div className="h-full overflow-y-auto px-3 sm:px-6 pt-3 pb-24 md:pb-8 max-w-4xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelectedGame(null)}
            className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-4 py-2 text-xs font-medium text-white flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All Games</span>
          </button>

          <button
            type="button"
            onClick={() => handlePlayAndInvite(selectedGame)}
            className="rounded-full bg-pink-500/20 hover:bg-pink-500/35 border border-pink-400/35 px-4 py-2 text-xs font-medium text-pink-100 flex items-center gap-1.5 transition"
          >
            <BellRing className="h-3.5 w-3.5" />
            <span>Nudge {config.names[partnerId]}</span>
          </button>
        </div>

        {selectedGame === 'tic-tac-toe' && <TicTacToeGame />}
        {selectedGame === 'heart-duel' && <HeartDuelGame />}
        {selectedGame === 'truth-or-dare' && <TruthOrDareGame />}
        {selectedGame === 'love-quiz' && <LoveQuizGame />}
        {selectedGame === 'memory-match' && <MemoryMatchGame />}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-6 pt-4 pb-24 md:pb-8 max-w-4xl mx-auto w-full space-y-6">
      {/* Header & All-time Win Scoreboard */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-pink-300/70">
            Two-Player Live Arcade
          </p>
          <h2 className="font-romantic italic text-3xl text-white mt-0.5">
            Play Together Live
          </h2>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-black/35 border border-white/10 px-4 py-2.5">
          <Trophy className="h-5 w-5 text-amber-300 shrink-0" />
          <div className="flex items-center gap-3 text-xs">
            <span>
              <strong className="text-pink-200">{config.names.avinash} 💗:</strong>{' '}
              <span className="text-white font-bold">{totalWins.avinash}</span>
            </span>
            <span className="text-white/25">|</span>
            <span>
              <strong className="text-rose-200">{config.names.athulya} 🌹:</strong>{' '}
              <span className="text-white font-bold">{totalWins.athulya}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Active Partner Invite Banner */}
      {activeInvite && activeInvite.from === partnerId && nowTick - activeInvite.createdAt < 120000 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-pink-400/45 bg-gradient-to-r from-pink-600/25 via-rose-600/20 to-amber-500/20 p-4 flex items-center justify-between gap-3 backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{PROFILE_META[partnerId].emoji}</span>
            <div>
              <p className="text-sm font-semibold text-white">
                {config.names[partnerId]} invited you to play!
              </p>
              <p className="text-xs text-pink-100/80">
                {GAME_CATALOG.find((g) => g.id === activeInvite.gameId)?.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedGame(activeInvite.gameId)}
            className="accent-gradient-btn rounded-full px-4 py-2 text-xs font-semibold text-white shrink-0"
          >
            Join Now
          </button>
        </motion.div>
      )}

      {/* 5 Live Couple Games */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GAME_CATALOG.map((g, i) => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-3xl p-5 flex flex-col justify-between gap-4 hover:border-pink-400/40 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-pink-500/20 border border-pink-400/30 flex items-center justify-center text-2xl">
                  {g.emoji}
                </div>
                <div>
                  <h3 className="font-romantic italic text-xl text-white">{g.title}</h3>
                  <p className="text-xs text-pink-200/70 mt-0.5">{g.subtitle}</p>
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-pink-200 shrink-0">
                {g.badge}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePlayAndInvite(g.id)}
                className="flex-1 accent-gradient-btn rounded-2xl py-2.5 text-xs font-semibold text-white flex items-center justify-center gap-1.5 hover:brightness-110 transition"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Play &amp; Invite {config.names[partnerId]}</span>
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Permanent Game History */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-pink-200">
          <History className="h-4 w-4 text-pink-300" />
          <h3 className="text-sm font-semibold">Saved Game History</h3>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-pink-200/60">
            Play your first game together — every win &amp; sweet moment stays saved here forever.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {history.slice(0, 15).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/10 px-3.5 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-white">{item.gameName}:</span>{' '}
                  <span className="text-pink-100/80">{item.summary}</span>
                </div>
                <span className="text-[10px] text-pink-200/50 shrink-0 ml-2">
                  {new Date(item.playedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

