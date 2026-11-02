/**
 * Link previews for /@name. WhatsApp, X, Telegram and friends don't run
 * JavaScript, so they can't see anything the SPA sets. vercel.json rewrites only
 * their user agents here; people still get the normal app.
 *
 * Any failure (index asleep or offline, unknown handle) still answers with a
 * valid generic Bluey preview, so a shared link never looks broken.
 */

export const config = { runtime: 'edge' };

const INDEX_URL = process.env.INDEX_HTTP_URL || 'https://index.bluey.xyz';
const TAGLINE = 'Every Ship, vouch and badge is a signed Nostr event anyone can check.';

interface Card {
  name: string | null;
  about: string | null;
  picture: string | null;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Collapse whitespace and cut on a character boundary, not inside an emoji. */
function clip(s: string, max: number) {
  const chars = [...s.replace(/\s+/g, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

const httpsOnly = (url: string | null) => {
  try {
    return url && new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

async function fetchCard(handle: string): Promise<Card | null> {
  try {
    const r = await fetch(`${INDEX_URL}/v1/card?handle=${encodeURIComponent(handle)}`, {
      // crawlers give up after a few seconds; better a generic preview than none
      signal: AbortSignal.timeout(2500),
    });
    return r.ok ? ((await r.json()) as Card) : null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const handle = (url.searchParams.get('handle') ?? '').slice(0, 256);
  const card = handle ? await fetchCard(handle) : null;

  const name = card?.name ? clip(card.name, 70) : null;
  const title = name ? `${name} on Bluey` : 'Bluey: learn Bitcoin, prove your work';
  const description = card?.about ? clip(card.about, 200) : name ? `See what ${name} has shipped. ${TAGLINE}` : TAGLINE;
  const image = httpsOnly(card?.picture ?? null) ?? `${url.origin}/pwa-512x512.png`;
  const page = handle ? `${url.origin}/@${encodeURIComponent(handle).replace(/%40/g, '@')}` : url.origin;

  const [t, d, i, p] = [title, description, image, page].map(escapeHtml);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${p}">
<meta property="og:site_name" content="Bluey">
<meta property="og:type" content="profile">
<meta property="og:url" content="${p}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${i}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head>
<body><h1>${t}</h1><p>${d}</p><p><a href="${p}">Open in Bluey</a></p></body>
</html>
`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // a profile edit shows up within minutes; a miss retries soon after the index wakes
      'cache-control': `public, s-maxage=${card ? 600 : 60}, stale-while-revalidate=3600`,
    },
  });
}
