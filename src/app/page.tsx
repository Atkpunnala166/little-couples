'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UniverseProvider, useUniverse } from '@/context/UniverseContext';
import { BackgroundVibe } from '@/components/BackgroundVibe';
import { TopToast } from '@/components/TopToast';
import { NameSelectScreen } from '@/components/NameSelectScreen';
import { BottomNav } from '@/components/BottomNav';
import { ChatTab } from '@/components/ChatTab';
import { GamesTab } from '@/components/GamesTab';
import { MemoriesTab } from '@/components/MemoriesTab';
import { SettingsTab } from '@/components/SettingsTab';
import { VideoCallModal } from '@/components/VideoCallModal';

function UniverseAppShell() {
  const { activeMember, activeTab } = useUniverse();

  if (!activeMember) {
    return <NameSelectScreen />;
  }

  return (
    <div className="relative z-10 flex h-dvh w-full overflow-hidden">
      <BottomNav />

      <main className="flex-1 min-w-0 h-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="h-full w-full"
          >
            {activeTab === 'chat' && <ChatTab />}
            {activeTab === 'games' && <GamesTab />}
            {activeTab === 'memories' && <MemoriesTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      <VideoCallModal />
    </div>
  );
}

export default function HomePage() {
  return (
    <UniverseProvider>
      <div className="relative min-h-dvh w-full overflow-hidden">
        <BackgroundVibe />
        <TopToast />
        <UniverseAppShell />
      </div>
    </UniverseProvider>
  );
}
