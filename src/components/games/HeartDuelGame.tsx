'use client';

import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Flame, Play, Trophy } from 'lucide-react';
import { INITIAL_HEART_DUEL, nowMs } from '@/lib/constants';
import { soundEngine } from '@/lib/audio';
import { addGameHistory, saveGameState, subscribeGameState } from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { HeartDuelState } from '@/types/universe';

interface FloatingTarget {
  id: number;
  x: number;
  y: number;
  glyph: string;
  points: number;
}

export function HeartDuelGame() {
  const { activeMember, partnerId, config, prefs, notifyGameEvent } = useUniverse();
  const [duel, setDuel] = useState<HeartDuelState>(INITIAL_HEART_DUEL);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [myScore, setMyScore] = useState(0);
  const [targets, setTargets] = useState<FloatingTarget[]>([]);
  const scoreRef = useRef(0);
  const duelRef = useRef(duel);

  useEffect(() => {
    duelRef.current = duel;
  }, [duel]);

  useEffect(() => {
    return subscribeGameState<HeartDuelState>('heart-duel', INITIAL_HEART_DUEL, setDuel);
  }, []);

  // Active 20-second arcade loop on this player's device
  useEffect(() => {
    if (!localPlaying || !activeMember) return;

    const spawnHeart = () => {
      const roll = Math.random();
      const glyph = roll > 0.85 ? '💖' : roll > 0.55 ? '🌹' : '💗';
      const points = roll > 0.85 ? 3 : roll > 0.55 ? 2 : 1;
      setTargets((prev) => [
        ...prev.slice(-7),
        {
          id: Date.now() + Math.random(),
          x: 10 + Math.random() * 76,
          y: 12 + Math.random() * 70,
          glyph,
          points,
        },
      ]);
    };

    spawnHeart();
    const spawner = window.setInterval(spawnHeart, 520);
    const countdown = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(spawner);
          window.clearInterval(countdown);
          setLocalPlaying(false);
          setTargets([]);

          const finalScore = scoreRef.current;
          const cur = duelRef.current;
          const nextBest = {
            ...cur.bestScores,
            [activeMember]: Math.max(cur.bestScores[activeMember] || 0, finalScore),
          };
          const nextLive = { ...cur.liveScores, [activeMember]: finalScore };
          const nextFinished = { ...cur.finishedPlayers, [activeMember]: true };
          const bothDone = Boolean(nextFinished.avinash && nextFinished.athulya);
          const nextWins = { ...cur.wins };

          if (bothDone) {
            const av = nextLive.avinash || 0;
            const at = nextLive.athulya || 0;
            if (av > at) nextWins.avinash = (nextWins.avinash || 0) + 1;
            else if (at > av) nextWins.athulya = (nextWins.athulya || 0) + 1;
            soundEngine.playWin(prefs.muteSound);
            confetti({ particleCount: 75, spread: 80 });
            addGameHistory({
              gameId: 'heart-duel',
              gameName: 'Heart Duel',
              winner: av === at ? 'draw' : av > at ? 'avinash' : 'athulya',
              summary: `${config.names.avinash} ${av} vs ${at} ${config.names.athulya}`,
              playedAt: Date.now(),
            }).catch(() => undefined);
          }

          saveGameState<HeartDuelState>('heart-duel', {
            ...cur,
            status: bothDone ? 'finished' : 'playing',
            liveScores: nextLive,
            finishedPlayers: nextFinished,
            bestScores: nextBest,
            wins: nextWins,
            updatedAt: Date.now(),
          }).catch(() => undefined);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(spawner);
      window.clearInterval(countdown);
    };
  }, [localPlaying, activeMember, config.names, prefs.muteSound]);

  if (!activeMember || !partnerId) return null;

  const startMyRound = async (resetMatch: boolean) => {
    scoreRef.current = 0;
    setMyScore(0);
    setTimeLeft(20);
    setLocalPlaying(true);

    const base: HeartDuelState = resetMatch
      ? {
          ...duel,
          status: 'playing',
          roundId: `hd-${Date.now()}`,
          startedAt: Date.now(),
          liveScores: { avinash: 0, athulya: 0 },
          finishedPlayers: {},
          updatedAt: Date.now(),
        }
      : {
          ...duel,
          status: 'playing',
          updatedAt: Date.now(),
        };

    await saveGameState('heart-duel', base);
    if (resetMatch) {
      notifyGameEvent('heart-duel', `${config.names[activeMember]} challenged you to Heart Duel!`);
    }
  };

  const hitHeart = (target: FloatingTarget) => {
    soundEngine.playHeartPop(prefs.muteSound);
    const next = scoreRef.current + target.points;
    scoreRef.current = next;
    setMyScore(next);
    setTargets((prev) => prev.filter((t) => t.id !== target.id));
    saveGameState('heart-duel', {
      ...duelRef.current,
      liveScores: { ...duelRef.current.liveScores, [activeMember]: next },
      updatedAt: nowMs(),
    }).catch(() => undefined);
  };

  const myFinished = Boolean(duel.finishedPlayers[activeMember]);

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-romantic italic text-2xl sm:text-3xl text-white">Heart Duel</h3>
          <p className="text-xs text-pink-200/70">
            20-second tap frenzy • Catch hearts (💗+1, 🌹+2, 💖+3)
          </p>
        </div>

        <div className="rounded-2xl bg-amber-500/15 border border-amber-400/30 px-3.5 py-2 text-xs text-amber-200 flex items-center gap-1.5">
          <Trophy className="h-4 w-4" />
          <span>
            Best: {duel.bestScores.avinash} vs {duel.bestScores.athulya}
          </span>
        </div>
      </div>

      {/* Live Scoreboard */}
      <div className="grid grid-cols-3 items-center gap-2 rounded-2xl bg-black/35 border border-white/10 p-3.5 text-center">
        <div>
          <p className="text-[11px] text-pink-200/70">{config.names.avinash} 💗</p>
          <p className="text-2xl font-bold text-white">{duel.liveScores.avinash}</p>
          <p className="text-[10px] text-pink-300/70">Wins: {duel.wins.avinash}</p>
        </div>
        <div className="text-xs font-semibold uppercase tracking-widest text-pink-300">
          {localPlaying ? `${timeLeft}s` : 'VS'}
        </div>
        <div>
          <p className="text-[11px] text-rose-200/70">{config.names.athulya} 🌹</p>
          <p className="text-2xl font-bold text-white">{duel.liveScores.athulya}</p>
          <p className="text-[10px] text-rose-300/70">Wins: {duel.wins.athulya}</p>
        </div>
      </div>

      {/* Tap Arena */}
      <div className="relative h-64 sm:h-72 rounded-3xl border border-pink-400/25 bg-gradient-to-b from-pink-950/40 to-black/60 overflow-hidden select-none">
        {localPlaying ? (
          targets.map((t) => (
            <motion.button
              key={t.id}
              type="button"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 1.35 }}
              onClick={() => hitHeart(t)}
              style={{ left: `${t.x}%`, top: `${t.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-3xl sm:text-4xl drop-shadow-[0_0_14px_rgba(236,72,153,0.85)] cursor-pointer p-2"
            >
              {t.glyph}
            </motion.button>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3">
            <Flame className="h-9 w-9 text-pink-400" />
            {myFinished && !duel.finishedPlayers[partnerId] ? (
              <p className="text-sm text-pink-100">
                You scored <span className="font-bold text-pink-300">{myScore}</span>! Waiting for{' '}
                {config.names[partnerId]} to play their 20s round...
              </p>
            ) : duel.status === 'finished' ? (
              <p className="text-sm text-amber-200 font-semibold">
                Round Complete! {duel.liveScores.avinash > duel.liveScores.athulya
                  ? `${config.names.avinash} wins!`
                  : duel.liveScores.athulya > duel.liveScores.avinash
                    ? `${config.names.athulya} wins!`
                    : 'Exact tie!'}
              </p>
            ) : (
              <p className="text-sm text-pink-200/75">
                Tap &ldquo;Start Duel&rdquo; to play your 20-second round and challenge{' '}
                {config.names[partnerId]}!
              </p>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {duel.status === 'playing' && !myFinished && (
                <button
                  type="button"
                  onClick={() => startMyRound(false)}
                  className="accent-gradient-btn rounded-full px-6 py-2.5 text-xs font-semibold text-white flex items-center gap-2"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Play My Turn</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => startMyRound(true)}
                className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-5 py-2.5 text-xs font-semibold text-white flex items-center gap-2 transition"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{duel.status === 'playing' ? 'New Duel Challenge' : 'Start Duel'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

