'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Shuffle, Sparkles } from 'lucide-react';
import {
  INITIAL_TRUTH_OR_DARE,
  PROFILE_META,
  TRUTH_OR_DARE_DECK,
} from '@/lib/constants';
import { soundEngine } from '@/lib/audio';
import {
  addCustomCard,
  addGameHistory,
  saveGameState,
  subscribeCustomCards,
  subscribeGameState,
} from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { TruthOrDareCard, TruthOrDareState } from '@/types/universe';

export function TruthOrDareGame() {
  const { activeMember, partnerId, config, prefs, notifyGameEvent } = useUniverse();
  const [state, setState] = useState<TruthOrDareState>(INITIAL_TRUTH_OR_DARE);
  const [customCards, setCustomCards] = useState<TruthOrDareCard[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<'truth' | 'dare'>('truth');
  const [newSpice, setNewSpice] = useState<'sweet' | 'deep' | 'playful'>('sweet');
  const [newPrompt, setNewPrompt] = useState('');

  useEffect(() => {
    const u1 = subscribeGameState<TruthOrDareState>(
      'truth-or-dare',
      INITIAL_TRUTH_OR_DARE,
      setState
    );
    const u2 = subscribeCustomCards(setCustomCards);
    return () => {
      u1();
      u2();
    };
  }, []);

  const fullDeck = useMemo(
    () => [...TRUTH_OR_DARE_DECK, ...customCards],
    [customCards]
  );

  if (!activeMember || !partnerId) return null;

  const drawCard = async (filterType?: 'truth' | 'dare') => {
    const pool = filterType
      ? fullDeck.filter((c) => c.type === filterType)
      : fullDeck;
    const picked = pool[Math.floor(Math.random() * pool.length)] || fullDeck[0];
    soundEngine.playHeartPop(prefs.muteSound);

    const next: TruthOrDareState = {
      currentCard: picked,
      drawnBy: activeMember,
      targetPlayer: partnerId,
      cardIndex: state.cardIndex + 1,
      completedCount: state.completedCount + 1,
      updatedAt: Date.now(),
    };
    await saveGameState('truth-or-dare', next);
    await addGameHistory({
      gameId: 'truth-or-dare',
      gameName: 'Truth or Dare',
      winner: activeMember,
      summary: `${config.names[activeMember]} drew a ${picked.type.toUpperCase()} card`,
      playedAt: Date.now(),
    });
    notifyGameEvent(
      'truth-or-dare',
      `${config.names[activeMember]} drew a ${picked.type} card for you!`
    );
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrompt.trim()) return;
    await addCustomCard({
      type: newType,
      spice: newSpice,
      prompt: newPrompt.trim(),
      addedBy: activeMember,
    });
    setNewPrompt('');
    setShowAdd(false);
  };

  const card = state.currentCard;

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-romantic italic text-2xl sm:text-3xl text-white">
            Truth or Dare
          </h3>
          <p className="text-xs text-pink-200/70">
            Synced live on both phones • {fullDeck.length} romantic & playful cards
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd((s) => !s)}
          className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-3.5 py-2 text-xs font-medium text-pink-100 flex items-center gap-1.5 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Custom Card</span>
        </button>
      </div>

      {/* Custom card creator */}
      <AnimatePresence>
        {showAdd && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddCustom}
            className="rounded-2xl bg-black/40 border border-pink-400/25 p-4 space-y-3 overflow-hidden"
          >
            <div className="flex flex-wrap gap-2">
              {(['truth', 'dare'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold uppercase ${
                    newType === t
                      ? 'bg-pink-500 text-white'
                      : 'bg-white/10 text-pink-200/70'
                  }`}
                >
                  {t}
                </button>
              ))}
              {(['sweet', 'deep', 'playful'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewSpice(s)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${
                    newSpice === s
                      ? 'bg-amber-400/30 border border-amber-300/50 text-amber-100'
                      : 'bg-white/5 text-pink-200/60'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Write a secret truth or romantic dare for your partner..."
              className="w-full rounded-xl bg-black/50 border border-white/15 p-3 text-sm text-white placeholder:text-pink-200/40 focus:outline-none focus:border-pink-400"
            />
            <button
              type="submit"
              className="accent-gradient-btn rounded-xl px-4 py-2 text-xs font-semibold text-white"
            >
              Save to Couple Deck
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Synced Card Display */}
      <AnimatePresence mode="wait">
        {card && (
          <motion.div
            key={`${card.id}-${state.cardIndex}`}
            initial={{ opacity: 0, rotateY: -20, scale: 0.95 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="rounded-3xl border border-pink-400/35 bg-gradient-to-br from-rose-950/75 via-pink-950/60 to-amber-950/40 p-6 sm:p-8 text-center space-y-4 shadow-[0_18px_45px_-12px_rgba(236,72,153,0.45)]"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-pink-500/25 border border-pink-300/35 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-pink-100">
                {card.type}
              </span>
              <span className="rounded-full bg-amber-400/15 border border-amber-300/30 px-3 py-1 text-[11px] capitalize text-amber-200">
                {card.spice}
              </span>
            </div>

            <p className="font-romantic italic text-2xl sm:text-3xl text-white leading-snug max-w-lg mx-auto">
              &ldquo;{card.prompt}&rdquo;
            </p>

            {state.drawnBy && state.targetPlayer && (
              <p className="text-xs text-pink-200/70 flex items-center justify-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>
                  Drawn by {config.names[state.drawnBy]} {PROFILE_META[state.drawnBy].emoji} for{' '}
                  {config.names[state.targetPlayer]} {PROFILE_META[state.targetPlayer].emoji}
                </span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Draw Controls */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => drawCard('truth')}
          className="rounded-2xl bg-white/10 hover:bg-pink-500/25 border border-white/15 py-3 text-xs sm:text-sm font-semibold text-white transition"
        >
          Draw Truth
        </button>
        <button
          type="button"
          onClick={() => drawCard()}
          className="accent-gradient-btn rounded-2xl py-3 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-1.5"
        >
          <Shuffle className="h-4 w-4" />
          <span>Surprise</span>
        </button>
        <button
          type="button"
          onClick={() => drawCard('dare')}
          className="rounded-2xl bg-white/10 hover:bg-rose-500/25 border border-white/15 py-3 text-xs sm:text-sm font-semibold text-white transition"
        >
          Draw Dare
        </button>
      </div>
    </div>
  );
}

