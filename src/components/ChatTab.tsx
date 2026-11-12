'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeftRight,
  Check,
  CheckCheck,
  Heart,
  Image as ImageIcon,
  Mic,
  Music,
  Phone,
  Reply,
  Search,
  Send,
  Smile,
  Sparkles,
  Square,
  Video,
  X,
} from 'lucide-react';
import {
  EMOJI_GROUPS,
  PROFILE_META,
  QUICK_REACTIONS,
  ROMANTIC_GIFS,
} from '@/lib/constants';
import { toggleMessageReaction, uploadMediaFile } from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { ChatMessage, ReplyReference } from '@/types/universe';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(ts: number) {
  if (!ts) return 'Offline';
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function ChatTab() {
  const {
    activeMember,
    partnerId,
    config,
    partnerPresence,
    setTyping,
    messages,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    lastReadTimestamp,
    sendMissYou,
    openCallModal,
    prefs,
    updatePrefs,
    switchProfile,
  } = useUniverse();

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyReference | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [customGifUrl, setCustomGifUrl] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [showMemoryBanner, setShowMemoryBanner] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [daySeed, setDaySeed] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDaySeed(Math.floor(Date.now() / 86400000));
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);
  const prevMsgCountRef = useRef(0);

  // Auto-scroll when new messages arrive and user is near bottom
  useEffect(() => {
    const container = listRef.current;
    const isNewMessage = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (!container || !isNewMessage) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 260) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  // Deterministic "Memory of the Day" from older chat messages
  const memoryOfDay = useMemo(() => {
    const textMessages = messages.filter(
      (m) => m.mediaType === 'text' && m.text.trim().length > 8
    );
    if (!textMessages.length) return null;
    return textMessages[daySeed % textMessages.length];
  }, [messages, daySeed]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) || m.senderName.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  const firstUnreadIndex = useMemo(() => {
    if (!activeMember || !lastReadTimestamp) return -1;
    return filteredMessages.findIndex(
      (m) => m.senderId !== activeMember && m.createdAt > lastReadTimestamp
    );
  }, [filteredMessages, activeMember, lastReadTimestamp]);

  if (!activeMember || !partnerId) return null;

  const handleTypingChange = (val: string) => {
    setText(val);
    setTyping(val.trim().length > 0);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      setTyping(false);
    }, 1800);
  };

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    setTyping(false);
    setShowEmoji(false);
    const currentReply = replyTo;
    setReplyTo(null);
    await sendMessage({
      text: trimmed,
      mediaType: 'text',
      replyTo: currentReply,
    });
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMediaFile(file, 'chat-media');
      await sendMessage({
        text: file.name || 'Shared a photo',
        mediaType: 'image',
        mediaUrl: url,
        replyTo,
      });
      setReplyTo(null);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSendGif = async (url: string, label: string) => {
    setShowGif(false);
    setCustomGifUrl('');
    await sendMessage({
      text: label,
      mediaType: 'gif',
      mediaUrl: url,
      replyTo,
    });
    setReplyTo(null);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const startVoiceRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      const startedAt = Date.now();
      setRecordSeconds(0);
      setRecording(true);
      recordIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);

      recorder.onstop = async () => {
        if (recordIntervalRef.current) window.clearInterval(recordIntervalRef.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 500) return;
        setUploading(true);
        try {
          const url = await uploadMediaFile(blob, 'voice-notes');
          await sendMessage({
            text: `Voice note (${duration}s)`,
            mediaType: 'voice',
            mediaUrl: url,
            voiceDuration: duration,
            replyTo,
          });
          setReplyTo(null);
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
    } catch {
      alert('Microphone permission is needed to record voice notes.');
    }
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop < 40 && hasMoreMessages) {
      loadMoreMessages();
    }
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(dist > 280);
  };

  const renderTicks = (msg: ChatMessage) => {
    if (msg.senderId !== activeMember) return null;
    if (msg.status === 'seen') {
      return <CheckCheck className="h-3.5 w-3.5 text-pink-200" />;
    }
    if (msg.status === 'delivered') {
      return <CheckCheck className="h-3.5 w-3.5 text-white/60" />;
    }
    return <Check className="h-3.5 w-3.5 text-white/50" />;
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      {/* Top Chat Header */}
      <header className="glass-card rounded-3xl px-4 py-3 mx-2 sm:mx-0 mt-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/35 to-rose-600/35 border border-pink-400/35 text-2xl">
            {PROFILE_META[partnerId].emoji}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#16040e] ${
                partnerPresence.online ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-zinc-500'
              }`}
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-romantic italic text-xl text-white truncate flex items-center gap-1.5">
              <span>{config.names[partnerId]}</span>
            </h2>
            <p className="text-[11px] text-pink-200/70 truncate">
              {partnerPresence.typing ? (
                <span className="text-pink-300 font-medium animate-pulse">typing something sweet...</span>
              ) : partnerPresence.online ? (
                <span className="text-emerald-300/90">Online with you</span>
              ) : (
                `Last seen ${formatLastSeen(partnerPresence.lastSeen)}`
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openCallModal('audio')}
            title="Voice Call"
            className="h-9 w-9 rounded-full bg-white/5 hover:bg-pink-500/20 border border-white/10 text-pink-100 flex items-center justify-center transition"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => openCallModal('video')}
            title="Video Call"
            className="h-9 w-9 rounded-full bg-pink-500/20 hover:bg-pink-500/35 border border-pink-400/35 text-pink-100 flex items-center justify-center transition"
          >
            <Video className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            title="Search Messages"
            className={`h-9 w-9 rounded-full border flex items-center justify-center transition ${
              searchOpen
                ? 'bg-pink-500/30 border-pink-400/45 text-white'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-pink-100'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => updatePrefs({ lofiMusic: !prefs.lofiMusic })}
            title="Toggle Lofi Love Music"
            className={`md:hidden h-9 w-9 rounded-full border flex items-center justify-center transition ${
              prefs.lofiMusic
                ? 'bg-pink-500/30 border-pink-400/45 text-pink-200 animate-pulse'
                : 'bg-white/5 border-white/10 text-pink-100'
            }`}
          >
            <Music className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={switchProfile}
            title="Switch profile"
            className="md:hidden h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-pink-100 flex items-center justify-center transition"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Expandable Search Bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-2 sm:px-0 pt-2 overflow-hidden shrink-0"
          >
            <div className="glass-card rounded-2xl px-3.5 py-2 flex items-center gap-2">
              <Search className="h-4 w-4 text-pink-300/65" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search memories & messages..."
                autoFocus
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder:text-pink-200/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-pink-200/60 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory of the Day Card */}
      <AnimatePresence>
        {showMemoryBanner && memoryOfDay && !searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="px-2 sm:px-0 pt-2 shrink-0"
          >
            <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-rose-500/10 px-3.5 py-2.5 flex items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/80 font-semibold">
                    Memory of the Day • {new Date(memoryOfDay.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-pink-100/90 truncate">
                    &ldquo;{memoryOfDay.text}&rdquo; — {memoryOfDay.senderName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMemoryBanner(false)}
                className="text-pink-200/50 hover:text-white p-1"
                aria-label="Hide memory of the day"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Feed */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3"
      >
        {hasMoreMessages && (
          <div className="text-center pb-2">
            <button
              type="button"
              onClick={loadMoreMessages}
              className="rounded-full bg-white/5 hover:bg-pink-500/20 border border-white/10 px-4 py-1 text-[11px] text-pink-200/80 transition"
            >
              Load older messages
            </button>
          </div>
        )}

        {filteredMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-2">
            <div className="text-4xl">💌</div>
            <p className="font-romantic italic text-xl text-pink-100">
              {searchQuery ? 'No matching messages found' : 'Say something sweet to start'}
            </p>
          </div>
        )}

        {filteredMessages.map((msg, idx) => {
          const isMe = msg.senderId === activeMember;
          const reactions = Object.entries(msg.reactions || {}).filter(([, v]) => Boolean(v));
          const showUnreadDivider = idx === firstUnreadIndex;

          return (
            <React.Fragment key={msg.id}>
              {showUnreadDivider && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-pink-400/50" />
                  <span className="text-[10px] uppercase tracking-widest text-pink-300 font-semibold">
                    New Messages
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-pink-400/50" />
                </div>
              )}

              {msg.mediaType === 'call-log' || msg.mediaType === 'miss-you' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-center py-1"
                >
                  <div className="rounded-full bg-pink-500/15 border border-pink-400/25 px-4 py-1.5 text-xs text-pink-100/90 backdrop-blur-md">
                    <span className="font-medium">{msg.senderName}:</span> {msg.text} •{' '}
                    <span className="text-pink-200/60">{formatTime(msg.createdAt)}</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22 }}
                  className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`relative max-w-[82%] sm:max-w-[70%] rounded-3xl px-4 py-2.5 ${
                      isMe
                        ? 'bubble-me text-white rounded-br-lg'
                        : 'glass-bubble-partner text-pink-50 rounded-bl-lg'
                    }`}
                  >
                    {/* Reply quote inside bubble */}
                    {msg.replyTo && (
                      <div className="mb-2 rounded-2xl bg-black/25 border-l-2 border-pink-300 px-3 py-1.5 text-xs">
                        <p className="font-semibold text-pink-200 text-[10px]">
                          {msg.replyTo.senderName}
                        </p>
                        <p className="text-pink-100/80 truncate">{msg.replyTo.text}</p>
                      </div>
                    )}

                    {/* Media rendering */}
                    {(msg.mediaType === 'image' || msg.mediaType === 'gif') && msg.mediaUrl && (
                      <div className="mb-1.5 overflow-hidden rounded-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.mediaUrl}
                          alt={msg.text}
                          className="max-h-72 w-full object-cover rounded-2xl"
                        />
                      </div>
                    )}

                    {msg.mediaType === 'voice' && msg.mediaUrl && (
                      <div className="flex items-center gap-2 py-1 min-w-[200px]">
                        <audio controls src={msg.mediaUrl} className="h-8 w-48 sm:w-56" />
                      </div>
                    )}

                    {msg.mediaType === 'text' && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                    )}

                    {/* Timestamp + ticks */}
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-white/70">
                      <span>{formatTime(msg.createdAt)}</span>
                      {renderTicks(msg)}
                    </div>

                    {/* Hover / Tap Quick Actions */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 ${
                        isMe ? '-left-16' : '-right-16'
                      } opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setReplyTo({
                            id: msg.id,
                            senderId: msg.senderId,
                            senderName: msg.senderName,
                            text: msg.text,
                            mediaType: msg.mediaType,
                          })
                        }
                        title="Reply"
                        className="h-7 w-7 rounded-full bg-black/50 border border-white/15 text-pink-100 flex items-center justify-center hover:bg-pink-500/40"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReactionTargetId((id) => (id === msg.id ? null : msg.id))
                        }
                        title="React"
                        className="h-7 w-7 rounded-full bg-black/50 border border-white/15 text-pink-100 flex items-center justify-center hover:bg-pink-500/40"
                      >
                        <Heart className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Reaction picker popover */}
                  {reactionTargetId === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-1 flex items-center gap-1 rounded-full glass-card px-2.5 py-1 z-20"
                    >
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            toggleMessageReaction(msg.id, activeMember, emoji).catch(
                              () => undefined
                            );
                            setReactionTargetId(null);
                          }}
                          className="text-base hover:scale-125 transition-transform px-0.5"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}

                  {/* Active reactions under bubble */}
                  {reactions.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 px-1">
                      {reactions.map(([member, emoji]) => (
                        <button
                          key={member}
                          type="button"
                          onClick={() =>
                            toggleMessageReaction(msg.id, activeMember, emoji || '❤️').catch(
                              () => undefined
                            )
                          }
                          className="rounded-full bg-pink-950/80 border border-pink-400/30 px-2 py-0.5 text-xs shadow-sm"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </React.Fragment>
          );
        })}

        <div ref={bottomRef} />

        {/* Jump to bottom floating button */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="sticky bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-pink-600/90 hover:bg-pink-500 text-white px-3.5 py-1.5 text-xs font-medium shadow-lg flex items-center gap-1.5 backdrop-blur-md"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>Latest</span>
          </button>
        )}
      </div>

      {/* Composer Area */}
      <div className="px-2 sm:px-0 pb-20 md:pb-4 pt-1 shrink-0 space-y-2">
        {/* Reply preview bar */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="glass-card rounded-2xl px-4 py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 border-l-2 border-pink-400 pl-2.5">
                <p className="text-[11px] font-semibold text-pink-300">
                  Replying to {replyTo.senderName}
                </p>
                <p className="text-xs text-pink-100/80 truncate">{replyTo.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-pink-200/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emoji Picker Drawer */}
        <AnimatePresence>
          {showEmoji && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="glass-card rounded-3xl p-3.5 space-y-2.5 max-h-56 overflow-y-auto"
            >
              {EMOJI_GROUPS.map((grp) => (
                <div key={grp.label}>
                  <p className="text-[10px] uppercase tracking-wider text-pink-200/55 mb-1">
                    {grp.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {grp.emojis.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleTypingChange(text + em)}
                        className="text-xl hover:scale-125 transition-transform p-1"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* GIF Picker Drawer */}
        <AnimatePresence>
          {showGif && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="glass-card rounded-3xl p-3.5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-pink-200">Romantic GIFs</p>
                <button
                  type="button"
                  onClick={() => setShowGif(false)}
                  className="text-pink-200/60 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ROMANTIC_GIFS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleSendGif(g.url, g.label)}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 h-20 bg-black/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.url}
                      alt={g.label}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1.5 py-0.5 text-[10px] text-white truncate">
                      {g.label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customGifUrl}
                  onChange={(e) => setCustomGifUrl(e.target.value)}
                  placeholder="Or paste any GIF URL..."
                  className="flex-1 rounded-xl bg-black/40 border border-white/15 px-3 py-1.5 text-xs text-white placeholder:text-pink-200/40 focus:outline-none focus:border-pink-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customGifUrl.trim()) {
                      handleSendGif(customGifUrl.trim(), 'GIF');
                    }
                  }}
                  className="rounded-xl bg-pink-500/30 border border-pink-400/40 px-3 py-1.5 text-xs text-white font-medium"
                >
                  Send
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Input Bar */}
        <form
          onSubmit={handleSendText}
          className="glass-card rounded-3xl px-2.5 py-2 flex items-center gap-1.5 sm:gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImagePick}
            className="hidden"
          />

          <button
            type="button"
            onClick={sendMissYou}
            title="Send floating hearts (Miss you!)"
            className="shrink-0 rounded-full bg-gradient-to-r from-pink-500/25 to-rose-500/25 hover:from-pink-500/40 hover:to-rose-500/40 border border-pink-400/35 px-2.5 py-2 text-xs font-medium text-pink-100 flex items-center gap-1 active:scale-95 transition"
          >
            <span className="text-sm">💗</span>
            <span className="hidden sm:inline">Miss you</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowEmoji((s) => !s);
              setShowGif(false);
            }}
            aria-label="Emoji picker"
            className="shrink-0 p-2 rounded-full text-pink-200/75 hover:bg-white/10 hover:text-white transition"
          >
            <Smile className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowGif((s) => !s);
              setShowEmoji(false);
            }}
            aria-label="GIF picker"
            className="shrink-0 px-2 py-1 rounded-full text-[11px] font-bold text-pink-200/80 border border-pink-300/25 hover:bg-white/10 transition"
          >
            GIF
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Upload image"
            className="shrink-0 p-2 rounded-full text-pink-200/75 hover:bg-white/10 hover:text-white transition"
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => handleTypingChange(e.target.value)}
            placeholder={
              recording
                ? `Recording voice note... ${recordSeconds}s`
                : uploading
                  ? 'Sending with love...'
                  : `Whisper to ${config.names[partnerId]}...`
            }
            disabled={recording}
            className="flex-1 min-w-0 bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-pink-200/40 focus:outline-none"
          />

          <button
            type="button"
            onClick={startVoiceRecording}
            aria-label="Record voice note"
            className={`shrink-0 p-2 rounded-full transition ${
              recording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'text-pink-200/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            type="submit"
            disabled={!text.trim() || uploading}
            aria-label="Send message"
            className="shrink-0 h-10 w-10 rounded-full accent-gradient-btn text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

