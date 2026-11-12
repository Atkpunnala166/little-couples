'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { PROFILE_META } from '@/lib/constants';
import { useUniverse } from '@/context/UniverseContext';
import { MemberId } from '@/types/universe';

export function NameSelectScreen() {
  const { config, loginAs, isCloudConnected } = useUniverse();
  const [selected, setSelected] = useState<MemberId | null>(null);
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasRoomPasscode = Boolean(config.roomPasscode && config.roomPasscode.trim() !== '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setLoading(true);
    const res = await loginAs(selected, password, roomCode);
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Unable to unlock.');
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl text-center space-y-3 mb-8"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-400/25 bg-pink-500/10 px-4 py-1.5 text-xs font-medium text-pink-200/90 backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          <span>Our Little Universe • Private Sanctuary</span>
        </div>

        <h1 className="font-romantic italic text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight bg-gradient-to-r from-pink-100 via-pink-300 to-amber-200 bg-clip-text text-transparent pb-1">
          Who&apos;s here tonight?
        </h1>
        <p className="text-sm sm:text-base text-pink-100/65 max-w-md mx-auto">
          Choose your star in our private sky and enter your secret key to step inside.
        </p>
      </motion.div>

      {/* Two Big Profile Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl">
        {(['avinash', 'athulya'] as MemberId[]).map((id, idx) => {
          const meta = PROFILE_META[id];
          const isSelected = selected === id;
          return (
            <motion.button
              key={id}
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.08 }}
              whileHover={{ y: -4, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setSelected(id);
                setError('');
                setPassword('');
              }}
              className={`group relative overflow-hidden rounded-3xl p-6 sm:p-8 text-left transition-all duration-300 glass-card ${
                isSelected
                  ? 'ring-2 ring-pink-400 shadow-[0_0_45px_-8px_rgba(236,72,153,0.65)]'
                  : 'hover:border-pink-400/40'
              }`}
            >
              <div
                className={`absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br ${meta.accent} opacity-20 blur-2xl group-hover:opacity-35 transition-opacity`}
              />
              <div className="relative flex flex-col items-center text-center space-y-4">
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.accent} text-4xl shadow-lg shadow-pink-950/50`}
                >
                  {meta.emoji}
                </div>
                <div>
                  <h2 className="font-romantic italic text-3xl text-white flex items-center justify-center gap-2">
                    <span>{config.names[id]}</span>
                    <span className="text-2xl not-italic">{meta.emoji}</span>
                  </h2>
                  <p className="mt-1.5 text-xs text-pink-200/65">{meta.tagline}</p>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition ${
                    isSelected
                      ? 'bg-pink-500 text-white'
                      : 'bg-white/5 text-pink-200/75 group-hover:bg-pink-500/20'
                  }`}
                >
                  <Lock className="h-3 w-3" />
                  <span>{isSelected ? 'Selected' : 'Tap to unlock'}</span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Password & Room Passcode Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.form
            key={selected}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            onSubmit={handleSubmit}
            className="mt-6 w-full max-w-md glass-card rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{PROFILE_META[selected].emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Unlock as {config.names[selected]}
                  </p>
                  <p className="text-[11px] text-pink-200/60">
                    Protected by your personal key{hasRoomPasscode ? ' & couple passcode' : ''}
                  </p>
                </div>
              </div>
              <ShieldCheck className="h-5 w-5 text-pink-400" />
            </div>

            <div className="space-y-3">
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-300/60" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`${config.names[selected]}'s password`}
                  autoFocus
                  required
                  className="w-full rounded-2xl border border-pink-400/25 bg-black/40 pl-10 pr-11 py-3 text-sm text-white placeholder:text-pink-200/40 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-200/50 hover:text-pink-100 p-1"
                  aria-label="Toggle password visibility"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {hasRoomPasscode && (
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-300/60" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="Shared couple passcode"
                    required
                    className="w-full rounded-2xl border border-amber-400/25 bg-black/40 pl-10 pr-4 py-3 text-sm text-white placeholder:text-pink-200/40 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-rose-300 bg-rose-500/15 border border-rose-400/25 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full accent-gradient-btn rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
            >
              <span>{loading ? 'Entering Our Universe...' : `Enter as ${config.names[selected]}`}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <p className="mt-8 text-[11px] text-pink-200/45 flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${
            isCloudConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
          }`}
        />
        <span>
          {isCloudConnected
            ? 'Firebase Cloud Sync Active'
            : 'Local Multi-Tab Preview Mode (add Firebase keys in .env.local for cloud sync)'}
        </span>
      </p>
    </div>
  );
}

