import type NDK from '@nostr-dev-kit/ndk';
import type { NDKSigner } from '@nostr-dev-kit/ndk';
import { call } from './accountApi';
import { addrString, type Addr } from './bootcamps';

/**
 * Client for the index's learning endpoints (packages/server/src/learning.ts):
 * lesson quizzes graded on the server (answers never reach the browser before
 * an attempt).
 */

export interface QuizQuestion {
  q: string;
  options: string[];
}
export interface TutorQuestion extends QuizQuestion {
  answer: number;
  explain?: string;
}
export interface PublicQuiz {
  bootcamp: string;
  passMark: number;
  questions: QuizQuestion[];
}
export interface AttemptResult {
  score: number;
  total: number;
  passed: boolean;
  passMark: number;
  results: { correct: boolean; answer: number; explain: string | null }[];
  completed: boolean;
  awardId: string | null;
}
export interface QuizProgress {
  quizzes: string[];
  passed: string[];
  completed: boolean;
  awardId: string | null;
}

export const getQuiz = (lesson: Addr) =>
  call<PublicQuiz>(`/v1/quiz?lesson=${encodeURIComponent(addrString(lesson))}`);

export const getQuizProgress = (bootcamp: Addr, pubkey: string) =>
  call<QuizProgress>(
    `/v1/quiz/progress?bootcamp=${encodeURIComponent(addrString(bootcamp))}&pubkey=${pubkey}`,
  );

export const getTutorQuiz = (ndk: NDK, signer: NDKSigner, lesson: Addr) =>
  call<{ questions: TutorQuestion[]; passMark: number }>('/v1/quiz/full', {
    ndk,
    signer,
    body: { lesson: addrString(lesson) },
  });

export const saveQuiz = (
  ndk: NDK,
  signer: NDKSigner,
  p: { lesson: Addr; bootcamp: Addr; bootcampTitle: string; questions: TutorQuestion[]; passMark: number },
) =>
  call<{ ok: true }>('/v1/quiz', {
    ndk,
    signer,
    body: {
      lesson: addrString(p.lesson),
      bootcamp: addrString(p.bootcamp),
      bootcampTitle: p.bootcampTitle,
      questions: p.questions,
      passMark: p.passMark,
    },
  });

export const removeQuiz = (ndk: NDK, signer: NDKSigner, lesson: Addr, bootcamp: Addr) =>
  call<{ ok: true }>('/v1/quiz', {
    ndk,
    signer,
    body: { lesson: addrString(lesson), bootcamp: addrString(bootcamp), remove: true },
  });

export const attemptQuiz = (ndk: NDK, signer: NDKSigner, lesson: Addr, answers: number[]) =>
  call<AttemptResult>('/v1/quiz/attempt', {
    ndk,
    signer,
    body: { lesson: addrString(lesson), answers },
  });
