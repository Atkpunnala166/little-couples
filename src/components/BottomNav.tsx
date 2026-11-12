'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Gamepad2,
  HeartHandshake,
  MessageCircleHeart,
  Music,
  Settings,
} from 'lucide-react';
import { PROFILE_META } from '@/lib/constants';
import { useUniverse } from '@/context/UniverseContext';
import { AppTab } from '@/types/universe';

export function BottomNav() {
  const {
    activeMember,
    activeTab,
    setActiveTab,
    config,
    unreadChatCount,
    unreadGameCount,
    prefs,
    updatePrefs,
    switchProfile,
  } = useUniverse();

  const [daysTogether, setDaysTogether] = useState(1);

  useEffect(() => {
    const updateDays = () => {
      setDaysTogether(
        Math.max(
          1,
          Math.floor(
            (Date.now() - new Date(config.anniversaryDate + 'T00:00:00').getTime()) / 86400000
          ) + 1
        )
      );
    };
    const t = window.setTimeout(updateDays, 0);
    const interval = window.setInterval(updateDays, 60000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
  }, [config.anniversaryDate]);

  if (!activeMember) return null;

  const navItems: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'chat',
      label: 'Chat',
      icon: <MessageCircleHeart className="h-5 w-5" />,
      badge: unreadChatCount,
    },
    {
      id: 'games',
      label: 'Games',
      icon: <Gamepad2 className="h-5 w-5" />,
      badge: unreadGameCount,
    },
    {
      id: 'memories',
      label: 'Memories',
      icon: <HeartHandshake className="h-5 w-5" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  return (
    <>
      {/* Desktop Left Glass Rail */}
      <aside className="hidden md:flex flex-col justify-between w-64 shrink-0 glass-card rounded-3xl p-5 my-4 ml-4">
        <div className="space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-pink-300/60">Private Space</p>
            <h1 className="font-romantic italic text-2xl text-white mt-0.5">
              Our Little Universe
            </h1>
            <div className="mt-3 rounded-2xl bg-pink-500/10 border border-pink-400/20 px-3.5 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-pink-200/70">Together for</p>
                <p className="text-base font-bold text-pink-100">{daysTogether} days 💗</p>
              </div>
              <span className="text-xl">{PROFILE_META[activeMember].emoji}</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active ? 'text-white' : 'text-pink-200/65 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="desktopNavPill"
                      className="absolute inset-0 rounded-2xl bg-gradient-to-r from-pink-500/35 to-fuchsia-600/25 border border-pink-400/30"
                      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badge ? (
                    <span className="relative min-w-5 h-5 px-1.5 rounded-full bg-pink-500 text-[11px] font-bold text-white flex items-center justify-center shadow-[0_0_12px_rgba(236,72,153,0.8)]">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2.5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => updatePrefs({ lofiMusic: !prefs.lofiMusic })}
            className={`w-full flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs font-medium border transition ${
              prefs.lofiMusic
                ? 'bg-pink-500/20 border-pink-400/40 text-pink-100'
                : 'bg-white/5 border-white/10 text-pink-200/70 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Music className={`h-4 w-4 ${prefs.lofiMusic ? 'animate-pulse text-pink-300' : ''}`} />
              <span>Lofi Love Radio</span>
            </span>
            <span>{prefs.lofiMusic ? 'ON' : 'OFF'}</span>
          </button>

          <div className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/10 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {PROFILE_META[activeMember].emoji} {config.names[activeMember]}
              </p>
              <p className="text-[10px] text-pink-200/55">Signed in</p>
            </div>
            <button
              type="button"
              onClick={switchProfile}
              title="Switch profile"
              className="rounded-xl bg-white/10 hover:bg-pink-500/25 px-2.5 py-1.5 text-[11px] text-pink-100 flex items-center gap-1 transition"
            >
              <ArrowLeftRight className="h-3 w-3" />
              <span>Switch</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Floating Glass Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-md glass-card rounded-3xl px-2 py-1.5 flex items-center justify-around">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-1.5 text-[11px] font-medium transition ${
                  active ? 'text-white' : 'text-pink-200/60'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="mobileNavPill"
                    className="absolute inset-0 rounded-2xl bg-gradient-to-b from-pink-500/30 to-rose-600/20 border border-pink-400/30"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">
                  {item.icon}
                  {item.badge ? (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 h-4 px-1 rounded-full bg-pink-500 text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_10px_#ec4899]">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
