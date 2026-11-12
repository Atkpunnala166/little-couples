'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useUniverse } from '@/context/UniverseContext';

export function TopToast() {
  const { toasts, dismissToast, setActiveTab, setSelectedGame } = useUniverse();

  return (
    <div className="pointer-events-none fixed top-3 left-0 right-0 z-50 flex flex-col items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={() => {
              setActiveTab(toast.targetTab);
              if (toast.targetGame) {
                setSelectedGame(toast.targetGame);
              }
              dismissToast(toast.id);
            }}
            className="pointer-events-auto cursor-pointer w-full max-w-md rounded-2xl border border-pink-400/35 bg-gradient-to-r from-pink-950/90 via-rose-900/85 to-fuchsia-950/90 px-4 py-3 shadow-[0_12px_36px_-8px_rgba(236,72,153,0.65)] backdrop-blur-xl flex items-center gap-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500/25 border border-pink-300/30 text-lg">
              {toast.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-pink-100 truncate">
                {toast.title}
              </p>
              <p className="text-xs text-pink-200/85 truncate">{toast.body}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              className="rounded-full p-1 text-pink-200/70 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

