'use client';

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUniverse } from '@/context/UniverseContext';

const AMBIENT_PARTICLES = [
  { id: 1, x: '8%', y: '18%', size: 14, char: '💗', delay: 0, dur: 9 },
  { id: 2, x: '22%', y: '72%', size: 12, char: '✨', delay: 1.5, dur: 11 },
  { id: 3, x: '45%', y: '14%', size: 10, char: '✦', delay: 0.7, dur: 8 },
  { id: 4, x: '68%', y: '80%', size: 15, char: '🌹', delay: 2.1, dur: 12 },
  { id: 5, x: '86%', y: '26%', size: 13, char: '✨', delay: 1.1, dur: 10 },
  { id: 6, x: '91%', y: '62%', size: 14, char: '💞', delay: 2.8, dur: 11 },
  { id: 7, x: '15%', y: '46%', size: 10, char: '✦', delay: 3.2, dur: 9.5 },
  { id: 8, x: '76%', y: '44%', size: 11, char: '💗', delay: 0.4, dur: 10.5 },
];

export function BackgroundVibe() {
  const { missYouBurstKey } = useUniverse();

  const burstHearts = useMemo(() => {
    if (!missYouBurstKey) return [];
    const glyphs = ['💗', '💖', '🌹', '💘', '✨', '💞', '❤️'];
    return Array.from({ length: 24 }, (_, idx) => ({
      id: `${missYouBurstKey}-${idx}`,
      left: `${5 + ((idx * 37) % 90)}%`,
      glyph: glyphs[idx % glyphs.length],
      delay: (idx % 6) * 0.09,
      duration: 2.2 + (idx % 4) * 0.35,
      scale: 0.9 + (idx % 4) * 0.28,
      drift: ((idx % 2 === 0 ? 1 : -1) * (15 + (idx % 5) * 12)),
    }));
  }, [missYouBurstKey]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      {/* Ambient romantic mesh glow */}
      <div className="universe-bg absolute inset-0 transition-all duration-700" />
      <div className="noise-grain absolute inset-0 opacity-70" />

      {/* Soft floating ambient hearts & sparkles */}
      {AMBIENT_PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0.15, y: 0 }}
          animate={{
            opacity: [0.14, 0.45, 0.14],
            y: [-14, 14, -14],
            x: [-6, 6, -6],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ left: p.x, top: p.y, fontSize: p.size }}
          className="absolute select-none blur-[0.2px]"
        >
          {p.char}
        </motion.div>
      ))}

      {/* "Miss You" floating heart shower triggered live */}
      <AnimatePresence>
        {missYouBurstKey > 0 && (
          <div key={missYouBurstKey} className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
            {burstHearts.map((h) => (
              <motion.div
                key={h.id}
                initial={{ y: '105vh', x: 0, opacity: 0, scale: 0.5 }}
                animate={{
                  y: '-15vh',
                  x: h.drift,
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, h.scale, h.scale * 1.1, 0.8],
                  rotate: [0, h.drift > 0 ? 18 : -18, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: h.duration,
                  delay: h.delay,
                  ease: 'easeOut',
                }}
                style={{ left: h.left }}
                className="absolute text-2xl sm:text-3xl drop-shadow-[0_0_12px_rgba(236,72,153,0.8)]"
              >
                {h.glyph}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

