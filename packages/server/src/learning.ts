import type { IncomingMessage, ServerResponse } from 'node:http';
import { awardCompletion, examinerPubkey } from './examiner.ts';
import { nip98, readBody, send } from './http.ts';
import * as q from './queries.ts';

/**
 * Learning endpoints:
 *
 *   GET  /v1/features                       what this index offers + the examiner pubkey
 *   GET  /v1/quiz?lesson=…                  a lesson's quiz, without answers
 *   POST /v1/quiz                           tutor saves / removes a quiz  (NIP-98, lesson author only)
 *   POST /v1/quiz/full                      tutor reads their quiz with answers (NIP-98)
 *   POST /v1/quiz/attempt                   learner submits answers       (NIP-98)
 *   GET  /v1/quiz/progress?bootcamp=…&pubkey=…
 *
 * Passing every quiz in a bootcamp issues its completion badge, signed by the
 * examiner key (examiner.ts).
 */

const LESSON_RE = /^30023:[0-9a-f]{64}:[^\s:]{1,128}$/;
const BOOTCAMP_RE = /^30004:[0-9a-f]{64}:[^\s:]{1,128}$/;
const authorOf = (addr: string) => addr.split(':')[1];

// ---- small in-memory rate limits (reset on restart; good enough for abuse control) ----
const buckets = new Map<string, { until: number; n: number }>();
function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.until < now) {
    buckets.set(key, { until: now + windowMs, n: 1 });
    return true;
  }
  if (b.n >= max) return false;
  b.n++;
  return true;
}

function validQuestions(raw: unknown): q.QuizQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const out: q.QuizQuestion[] = [];
  for (const x of raw as Record<string, unknown>[]) {
    const options = Array.isArray(x?.options) ? x.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const answer = Number(x?.answer);
    const prompt = String(x?.q ?? '').trim();
    if (!prompt || prompt.length > 500 || options.length < 2 || options.length > 5) return null;
    if (options.some((o) => o.length > 200) || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      return null;
    }
    const explain = String(x?.explain ?? '').trim().slice(0, 500);
    out.push({ q: prompt, options, answer, ...(explain ? { explain } : {}) });
  }
  return out;
}

// ---- quizzes ----

async function attempt(res: ServerResponse, pubkey: string, body: Record<string, unknown>) {
  const lesson = String(body.lesson ?? '');
  const quiz = LESSON_RE.test(lesson) ? q.quizFor(lesson) : undefined;
  if (!quiz) return send(res, 404, { error: 'This lesson has no quiz' });
  if (!allow(`attempt:${pubkey}:${lesson}`, 15, 3600_000)) {
    return send(res, 429, { error: 'Take a short break, then try again.' });
  }
  const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];
  const results = quiz.questions.map((qq, i) => ({
    correct: answers[i] === qq.answer,
    answer: qq.answer,
    explain: qq.explain ?? null,
  }));
  const score = results.filter((r) => r.correct).length;
  const total = quiz.questions.length;
  const passed = score / total >= quiz.pass_mark;
  q.recordAttempt(lesson, pubkey, score, total, passed);

  const { completed, awardId } = await settleCompletion(quiz.bootcamp_addr, quiz.bootcamp_title, pubkey);
  return send(res, 200, { score, total, passed, passMark: quiz.pass_mark, results, completed, awardId });
}

/**
 * Every quiz in the bootcamp passed → issue the completion badge, once. A failed
 * publish is retried on the learner's next attempt or progress check.
 */
async function settleCompletion(bootcampAddr: string, title: string, pubkey: string) {
  const all = q.quizLessonsIn(bootcampAddr);
  const passed = new Set(q.attemptsIn(bootcampAddr, pubkey).filter((a) => a.passed).map((a) => a.lesson_addr));
  const completed = all.length > 0 && all.every((l) => passed.has(l));
  let awardId = q.awardFor(bootcampAddr, pubkey) ?? null;
  if (completed && !awardId) {
    try {
      awardId = await awardCompletion(bootcampAddr, title, pubkey);
      q.saveAward(bootcampAddr, pubkey, awardId);
    } catch (e) {
      console.error('[examiner] award failed', e);
    }
  }
  return { completed, awardId, passed: [...passed], all };
}

export async function handleLearningHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  if (!['/v1/features', '/v1/quiz', '/v1/quiz/attempt', '/v1/quiz/progress', '/v1/quiz/full'].includes(path)) {
    return false;
  }
  if (req.method === 'OPTIONS') {
    send(res, 204, null);
    return true;
  }

  try {
    if (req.method === 'GET' && path === '/v1/features') {
      send(res, 200, { quizzes: true, examiner: examinerPubkey });
      return true;
    }

    if (req.method === 'GET' && path === '/v1/quiz') {
      const lesson = url.searchParams.get('lesson') ?? '';
      const quiz = LESSON_RE.test(lesson) ? q.quizFor(lesson) : undefined;
      if (!quiz) send(res, 404, { error: 'no quiz' });
      else
        send(res, 200, {
          bootcamp: quiz.bootcamp_addr,
          passMark: quiz.pass_mark,
          questions: quiz.questions.map(({ q: prompt, options }) => ({ q: prompt, options })),
        });
      return true;
    }

    if (req.method === 'GET' && path === '/v1/quiz/progress') {
      const bootcamp = url.searchParams.get('bootcamp') ?? '';
      const pubkey = url.searchParams.get('pubkey') ?? '';
      if (!BOOTCAMP_RE.test(bootcamp)) return (send(res, 400, { error: 'bad bootcamp' }), true);
      if (!/^[0-9a-f]{64}$/.test(pubkey)) {
        send(res, 200, { quizzes: q.quizLessonsIn(bootcamp), passed: [], completed: false, awardId: null });
        return true;
      }
      const title = q.quizFor(q.quizLessonsIn(bootcamp)[0] ?? '')?.bootcamp_title ?? 'Bootcamp';
      const s = await settleCompletion(bootcamp, title, pubkey);
      send(res, 200, { quizzes: s.all, passed: s.passed, completed: s.completed, awardId: s.awardId });
      return true;
    }

    if (req.method === 'POST') {
      const body = await readBody(req, 64 * 1024);
      const pubkey = nip98(req, path, body);
      if (!pubkey) return (send(res, 401, { error: 'sign the request with your Nostr key (NIP-98)' }), true);
      const json = JSON.parse(body) as Record<string, unknown>;

      if (path === '/v1/quiz/attempt') return (await attempt(res, pubkey, json), true);

      if (path === '/v1/quiz/full') {
        const lesson = String(json.lesson ?? '');
        if (!LESSON_RE.test(lesson) || authorOf(lesson) !== pubkey) return (send(res, 403, { error: 'not your lesson' }), true);
        const quiz = q.quizFor(lesson);
        send(res, quiz ? 200 : 404, quiz ? { questions: quiz.questions, passMark: quiz.pass_mark } : { error: 'no quiz' });
        return true;
      }

      if (path === '/v1/quiz') {
        const lesson = String(json.lesson ?? '');
        const bootcamp = String(json.bootcamp ?? '');
        if (!LESSON_RE.test(lesson) || !BOOTCAMP_RE.test(bootcamp)) return (send(res, 400, { error: 'bad lesson or bootcamp' }), true);
        if (authorOf(lesson) !== pubkey || authorOf(bootcamp) !== pubkey) {
          return (send(res, 403, { error: 'Only the tutor who wrote this lesson can set its quiz' }), true);
        }
        if (json.remove === true) {
          q.deleteQuiz(lesson);
          return (send(res, 200, { ok: true }), true);
        }
        const questions = validQuestions(json.questions);
        if (!questions) {
          return (send(res, 400, { error: 'Each question needs a prompt, 2–5 options and a correct answer (up to 20 questions)' }), true);
        }
        const passMark = Math.min(1, Math.max(0.5, Number(json.passMark) || 0.7));
        q.saveQuiz({
          lesson_addr: lesson,
          bootcamp_addr: bootcamp,
          bootcamp_title: String(json.bootcampTitle ?? 'Bootcamp').slice(0, 120),
          questions,
          pass_mark: passMark,
        });
        return (send(res, 200, { ok: true }), true);
      }
    }
  } catch (e) {
    send(res, 400, { error: e instanceof Error ? e.message : 'bad request' });
    return true;
  }

  send(res, 404, { error: 'not found' });
  return true;
}
