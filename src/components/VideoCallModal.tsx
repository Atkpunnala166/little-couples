'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { PROFILE_META } from '@/lib/constants';
import { soundEngine } from '@/lib/audio';
import {
  addIceCandidateSignal,
  saveCallSession,
  subscribeIceCandidatesSignal,
  triggerPartnerPush,
} from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { CallSession } from '@/types/universe';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VideoCallModal() {
  const {
    activeMember,
    partnerId,
    config,
    activeCall,
    callModalOpen,
    callLaunchMode,
    closeCallModal,
    sendMessage,
    partnerPresence,
  } = useUniverse();

  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mediaError, setMediaError] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const addedIceRef = useRef<Set<string>>(new Set());
  const queuedRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const startedOutgoingRef = useRef<string | null>(null);
  const answeredRef = useRef<string | null>(null);

  const cleanupMedia = useCallback(() => {
    soundEngine.stopRingtone();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    addedIceRef.current.clear();
    queuedRemoteCandidatesRef.current = [];
    startedOutgoingRef.current = null;
    answeredRef.current = null;
  }, []);

  const flushQueuedIce = useCallback((pc: RTCPeerConnection) => {
    while (queuedRemoteCandidatesRef.current.length > 0) {
      const cand = queuedRemoteCandidatesRef.current.shift()!;
      const key = JSON.stringify(cand);
      if (!addedIceRef.current.has(key)) {
        addedIceRef.current.add(key);
        pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => undefined);
      }
    }
  }, []);

  const setupPeerConnection = useCallback(
    async (mode: 'video' | 'audio', callId: string, role: 'offer' | 'answer') => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setMediaError('Camera/microphone unavailable. HTTPS or localhost required.');
        return null;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === 'video',
        });
      } catch (err) {
        console.warn('[WebRTC] Media error:', err);
        if (mode === 'video') {
          // Camera might be in use by another tab or process; try audio-only fallback
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setCamOff(true);
            setMediaError('Camera unavailable or in use; connected in voice mode.');
          } catch {
            setMediaError('Unable to access microphone. Please check permissions.');
            return null;
          }
        } else {
          setMediaError('Unable to access microphone. Please check permissions.');
          return null;
        }
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream!);
      });

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addIceCandidateSignal(
            callId,
            role === 'offer' ? 'offerCandidates' : 'answerCandidates',
            event.candidate.toJSON()
          ).catch(() => undefined);
        }
      };

      return pc;
    },
    []
  );

  // Start outgoing call when modal opens without an incoming call
  useEffect(() => {
    if (!callModalOpen || !activeMember || !partnerId) return;
    const isIncoming = activeCall && activeCall.status === 'ringing' && activeCall.calleeId === activeMember;
    if (isIncoming) return;
    if (activeCall && activeCall.status === 'connected') return;
    if (startedOutgoingRef.current) return;

    const callId = `call-${Date.now()}`;
    startedOutgoingRef.current = callId;

    const kickOff = window.setTimeout(async () => {
      setMediaError('');
      setElapsed(0);
      setCamOff(callLaunchMode === 'audio');
      try {
        const pc = await setupPeerConnection(callLaunchMode, callId, 'offer');
        if (!pc) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const session: CallSession = {
          id: callId,
          callerId: activeMember,
          calleeId: partnerId,
          mode: callLaunchMode,
          status: 'ringing',
          offer: { type: offer.type, sdp: offer.sdp || '' },
          createdAt: Date.now(),
        };
        await saveCallSession(session);

        if (partnerPresence.fcmToken) {
          triggerPartnerPush(
            partnerPresence.fcmToken,
            `📹 ${config.names[activeMember]} is calling!`,
            `Tap to join your ${callLaunchMode} call 💗`,
            { tab: 'chat' }
          );
        }
      } catch (err) {
        setMediaError(
          err instanceof Error ? err.message : 'Please allow camera/microphone access to start the call.'
        );
      }
    }, 0);

    return () => window.clearTimeout(kickOff);
  }, [
    callModalOpen,
    activeMember,
    partnerId,
    activeCall,
    callLaunchMode,
    config.names,
    partnerPresence.fcmToken,
    setupPeerConnection,
  ]);

  // Apply remote SDP answer & ICE candidates
  useEffect(() => {
    if (!activeCall || !activeCall.id || !activeMember) return;
    const pc = pcRef.current;
    if (!pc) return;

    if (
      activeCall.callerId === activeMember &&
      activeCall.answer &&
      !pc.currentRemoteDescription
    ) {
      pc.setRemoteDescription(new RTCSessionDescription(activeCall.answer))
        .then(() => flushQueuedIce(pc))
        .catch(() => undefined);
    }

    const remoteRole =
      activeCall.callerId === activeMember ? 'answerCandidates' : 'offerCandidates';
    return subscribeIceCandidatesSignal(activeCall.id, remoteRole, (candidates) => {
      candidates.forEach((cand) => {
        const key = JSON.stringify(cand);
        if (addedIceRef.current.has(key)) return;
        if (pc.remoteDescription && pc.remoteDescription.type) {
          addedIceRef.current.add(key);
          pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => undefined);
        } else {
          queuedRemoteCandidatesRef.current.push(cand);
        }
      });
    });
  }, [activeCall, activeMember, flushQueuedIce]);

  // Call timer when connected
  useEffect(() => {
    if (activeCall?.status !== 'connected') return;
    soundEngine.stopRingtone();
    const timer = window.setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.status]);

  // Auto-close when remote ends or declines
  useEffect(() => {
    if (
      callModalOpen &&
      activeCall &&
      (activeCall.status === 'ended' || activeCall.status === 'declined') &&
      startedOutgoingRef.current === activeCall.id
    ) {
      cleanupMedia();
      closeCallModal();
    }
  }, [activeCall, callModalOpen, cleanupMedia, closeCallModal]);

  const handleAnswer = async () => {
    if (!activeCall || !activeMember || answeredRef.current === activeCall.id) return;
    answeredRef.current = activeCall.id;
    soundEngine.stopRingtone();
    setMediaError('');
    setCamOff(activeCall.mode === 'audio');
    try {
      const pc = await setupPeerConnection(activeCall.mode, activeCall.id, 'answer');
      if (!pc || !activeCall.offer) return;
      await pc.setRemoteDescription(new RTCSessionDescription(activeCall.offer));
      flushQueuedIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await saveCallSession({
        ...activeCall,
        status: 'connected',
        connectedAt: Date.now(),
        answer: { type: answer.type, sdp: answer.sdp || '' },
      });
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Unable to access microphone/camera.');
    }
  };

  const handleEndOrDecline = async () => {
    const wasIncomingRinging =
      activeCall && activeCall.status === 'ringing' && activeCall.calleeId === activeMember;
    const mode = activeCall?.mode || callLaunchMode;

    if (activeCall?.id) {
      await saveCallSession({
        ...activeCall,
        status: wasIncomingRinging ? 'declined' : 'ended',
        endedAt: Date.now(),
      }).catch(() => undefined);

      if (activeCall.status === 'connected' && elapsed > 0) {
        await sendMessage({
          mediaType: 'call-log',
          text: `${mode === 'video' ? '📹 Video call' : '📞 Voice call'} • ${formatDuration(elapsed)}`,
        }).catch(() => undefined);
      }
    }

    cleanupMedia();
    closeCallModal();
  };

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleCam = () => {
    const next = !camOff;
    setCamOff(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  if (!activeMember || !partnerId) return null;
  const isIncomingRinging =
    activeCall?.status === 'ringing' && activeCall.calleeId === activeMember;
  const effectiveMode = activeCall?.mode || callLaunchMode;
  const callStateLabel =
    activeCall?.status === 'connected'
      ? 'Connected'
      : isIncomingRinging
        ? `Incoming ${effectiveMode} call...`
        : `Calling ${config.names[partnerId]}...`;

  return (
    <AnimatePresence>
      {callModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-4"
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            className="relative w-full max-w-2xl h-[82vh] max-h-[680px] rounded-3xl overflow-hidden glass-card flex flex-col justify-between"
          >
            {/* Remote Video Layer */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`absolute inset-0 h-full w-full object-cover ${
                effectiveMode === 'video' && activeCall?.status === 'connected'
                  ? 'opacity-100'
                  : 'opacity-0'
              }`}
            />

            {/* Romantic Call Backdrop when audio-only or waiting */}
            {(effectiveMode === 'audio' || activeCall?.status !== 'connected') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-rose-950/80 via-[#16040d] to-black/95 text-center px-6">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                  className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/35 to-amber-400/25 border border-pink-400/40 text-6xl shadow-[0_0_50px_rgba(236,72,153,0.45)]"
                >
                  {PROFILE_META[partnerId].emoji}
                </motion.div>
                <h2 className="mt-6 font-romantic italic text-3xl text-white">
                  {config.names[partnerId]}
                </h2>
                <p className="mt-2 text-sm text-pink-200/80">
                  {activeCall?.status === 'connected' ? formatDuration(elapsed) : callStateLabel}
                </p>
                {mediaError && (
                  <p className="mt-4 max-w-sm rounded-2xl bg-rose-500/20 border border-rose-400/30 px-4 py-2 text-xs text-rose-200">
                    {mediaError}
                  </p>
                )}
              </div>
            )}

            {/* Top Call Status Pill */}
            <div className="relative z-10 flex items-center justify-between p-4">
              <div className="rounded-full bg-black/50 border border-white/15 px-3.5 py-1.5 text-xs text-pink-100 backdrop-blur-md flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-pink-400 animate-pulse" />
                <span>
                  {effectiveMode === 'video' ? 'Video Call' : 'Voice Call'} •{' '}
                  {activeCall?.status === 'connected' ? formatDuration(elapsed) : callStateLabel}
                </span>
              </div>

              {/* Local Picture-in-Picture preview */}
              {effectiveMode === 'video' && (
                <div className="h-32 w-24 sm:h-40 sm:w-28 rounded-2xl overflow-hidden border border-pink-400/40 bg-black/60 shadow-xl">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`h-full w-full object-cover -scale-x-100 ${camOff ? 'opacity-20' : ''}`}
                  />
                </div>
              )}
            </div>

            {/* Bottom Call Controls */}
            <div className="relative z-10 p-6 flex items-center justify-center gap-4">
              {isIncomingRinging ? (
                <>
                  <button
                    type="button"
                    onClick={handleEndOrDecline}
                    className="flex h-14 px-6 items-center gap-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-lg transition"
                  >
                    <PhoneOff className="h-5 w-5" />
                    <span>Decline</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAnswer}
                    className="flex h-14 px-6 items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-[0_0_25px_rgba(16,185,129,0.6)] transition"
                  >
                    <Phone className="h-5 w-5" />
                    <span>Accept</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleMic}
                    aria-label="Toggle microphone"
                    className={`h-13 w-13 rounded-full flex items-center justify-center border transition ${
                      micMuted
                        ? 'bg-rose-500/30 border-rose-400/50 text-rose-100'
                        : 'bg-white/15 border-white/20 text-white hover:bg-white/25'
                    }`}
                  >
                    {micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>

                  {effectiveMode === 'video' && (
                    <button
                      type="button"
                      onClick={toggleCam}
                      aria-label="Toggle camera"
                      className={`h-13 w-13 rounded-full flex items-center justify-center border transition ${
                        camOff
                          ? 'bg-rose-500/30 border-rose-400/50 text-rose-100'
                          : 'bg-white/15 border-white/20 text-white hover:bg-white/25'
                      }`}
                    >
                      {camOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleEndOrDecline}
                    aria-label="End call"
                    className="h-14 w-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-[0_0_24px_rgba(225,29,72,0.65)] transition"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
