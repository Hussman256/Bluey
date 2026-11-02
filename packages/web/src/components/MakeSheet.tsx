import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Composer } from './Composer';

function Tile({
  to,
  onClick,
  title,
  hint,
  tone,
  icon,
}: {
  to?: string;
  onClick?: () => void;
  title: string;
  hint: string;
  tone: 'plain' | 'brand' | 'slab';
  icon: ReactNode;
}) {
  const cls = `flex min-h-[120px] flex-col justify-between rounded-[20px] p-3.5 text-left ${
    tone === 'brand' ? 'bg-brand text-white' : tone === 'slab' ? 'bg-slab text-white' : 'bg-bg text-ink'
  }`;
  const body = (
    <>
      {icon}
      <span>
        <strong className="text-base">{title}</strong>
        <br />
        <span className={`text-[13px] ${tone === 'plain' ? 'text-ink-soft' : 'text-white/80'}`}>{hint}</span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} onClick={onClick} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

const icon = (d: string, stroke = 'currentColor') => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke={stroke} strokeWidth="1.8" aria-hidden="true">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The "+" sheet: one place to start any kind of post. */
export function MakeSheet({ onClose }: { onClose: () => void }) {
  const [composing, setComposing] = useState(false);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slab/55"
      />
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={composing ? 'New post' : 'Make something'}
        className="relative m-2.5 flex w-full max-w-md flex-col gap-3.5 rounded-[28px] bg-surface p-[18px] outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold">{composing ? 'New post' : 'Make something'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded-2xl bg-bg"
          >
            {icon('M6 6l12 12M18 6L6 18')}
          </button>
        </div>

        {composing ? (
          <div className="-mx-[18px]">
            <Composer placeholder="What did you build, learn or ship today?" onPublished={onClose} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Tile
                tone="plain"
                title="Post"
                hint="Say something quick"
                onClick={() => setComposing(true)}
                icon={icon('M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4z')}
              />
              <Tile
                tone="brand"
                title="Ship"
                hint="Proof of what you built"
                to="/ship/new"
                onClick={onClose}
                icon={icon('M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 4-8 9-9 2 0 3 1 3 3-1 5-5 8-9 9z')}
              />
              <Tile
                tone="plain"
                title="Club"
                hint="Start one, free"
                to="/clubs?new=1"
                onClick={onClose}
                icon={icon('M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6')}
              />
              <Tile
                tone="slab"
                title="Go live"
                hint="A class in your bootcamp"
                to="/learn"
                onClick={onClose}
                icon={icon('M12 12h.01M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14', 'var(--color-live)')}
              />
            </div>
            <Link
              to="/teach"
              onClick={onClose}
              className="flex items-center gap-3 rounded-[18px] border border-line px-3.5 py-3"
            >
              {icon('M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z')}
              <span className="flex-1 text-sm">
                <strong>Create a bootcamp</strong>
                <br />
                <span className="text-ink-soft">Lessons, a cohort club and a badge</span>
              </span>
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
