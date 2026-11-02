import { useNDK } from '@nostr-dev-kit/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Addr } from '../nostr/bootcamps';
import {
  attemptQuiz,
  getQuiz,
  getQuizProgress,
  getTutorQuiz,
  removeQuiz,
  saveQuiz,
  type AttemptResult,
  type PublicQuiz,
  type QuizProgress,
  type TutorQuestion,
} from '../nostr/learnApi';

const field =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brand';

/** The learner's quiz at the end of a lesson. Renders nothing when the lesson has none. */
export function QuizCard({ lesson, bootcampTitle }: { lesson: Addr; bootcampTitle?: string }) {
  const { ndk } = useNDK();
  const [quiz, setQuiz] = useState<PublicQuiz | null | undefined>(undefined);
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getQuiz(lesson)
      .then((q) => {
        if (!live) return;
        setQuiz(q);
        setPicks(q.questions.map(() => null));
      })
      .catch(() => live && setQuiz(null));
    return () => {
      live = false;
    };
  }, [lesson]);

  if (!quiz) return null;

  async function submit() {
    if (!ndk?.signer) return;
    setBusy(true);
    setErr(null);
    try {
      setResult(await attemptQuiz(ndk, ndk.signer, lesson, picks.map((p) => p ?? -1)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not check your answers');
    } finally {
      setBusy(false);
    }
  }

  const need = Math.ceil(quiz.passMark * quiz.questions.length);

  return (
    <section aria-label="Lesson quiz" className="mt-10 flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Check what you learned</h2>
        <span className="text-xs text-ink-faint">
          {need} of {quiz.questions.length} to pass
        </span>
      </div>

      <ol className="flex flex-col gap-4">
        {quiz.questions.map((q, i) => {
          const r = result?.results[i];
          return (
            <li key={i}>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[15px] font-semibold leading-snug">
                  {i + 1}. {q.q}
                </legend>
                {q.options.map((o, j) => {
                  const chosen = picks[i] === j;
                  const state = r ? (j === r.answer ? 'right' : chosen ? 'wrong' : 'idle') : chosen ? 'chosen' : 'idle';
                  return (
                    <label
                      key={j}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${
                        state === 'right'
                          ? 'border-good bg-good/10'
                          : state === 'wrong'
                            ? 'border-danger bg-danger/10'
                            : state === 'chosen'
                              ? 'border-brand bg-brand-soft'
                              : 'border-line'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={chosen}
                        disabled={!!result}
                        onChange={() => setPicks(picks.map((p, k) => (k === i ? j : p)))}
                        className="accent-brand"
                      />
                      {o}
                    </label>
                  );
                })}
                {r && r.explain && <p className="text-xs leading-relaxed text-ink-soft">{r.explain}</p>}
              </fieldset>
            </li>
          );
        })}
      </ol>

      {result ? (
        <div className={`rounded-xl px-4 py-3 text-sm ${result.passed ? 'bg-good/10 text-good' : 'bg-zap-soft text-zap-ink'}`}>
          <strong>
            {result.score} of {result.total} right.
          </strong>{' '}
          {result.completed
            ? `You've passed every quiz${bootcampTitle ? ` in ${bootcampTitle}` : ''}. Your completion badge ${
                result.awardId ? 'is on your profile.' : 'is on its way.'
              }`
            : result.passed
              ? 'Passed. On to the next lesson.'
              : 'Not quite. Read the lesson again and have another go.'}
          <div className="mt-2 flex gap-3">
            {!result.passed && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setPicks(quiz.questions.map(() => null));
                }}
                className="font-semibold underline"
              >
                Try again
              </button>
            )}
            {result.completed && (
              <Link to="/me" className="font-semibold underline">
                See your badge
              </Link>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={busy || picks.some((p) => p === null)}
          className="min-h-12 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Check my answers'}
        </button>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
    </section>
  );
}

const blank = (): TutorQuestion => ({ q: '', options: ['', ''], answer: 0, explain: '' });

/** The tutor's quiz editor for one of their lessons. Answers are stored on the index only. */
export function QuizEditor({ lesson, bootcamp, bootcampTitle }: { lesson: Addr; bootcamp: Addr; bootcampTitle: string }) {
  const { ndk } = useNDK();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<TutorQuestion[] | null>(null);
  const [exists, setExists] = useState(false);
  const [passMark, setPassMark] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || questions || !ndk?.signer) return;
    let live = true;
    getTutorQuiz(ndk, ndk.signer, lesson)
      .then((q) => {
        if (!live) return;
        setQuestions(q.questions.map((x) => ({ ...x, explain: x.explain ?? '' })));
        setPassMark(q.passMark);
        setExists(true);
      })
      .catch(() => live && setQuestions([blank()]));
    return () => {
      live = false;
    };
  }, [open, questions, ndk, lesson]);

  const edit = (i: number, patch: Partial<TutorQuestion>) =>
    setQuestions((qs) => qs && qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  async function save() {
    if (!ndk?.signer || !questions) return;
    setBusy(true);
    setMsg(null);
    try {
      const clean = questions
        .map((q) => ({ ...q, q: q.q.trim(), options: q.options.map((o) => o.trim()), explain: q.explain?.trim() }))
        .filter((q) => q.q);
      await saveQuiz(ndk, ndk.signer, { lesson, bootcamp, bootcampTitle, questions: clean, passMark });
      setExists(true);
      setMsg('Saved. Learners see it at the end of this lesson.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!ndk?.signer) return;
    setBusy(true);
    try {
      await removeQuiz(ndk, ndk.signer, lesson, bootcamp);
      setExists(false);
      setQuestions([blank()]);
      setMsg('Quiz removed.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-10 w-full rounded-[18px] border-[1.5px] border-dashed border-line-strong px-4 py-3.5 text-left text-sm"
      >
        <strong>Quiz for this lesson</strong>
        <br />
        <span className="text-ink-soft">
          Learners who pass every quiz in the bootcamp get the completion badge automatically.
        </span>
      </button>
    );
  }

  return (
    <section aria-label="Quiz editor" className="mt-10 flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Quiz for this lesson</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-faint hover:text-ink">
          Close
        </button>
      </div>
      {!questions && <p className="font-mono text-xs text-ink-faint">loading…</p>}
      {questions?.map((q, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl bg-bg p-3">
          <input
            value={q.q}
            onChange={(e) => edit(i, { q: e.target.value })}
            placeholder={`Question ${i + 1}`}
            aria-label={`Question ${i + 1}`}
            className={field}
          />
          {q.options.map((o, j) => (
            <div key={j} className="flex items-center gap-2">
              <input
                type="radio"
                name={`answer${i}`}
                checked={q.answer === j}
                onChange={() => edit(i, { answer: j })}
                aria-label={`Option ${j + 1} is correct`}
                className="accent-brand"
              />
              <input
                value={o}
                onChange={(e) => edit(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                placeholder={`Option ${j + 1}`}
                aria-label={`Question ${i + 1}, option ${j + 1}`}
                className={field}
              />
              {q.options.length > 2 && (
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() =>
                    edit(i, {
                      options: q.options.filter((_, k) => k !== j),
                      answer: q.answer === j ? 0 : q.answer > j ? q.answer - 1 : q.answer,
                    })
                  }
                  className="shrink-0 px-1 text-ink-faint hover:text-danger"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between">
            {q.options.length < 5 ? (
              <button type="button" onClick={() => edit(i, { options: [...q.options, ''] })} className="text-xs font-semibold text-brand">
                + Option
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setQuestions(questions.filter((_, k) => k !== i))}
              className="text-xs text-ink-faint hover:text-danger"
            >
              Remove question
            </button>
          </div>
          <input
            value={q.explain ?? ''}
            onChange={(e) => edit(i, { explain: e.target.value })}
            placeholder="Why that answer is right (shown after they answer)"
            aria-label={`Explanation for question ${i + 1}`}
            className={field}
          />
          <p className="text-[11px] text-ink-faint">Pick the correct option with the circle on its left.</p>
        </div>
      ))}
      {questions && questions.length < 20 && (
        <button type="button" onClick={() => setQuestions([...questions, blank()])} className="self-start text-sm font-semibold text-brand">
          + Add a question
        </button>
      )}
      <label className="flex items-center gap-3 text-sm">
        Pass mark
        <select value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} className="rounded-lg border border-line-strong bg-surface px-2 py-1.5">
          {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((m) => (
            <option key={m} value={m}>
              {Math.round(m * 100)}%
            </option>
          ))}
        </select>
      </label>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !questions?.some((q) => q.q.trim())}
          className="min-h-11 flex-1 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save quiz'}
        </button>
        {exists && (
          <button type="button" onClick={remove} disabled={busy} className="min-h-11 rounded-xl border border-line-strong px-4 text-sm">
            Remove
          </button>
        )}
      </div>
    </section>
  );
}

/** "Quizzes passed 2 of 3" under a bootcamp's header. Nothing when it has no quizzes. */
export function QuizProgressLine({ bootcamp, pubkey, tutor }: { bootcamp: Addr; pubkey: string; tutor: boolean }) {
  const [p, setP] = useState<QuizProgress | null>(null);
  useEffect(() => {
    let live = true;
    getQuizProgress(bootcamp, pubkey)
      .then((x) => live && setP(x))
      .catch(() => live && setP(null));
    return () => {
      live = false;
    };
  }, [bootcamp, pubkey]);

  if (!p || p.quizzes.length === 0) return null;
  const n = p.quizzes.length;
  return (
    <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] ${p.completed ? 'bg-good/10 text-good' : 'bg-brand-soft text-brand-ink'}`}>
      {tutor
        ? `${n} lesson${n === 1 ? ' has a quiz' : 's have quizzes'}. Learners who pass them all get the completion badge automatically.`
        : p.completed
          ? 'You passed every quiz. Your completion badge is on your profile.'
          : `Quizzes passed: ${p.passed.length} of ${n}. Pass them all to get the completion badge automatically.`}
    </p>
  );
}
