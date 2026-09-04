import { Fragment, type ReactNode } from 'react';

/**
 * Small, safe Markdown renderer — builds React elements, never sets innerHTML.
 * Covers headings, lists, code blocks, inline code / bold / italic / links,
 * blockquotes, hr and images. Enough for lesson content.
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(!?\[([^\]]*)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${keyBase}t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      // link or image
      if (m[1].startsWith('!')) {
        out.push(
          <img
            key={`${keyBase}i${i++}`}
            src={m[3]}
            alt={m[2]}
            loading="lazy"
            className="my-2 max-h-[28rem] rounded-lg border border-line"
          />,
        );
      } else {
        out.push(
          <a
            key={`${keyBase}l${i++}`}
            href={m[3]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-proto hover:underline"
          >
            {m[2] || m[3]}
          </a>,
        );
      }
    } else if (m[4] !== undefined) {
      out.push(
        <code
          key={`${keyBase}c${i++}`}
          className="rounded bg-sunk px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {m[5]}
        </code>,
      );
    } else if (m[6] !== undefined) {
      out.push(<strong key={`${keyBase}b${i++}`}>{m[7]}</strong>);
    } else if (m[8] !== undefined) {
      out.push(<em key={`${keyBase}e${i++}`}>{m[9]}</em>);
    } else if (m[10] !== undefined) {
      out.push(
        <a
          key={`${keyBase}u${i++}`}
          href={m[10]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-proto hover:underline"
        >
          {m[10].replace(/^https?:\/\//, '')}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(<Fragment key={`${keyBase}t${i++}`}>{text.slice(last)}</Fragment>);
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // fenced code
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg border border-line bg-sunk p-3 font-mono text-xs"
        >
          <code data-lang={lang}>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = ['text-2xl', 'text-xl', 'text-lg', 'text-base'][level - 1];
      const Tag = (`h${level}` as 'h1');
      blocks.push(
        <Tag key={key++} className={`mt-5 mb-2 font-display font-semibold ${cls}`}>
          {inline(h[2], `h${key}`)}
        </Tag>,
      );
      i++;
      continue;
    }

    // hr
    if (/^([-*_])\1{2,}$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-5 border-line" />);
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 border-l-2 border-line-strong pl-3 text-ink-soft"
        >
          {inline(buf.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // list
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={key++} className={`my-3 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, n) => (
            <li key={n} className="my-1">
              {inline(it, `li${key}-${n}`)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="my-3 leading-relaxed">
        {inline(buf.join(' '), `p${key}`)}
      </p>,
    );
  }

  return <div className="text-[0.97rem]">{blocks}</div>;
}
