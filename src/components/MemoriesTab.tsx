'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarHeart, Clock, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { PROFILE_META } from '@/lib/constants';
import {
  addMemoryItem,
  deleteMemoryItem,
  subscribeMemories,
  uploadMediaFile,
} from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { MemoryItem } from '@/types/universe';

function computeCountdown(targetIso: string) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (isNaN(diff) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, arrived: true };
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds, arrived: false };
}

export function MemoriesTab() {
  const { activeMember, config } = useUniverse();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    arrived: false,
  });
  const [daysTogether, setDaysTogether] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState('2026-01-01');
  const [kind, setKind] = useState<'photo' | 'milestone'>('photo');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return subscribeMemories(setMemories);
  }, []);

  useEffect(() => {
    const syncClock = () => {
      setDate(new Date().toISOString().slice(0, 10));
      setDaysTogether(
        Math.max(
          1,
          Math.floor(
            (Date.now() - new Date(config.anniversaryDate + 'T00:00:00').getTime()) / 86400000
          ) + 1
        )
      );
      setCountdown(computeCountdown(config.nextMeetingDate));
    };
    const initTimer = window.setTimeout(syncClock, 0);
    const timer = window.setInterval(() => {
      setCountdown(computeCountdown(config.nextMeetingDate));
    }, 1000);
    return () => {
      window.clearTimeout(initTimer);
      window.clearInterval(timer);
    };
  }, [config.nextMeetingDate, config.anniversaryDate]);

  if (!activeMember) return null;

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (file) {
        imageUrl = await uploadMediaFile(file, 'memories');
      }
      await addMemoryItem({
        title: title.trim(),
        caption: caption.trim(),
        date,
        imageUrl,
        addedBy: activeMember,
        kind: imageUrl ? 'photo' : kind,
        createdAt: Date.now(),
      });
      setTitle('');
      setCaption('');
      setFile(null);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const photos = memories.filter((m) => Boolean(m.imageUrl));

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-6 pt-4 pb-24 md:pb-8 max-w-4xl mx-auto w-full space-y-6">
      {/* Love Vibe Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-pink-500/20 blur-2xl" />
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-pink-300/80">
            <CalendarHeart className="h-4 w-4 text-pink-400" />
            <span>Days Together</span>
          </div>
          <p className="font-romantic italic text-5xl text-white mt-2">
            {daysTogether} <span className="text-2xl not-italic">💗</span>
          </p>
          <p className="text-xs text-pink-200/70 mt-2">
            Since {new Date(config.anniversaryDate + 'T00:00:00').toLocaleDateString()} •{' '}
            {config.names.avinash} &amp; {config.names.athulya}
          </p>
        </div>

        <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl" />
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-200/80">
            <Clock className="h-4 w-4 text-amber-300" />
            <span>{config.nextMeetingTitle}</span>
          </div>
          {countdown.arrived ? (
            <p className="font-romantic italic text-3xl text-amber-200 mt-3">
              Together right now ✨
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 mt-3 text-center">
              {[
                { label: 'Days', val: countdown.days },
                { label: 'Hrs', val: countdown.hours },
                { label: 'Min', val: countdown.minutes },
                { label: 'Sec', val: countdown.seconds },
              ].map((b) => (
                <div
                  key={b.label}
                  className="rounded-2xl bg-black/35 border border-white/10 py-2"
                >
                  <p className="text-xl font-bold text-white">{b.val}</p>
                  <p className="text-[10px] text-pink-200/60">{b.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Memory / Photo Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-romantic italic text-2xl sm:text-3xl text-white">
            Shared Gallery &amp; Timeline
          </h2>
          <p className="text-xs text-pink-200/65">
            Every photo &amp; milestone saved in our little universe
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="accent-gradient-btn rounded-full px-4 py-2.5 text-xs font-semibold text-white flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Add Memory</span>
        </button>
      </div>

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleAddMemory}
          className="glass-card rounded-3xl p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Memory title (e.g. Rainy Evening Coffee)"
              required
              className="rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-pink-200/40 focus:outline-none focus:border-pink-400"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-pink-400"
            />
          </div>
          <textarea
            rows={2}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write the story behind this moment..."
            className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-pink-200/40 focus:outline-none focus:border-pink-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="cursor-pointer rounded-2xl bg-white/10 hover:bg-pink-500/20 border border-white/15 px-4 py-2 text-xs text-pink-100 flex items-center gap-2">
              <ImagePlus className="h-4 w-4" />
              <span>{file ? file.name : 'Attach photo (optional)'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const picked = e.target.files?.[0] || null;
                  setFile(picked);
                  if (picked) setKind('photo');
                }}
                className="hidden"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="accent-gradient-btn rounded-2xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Forever'}
            </button>
          </div>
        </motion.form>
      )}

      {/* Photo Gallery Grid */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-pink-200/65 font-semibold">
            Photo Gallery ({photos.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative overflow-hidden rounded-3xl border border-white/15 bg-black/40 aspect-square"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.imageUrl}
                  alt={photo.title}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
                  <p className="text-xs font-semibold text-white truncate">{photo.title}</p>
                  <p className="text-[10px] text-pink-200/75">{photo.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories Timeline */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-pink-200/65 font-semibold">
          Our Timeline
        </h3>
        <div className="relative pl-6 border-l border-pink-400/25 space-y-4">
          {memories.map((item) => (
            <div key={item.id} className="relative glass-card rounded-3xl p-4 space-y-2">
              <span className="absolute -left-[31px] top-5 h-3.5 w-3.5 rounded-full bg-pink-500 border-2 border-[#16040e] shadow-[0_0_12px_#ec4899]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-pink-300/80 font-medium">
                    {item.date} • Added by {config.names[item.addedBy]}{' '}
                    {PROFILE_META[item.addedBy].emoji}
                  </p>
                  <h4 className="font-romantic italic text-xl text-white mt-0.5">
                    {item.title}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMemoryItem(item.id).catch(() => undefined)}
                  aria-label="Delete memory"
                  className="text-pink-200/40 hover:text-rose-300 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {item.caption && (
                <p className="text-xs sm:text-sm text-pink-100/80 leading-relaxed">
                  {item.caption}
                </p>
              )}
              {item.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="mt-2 max-h-60 w-full object-cover rounded-2xl border border-white/10"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
