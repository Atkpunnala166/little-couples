'use client';

import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { RotateCcw, Sparkles } from 'lucide-react';
import { INITIAL_TIC_TAC_TOE, nowMs, PROFILE_META } from '@/lib/constants';
import { soundEngine } from '@/lib/audio';
import { addGameHistory, saveGameState, subscribeGameState } from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { MemberId, TicTacToeState } from '@/types/universe';

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkWinner(board: (MemberId | null)[]): {
  winner: MemberId | 'draw' | null;
  line: number[] | null;
} {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

export function TicTacToeGame() {
  const { activeMember, partnerId, config, prefs, pushToast, notifyGameEvent } = useUniverse();
  const [game, setGame] = React.useState<TicTacToeState>(INITIAL_TIC_TAC_TOE);
  const lastUpdatedRef = useRef<number>(0);

  useEffect(() => {
    return subscribeGameState<TicTacToeState>('tic-tac-toe', INITIAL_TIC_TAC_TOE, (next) => {
      setGame(next);
      if (
        next.updatedAt > lastUpdatedRef.current &&
        lastUpdatedRef.current !== 0 &&
        activeMember &&
        next.lastActionBy &&
        next.lastActionBy !== activeMember
      ) {
        const actorName = config.names[next.lastActionBy];
        if (next.winner === activeMember) {
          soundEngine.playWin(prefs.muteSound);
        } else {
          pushToast({
            title: `💗 ${actorName} made a move`,
            body:
              next.winner === next.lastActionBy
                ? `${actorName} won Round ${next.round} in Tic-Tac-Toe!`
                : 'Your turn in Tic-Tac-Toe!',
            icon: PROFILE_META[next.lastActionBy].emoji,
            targetTab: 'games',
            targetGame: 'tic-tac-toe',
          });
        }
      }
      lastUpdatedRef.current = next.updatedAt;

      if (next.winner && next.winner === activeMember) {
        confetti({
          particleCount: 70,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#ec4899', '#f43f5e', '#fbbf24', '#fbcfe8'],
        });
      }
    });
  }, [activeMember, config.names, prefs.muteSound, pushToast]);

  if (!activeMember || !partnerId) return null;

  const isMyTurn = !game.winner && game.turn === activeMember;

  const handleCellTap = async (idx: number) => {
    if (!isMyTurn || game.board[idx] !== null) return;
    soundEngine.playHeartPop(prefs.muteSound);

    const nextBoard = [...game.board];
    nextBoard[idx] = activeMember;
    const { winner, line } = checkWinner(nextBoard);
    const nextScores = { ...game.scores };
    if (winner === 'avinash' || winner === 'athulya') {
      nextScores[winner] = (nextScores[winner] || 0) + 1;
      soundEngine.playWin(prefs.muteSound);
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.55 },
        colors: ['#ec4899', '#f43f5e', '#fbbf24', '#fbcfe8'],
      });
      await addGameHistory({
        gameId: 'tic-tac-toe',
        gameName: 'Tic-Tac-Toe',
        winner,
        summary: `${config.names[winner]} won Round ${game.round}`,
        playedAt: nowMs(),
      });
    } else if (winner === 'draw') {
      await addGameHistory({
        gameId: 'tic-tac-toe',
        gameName: 'Tic-Tac-Toe',
        winner: 'draw',
        summary: `Round ${game.round} ended in a sweet draw`,
        playedAt: nowMs(),
      });
    }

    const nextState: TicTacToeState = {
      ...game,
      board: nextBoard,
      turn: partnerId,
      winner,
      winningLine: line,
      scores: nextScores,
      lastActionBy: activeMember,
      updatedAt: nowMs(),
    };
    await saveGameState('tic-tac-toe', nextState);
    notifyGameEvent(
      'tic-tac-toe',
      `${config.names[activeMember]} made a move in Tic-Tac-Toe`
    );
  };

  const handleNewRound = async () => {
    const nextStarter: MemberId = game.round % 2 === 1 ? 'athulya' : 'avinash';
    await saveGameState<TicTacToeState>('tic-tac-toe', {
      ...game,
      board: Array(9).fill(null),
      turn: nextStarter,
      winner: null,
      winningLine: null,
      round: game.round + 1,
      lastActionBy: activeMember,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-7 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-romantic italic text-2xl sm:text-3xl text-white">
            Tic-Tac-Toe
          </h3>
          <p className="text-xs text-pink-200/70">
            {config.names.avinash} 💗 vs {config.names.athulya} 🌹 • Round {game.round}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-black/35 border border-white/10 px-3.5 py-2 text-xs">
          <span className="font-semibold text-pink-200">
            💗 {game.scores.avinash}
          </span>
          <span className="text-white/30">:</span>
          <span className="font-semibold text-rose-200">
            {game.scores.athulya} 🌹
          </span>
        </div>
      </div>

      {/* Turn / Result Banner */}
      <div className="rounded-2xl bg-pink-500/10 border border-pink-400/25 px-4 py-3 text-center">
        {game.winner === 'draw' ? (
          <p className="text-sm font-semibold text-amber-200">
            It&apos;s a tie! Both hearts shine equally ✨
          </p>
        ) : game.winner ? (
          <p className="text-sm font-semibold text-pink-100 flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span>
              {config.names[game.winner]} {PROFILE_META[game.winner].emoji} wins this round!
            </span>
          </p>
        ) : (
          <p className="text-sm font-medium text-pink-100">
            {isMyTurn ? (
              <span className="text-pink-300 font-semibold">
                Your turn ({PROFILE_META[activeMember].emoji}) — tap any empty tile!
              </span>
            ) : (
              <span className="text-pink-200/75">
                Waiting for {config.names[game.turn]} ({PROFILE_META[game.turn].emoji})...
              </span>
            )}
          </p>
        )}
      </div>

      {/* 3x3 Board */}
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {game.board.map((cell, idx) => {
          const isWinningCell = game.winningLine?.includes(idx);
          const canTap = isMyTurn && cell === null;
          return (
            <motion.button
              key={idx}
              type="button"
              disabled={!canTap}
              whileTap={canTap ? { scale: 0.92 } : undefined}
              onClick={() => handleCellTap(idx)}
              className={`aspect-square rounded-2xl flex items-center justify-center text-4xl border transition-all ${
                isWinningCell
                  ? 'bg-gradient-to-br from-pink-500/45 to-amber-400/35 border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.5)]'
                  : cell
                    ? 'bg-white/10 border-pink-400/30'
                    : canTap
                      ? 'bg-black/35 border-white/15 hover:border-pink-400/50 hover:bg-pink-500/10 cursor-pointer'
                      : 'bg-black/25 border-white/10 cursor-not-allowed opacity-70'
              }`}
            >
              {cell && (
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {PROFILE_META[cell].emoji}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleNewRound}
          className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-5 py-2.5 text-xs font-semibold text-white flex items-center gap-2 transition"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>New Round</span>
        </button>
      </div>
    </div>
  );
}

