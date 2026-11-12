'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import {
  INITIAL_LOVE_QUIZ,
  LOVE_QUIZ_QUESTIONS,
  nowMs,
  PROFILE_META,
} from '@/lib/constants';
import { soundEngine } from '@/lib/audio';
import { addGameHistory, saveGameState, subscribeGameState } from '@/lib/store';
import { useUniverse } from '@/context/UniverseContext';
import { LoveQuizState } from '@/types/universe';

export function LoveQuizGame() {
  const { activeMember, partnerId, config, prefs, notifyGameEvent } = useUniverse();
  const [quiz, setQuiz] = useState<LoveQuizState>(INITIAL_LOVE_QUIZ);

  useEffect(() => {
    return subscribeGameState<LoveQuizState>('love-quiz', INITIAL_LOVE_QUIZ, setQuiz);
  }, []);

  if (!activeMember || !partnerId) return null;

  const totalQ = LOVE_QUIZ_QUESTIONS.length;
  const mySelfDone = Object.keys(quiz.selfAnswers[activeMember] || {}).length === totalQ;
  const partnerSelfDone = Object.keys(quiz.selfAnswers[partnerId] || {}).length === totalQ;
  const myGuessDone = Object.keys(quiz.guesses[activeMember] || {}).length === totalQ;
  const partnerGuessDone = Object.keys(quiz.guesses[partnerId] || {}).length === totalQ;

  const currentQuestion = LOVE_QUIZ_QUESTIONS[quiz.questionIndex] || LOVE_QUIZ_QUESTIONS[0];

  const handleSelectOption = async (qIdx: number, optIdx: number) => {
    soundEngine.playHeartPop(prefs.muteSound);

    if (quiz.status === 'answering') {
      const nextSelf = {
        ...quiz.selfAnswers,
        [activeMember]: {
          ...(quiz.selfAnswers[activeMember] || {}),
          [qIdx]: optIdx,
        },
      };
      const allMe = Object.keys(nextSelf[activeMember]).length === totalQ;
      const allPartner = Object.keys(nextSelf[partnerId] || {}).length === totalQ;
      const nextStatus = allMe && allPartner ? 'guessing' : 'answering';
      const nextQIdx = allMe && allPartner ? 0 : Math.min(totalQ - 1, qIdx + 1);

      await saveGameState<LoveQuizState>('love-quiz', {
        ...quiz,
        selfAnswers: nextSelf,
        status: nextStatus,
        questionIndex: nextStatus === 'guessing' ? 0 : nextQIdx,
        updatedAt: nowMs(),
      });
      if (allMe && !allPartner) {
        notifyGameEvent('love-quiz', `${config.names[activeMember]} finished answering Love Quiz!`);
      }
      return;
    }

    if (quiz.status === 'guessing') {
      const nextGuesses = {
        ...quiz.guesses,
        [activeMember]: {
          ...(quiz.guesses[activeMember] || {}),
          [qIdx]: optIdx,
        },
      };
      const allMe = Object.keys(nextGuesses[activeMember]).length === totalQ;
      const allPartner = Object.keys(nextGuesses[partnerId] || {}).length === totalQ;
      const nextStatus = allMe && allPartner ? 'results' : 'guessing';

      if (nextStatus === 'results') {
        soundEngine.playWin(prefs.muteSound);
        confetti({ particleCount: 70, spread: 75 });
        const avScore = LOVE_QUIZ_QUESTIONS.filter(
          (q) => nextGuesses.avinash?.[q.id] === quiz.selfAnswers.athulya?.[q.id]
        ).length;
        const atScore = LOVE_QUIZ_QUESTIONS.filter(
          (q) => nextGuesses.athulya?.[q.id] === quiz.selfAnswers.avinash?.[q.id]
        ).length;
        await addGameHistory({
          gameId: 'love-quiz',
          gameName: 'Love Quiz',
          winner: avScore === atScore ? 'draw' : avScore > atScore ? 'avinash' : 'athulya',
          summary: `${config.names.avinash} ${avScore}/${totalQ} • ${config.names.athulya} ${atScore}/${totalQ}`,
          playedAt: nowMs(),
        });
      }

      await saveGameState<LoveQuizState>('love-quiz', {
        ...quiz,
        guesses: nextGuesses,
        status: nextStatus,
        questionIndex: nextStatus === 'results' ? 0 : Math.min(totalQ - 1, qIdx + 1),
        updatedAt: nowMs(),
      });
    }
  };

  const handleReset = async () => {
    await saveGameState<LoveQuizState>('love-quiz', {
      ...INITIAL_LOVE_QUIZ,
      updatedAt: Date.now(),
    });
  };

  const myAnswerCount =
    quiz.status === 'answering'
      ? Object.keys(quiz.selfAnswers[activeMember] || {}).length
      : Object.keys(quiz.guesses[activeMember] || {}).length;

  const activeQIndex = Math.min(myAnswerCount, totalQ - 1);
  const activeQ = LOVE_QUIZ_QUESTIONS[activeQIndex] || currentQuestion;

  const avinashCorrect = LOVE_QUIZ_QUESTIONS.filter(
    (q) => quiz.guesses.avinash?.[q.id] === quiz.selfAnswers.athulya?.[q.id]
  ).length;
  const athulyaCorrect = LOVE_QUIZ_QUESTIONS.filter(
    (q) => quiz.guesses.athulya?.[q.id] === quiz.selfAnswers.avinash?.[q.id]
  ).length;

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-romantic italic text-2xl sm:text-3xl text-white">
            How Well Do You Know Me?
          </h3>
          <p className="text-xs text-pink-200/70">
            {quiz.status === 'answering'
              ? 'Step 1: Answer honestly about yourself'
              : quiz.status === 'guessing'
                ? `Step 2: Guess ${config.names[partnerId]}'s answers`
                : 'Results revealed!'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="rounded-full bg-white/10 hover:bg-pink-500/25 border border-white/15 px-3.5 py-2 text-xs text-white flex items-center gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Restart</span>
        </button>
      </div>

      {quiz.status === 'results' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['avinash', 'athulya'] as const).map((id) => {
              const score = id === 'avinash' ? avinashCorrect : athulyaCorrect;
              return (
                <div
                  key={id}
                  className="rounded-2xl bg-pink-500/15 border border-pink-400/30 p-4 text-center"
                >
                  <p className="text-xs text-pink-200/80">
                    {PROFILE_META[id].emoji} {config.names[id]} guessed
                  </p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {score} / {totalQ}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="space-y-2.5">
            {LOVE_QUIZ_QUESTIONS.map((q) => {
              const myGuess = quiz.guesses[activeMember]?.[q.id];
              const partnerTrue = quiz.selfAnswers[partnerId]?.[q.id];
              const matched = myGuess === partnerTrue;
              return (
                <div
                  key={q.id}
                  className="rounded-2xl bg-black/35 border border-white/10 p-3.5 text-xs space-y-1"
                >
                  <p className="font-semibold text-pink-100">{q.question}</p>
                  <p className="text-pink-200/80">
                    {config.names[partnerId]}&apos;s answer:{' '}
                    <span className="text-white font-medium">
                      {q.options[partnerTrue ?? 0]}
                    </span>
                  </p>
                  <p className={matched ? 'text-emerald-300' : 'text-rose-300'}>
                    Your guess: {q.options[myGuess ?? 0]} {matched ? '✓ Spot on!' : '✗'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (quiz.status === 'answering' && mySelfDone) ||
        (quiz.status === 'guessing' && myGuessDone) ? (
        <div className="rounded-2xl bg-pink-500/10 border border-pink-400/25 p-6 text-center space-y-2">
          <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto" />
          <p className="text-sm font-semibold text-white">
            You&apos;ve completed this step!
          </p>
          <p className="text-xs text-pink-200/70">
            Waiting for {config.names[partnerId]} ({partnerSelfDone ? 'ready' : 'still answering'}
            {quiz.status === 'guessing' ? (partnerGuessDone ? ', guesses ready' : ', still guessing') : ''})...
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-pink-200/75">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>
                Question {activeQIndex + 1} of {totalQ}
              </span>
            </span>
            <span>
              {quiz.status === 'answering'
                ? 'About You'
                : `Guessing ${config.names[partnerId]}`}
            </span>
          </div>

          <div className="rounded-2xl bg-black/35 border border-white/10 p-4">
            <p className="font-romantic italic text-xl text-white">
              {quiz.status === 'guessing'
                ? `For ${config.names[partnerId]}: ${activeQ.question}`
                : activeQ.question}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {activeQ.options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectOption(activeQ.id, idx)}
                className="rounded-2xl bg-white/5 hover:bg-pink-500/25 border border-white/15 hover:border-pink-400/45 p-3.5 text-left text-xs sm:text-sm text-pink-50 transition"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

