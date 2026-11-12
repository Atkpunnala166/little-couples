'use client';

import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Bell,
  BellOff,
  Check,
  KeyRound,
  Music,
  Palette,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PROFILE_META, THEMES } from '@/lib/constants';
import { useUniverse } from '@/context/UniverseContext';
import { ThemeId } from '@/types/universe';

export function SettingsTab() {
  const {
    activeMember,
    config,
    updateConfig,
    prefs,
    updatePrefs,
    clearChat,
    switchProfile,
    enablePushNotifications,
    fcmToken,
    pushToast,
  } = useUniverse();

  const [avinashName, setAvinashName] = useState(config.names.avinash);
  const [athulyaName, setAthulyaName] = useState(config.names.athulya);
  const [avinashPass, setAvinashPass] = useState(config.passwords.avinash);
  const [athulyaPass, setAthulyaPass] = useState(config.passwords.athulya);
  const [roomPasscode, setRoomPasscode] = useState(config.roomPasscode);
  const [anniversaryDate, setAnniversaryDate] = useState(config.anniversaryDate);
  const [nextMeetingTitle, setNextMeetingTitle] = useState(config.nextMeetingTitle);
  const [nextMeetingDate, setNextMeetingDate] = useState(config.nextMeetingDate);
  const [confirmClear, setConfirmClear] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  if (!activeMember) return null;

  const handleSaveNames = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextNames = { ...config.names };
    const nextEdited = { ...config.namesEditedOnce };

    if (avinashName.trim() && avinashName.trim() !== config.names.avinash && !nextEdited.avinash) {
      nextNames.avinash = avinashName.trim();
      nextEdited.avinash = true;
    }
    if (athulyaName.trim() && athulyaName.trim() !== config.names.athulya && !nextEdited.athulya) {
      nextNames.athulya = athulyaName.trim();
      nextEdited.athulya = true;
    }

    await updateConfig({
      names: nextNames,
      namesEditedOnce: nextEdited,
      anniversaryDate,
      nextMeetingTitle: nextMeetingTitle.trim() || 'Our Next Date Night',
      nextMeetingDate,
    });
    setSavedNotice('Couple details saved!');
    window.setTimeout(() => setSavedNotice(''), 2500);
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateConfig({
      passwords: {
        avinash: avinashPass.trim() || 'Avi123',
        athulya: athulyaPass.trim() || 'Sree123',
      },
      roomPasscode: roomPasscode.trim(),
    });
    setSavedNotice('Passwords & room passcode updated!');
    window.setTimeout(() => setSavedNotice(''), 2500);
  };

  const handleThemeChange = async (theme: ThemeId) => {
    updatePrefs({ theme });
    await updateConfig({ theme });
  };

  const handleEnablePush = async () => {
    const ok = await enablePushNotifications();
    pushToast({
      title: ok ? '🔔 Push Notifications Enabled' : 'ℹ️ Push Setup Info',
      body: ok
        ? 'You will receive alerts even when the app is closed.'
        : 'Add Firebase Web Push VAPID key & allow browser notifications.',
      icon: ok ? '💗' : '🔔',
      targetTab: 'settings',
    });
  };

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-6 pt-4 pb-24 md:pb-8 max-w-3xl mx-auto w-full space-y-5">
      <div className="glass-card rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-pink-300/70">
            Personalize Our Universe
          </p>
          <h2 className="font-romantic italic text-3xl text-white mt-0.5">Settings</h2>
        </div>
        <button
          type="button"
          onClick={switchProfile}
          className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-4 py-2 text-xs font-semibold text-white flex items-center gap-1.5 transition"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span>Switch Profile</span>
        </button>
      </div>

      {savedNotice && (
        <div className="rounded-2xl bg-emerald-500/20 border border-emerald-400/35 px-4 py-2.5 text-xs font-medium text-emerald-100 flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Theme Switcher */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Palette className="h-4 w-4 text-pink-300" />
          <span>Romantic Theme</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const t = THEMES[id];
            const active = prefs.theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleThemeChange(id)}
                className={`rounded-2xl p-3.5 text-left border transition ${
                  active
                    ? 'border-pink-400 bg-pink-500/20 ring-1 ring-pink-400'
                    : 'border-white/10 bg-black/30 hover:border-white/25'
                }`}
              >
                <div
                  className="h-6 w-full rounded-xl mb-2.5"
                  style={{ background: t.swatch }}
                />
                <p className="text-xs font-semibold text-white">{t.name}</p>
                <p className="text-[10px] text-pink-200/65 mt-0.5">{t.subtitle}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sound & Notifications */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <p className="text-sm font-semibold text-white">Sound, Music &amp; Notifications</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => updatePrefs({ muteSound: !prefs.muteSound })}
            className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-xs text-pink-100"
          >
            <span className="flex items-center gap-2">
              {prefs.muteSound ? <VolumeX className="h-4 w-4 text-rose-300" /> : <Volume2 className="h-4 w-4 text-pink-300" />}
              <span>Sound Effects</span>
            </span>
            <span className="font-semibold">{prefs.muteSound ? 'Muted' : 'On'}</span>
          </button>

          <button
            type="button"
            onClick={() => updatePrefs({ muteNotifications: !prefs.muteNotifications })}
            className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-xs text-pink-100"
          >
            <span className="flex items-center gap-2">
              {prefs.muteNotifications ? <BellOff className="h-4 w-4 text-rose-300" /> : <Bell className="h-4 w-4 text-pink-300" />}
              <span>In-App Toasts</span>
            </span>
            <span className="font-semibold">{prefs.muteNotifications ? 'Muted' : 'On'}</span>
          </button>

          <button
            type="button"
            onClick={() => updatePrefs({ lofiMusic: !prefs.lofiMusic })}
            className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-xs text-pink-100"
          >
            <span className="flex items-center gap-2">
              <Music className="h-4 w-4 text-pink-300" />
              <span>Lofi Love Music</span>
            </span>
            <span className="font-semibold">{prefs.lofiMusic ? 'Playing' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={handleEnablePush}
            className="flex items-center justify-between rounded-2xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/30 px-4 py-3 text-xs text-pink-100 transition"
          >
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-300" />
              <span>Background Push (FCM)</span>
            </span>
            <span className="font-semibold">{fcmToken ? 'Active ✓' : 'Enable'}</span>
          </button>
        </div>
      </div>

      {/* Couple Names & Dates */}
      <form onSubmit={handleSaveNames} className="glass-card rounded-3xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white">Couple Profile &amp; Special Dates</p>
          <p className="text-[11px] text-pink-200/60">
            Display names can be customized once so your universe always feels personal.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">
              {PROFILE_META.avinash.emoji} Partner 1 Name {config.namesEditedOnce.avinash ? '(Edited)' : '(Editable once)'}
            </label>
            <input
              type="text"
              value={avinashName}
              disabled={config.namesEditedOnce.avinash}
              onChange={(e) => setAvinashName(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">
              {PROFILE_META.athulya.emoji} Partner 2 Name {config.namesEditedOnce.athulya ? '(Edited)' : '(Editable once)'}
            </label>
            <input
              type="text"
              value={athulyaName}
              disabled={config.namesEditedOnce.athulya}
              onChange={(e) => setAthulyaName(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">Anniversary Date</label>
            <input
              type="date"
              value={anniversaryDate}
              onChange={(e) => setAnniversaryDate(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">Next Meeting Countdown</label>
            <input
              type="datetime-local"
              value={nextMeetingDate}
              onChange={(e) => setNextMeetingDate(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-pink-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-pink-200/75 block mb-1">Countdown Title</label>
          <input
            type="text"
            value={nextMeetingTitle}
            onChange={(e) => setNextMeetingTitle(e.target.value)}
            className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-pink-400"
          />
        </div>

        <button
          type="submit"
          className="accent-gradient-btn rounded-2xl px-5 py-2.5 text-xs font-semibold text-white"
        >
          Save Names &amp; Dates
        </button>
      </form>

      {/* Passwords & Shared Room Passcode */}
      <form onSubmit={handleSaveSecurity} className="glass-card rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="h-4 w-4 text-amber-300" />
          <span>Passwords &amp; Room Protection</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">
              {config.names.avinash} Password
            </label>
            <input
              type="text"
              value={avinashPass}
              onChange={(e) => setAvinashPass(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">
              {config.names.athulya} Password
            </label>
            <input
              type="text"
              value={athulyaPass}
              onChange={(e) => setAthulyaPass(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-[11px] text-pink-200/75 block mb-1">
              Shared Room Passcode (Optional)
            </label>
            <input
              type="text"
              value={roomPasscode}
              onChange={(e) => setRoomPasscode(e.target.value)}
              placeholder="Leave blank to disable"
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-3.5 py-2 text-sm text-white placeholder:text-pink-200/35 focus:outline-none focus:border-pink-400"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-2xl bg-white/10 hover:bg-pink-500/25 border border-white/15 px-5 py-2.5 text-xs font-semibold text-white transition"
        >
          Update Passwords
        </button>
      </form>

      {/* Danger Zone: Clear Chat */}
      <div className="glass-card rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3 border-rose-500/25">
        <div>
          <p className="text-sm font-semibold text-rose-200">Clear Chat History</p>
          <p className="text-xs text-pink-200/60">
            Permanently remove all messages from this room.
          </p>
        </div>

        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="rounded-2xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/35 px-4 py-2 text-xs font-semibold text-rose-100 flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Chat</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await clearChat();
                setConfirmClear(false);
                setSavedNotice('Chat cleared.');
              }}
              className="rounded-2xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
            >
              Confirm Delete All
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-2xl bg-white/10 px-3 py-2 text-xs text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

