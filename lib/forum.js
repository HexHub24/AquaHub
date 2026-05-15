// AquaHub — Forum helpers
//
// Markdown-to-safe-HTML rendering, time formatting, snippet generation,
// and tank snapshot extraction. No DOM dependencies; safe to import
// anywhere in the app.

// ===========================================================
// Minimal markdown renderer with strict allowlist sanitization
// ===========================================================
// We support a deliberately limited subset:
//   - **bold**, *italic*, `code`
//   - [link text](url)  (urls must be http/https only, no javascript:)
//   - # headings (1-3)
//   - > blockquotes
//   - - or * list items
//   - ```code blocks```
//   - paragraph breaks
//   - images via standard markdown ![alt](url) — same url filter
//
// Anything else is escaped to plain text. This is intentionally
// conservative — a real forum gets safer over time as we whitelist
// more features, not less.

const URL_OK = /^https?:\/\/[^\s<>"]+$/i;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInline(s) {
  // Escape first, then re-introduce allowed markup
  let out = escapeHtml(s);

  // Inline code: `code` — must be done before bold/italic so we don't
  // accidentally match * inside code spans
  out = out.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

  // Images: ![alt](url) — must be before regular links
  out = out.replace(/!\[([^\]]*?)\]\(([^)]+?)\)/g, (m, alt, url) => {
    if (!URL_OK.test(url)) return escapeHtml(m);
    return `<img src="${url}" alt="${alt}" loading="lazy" />`;
  });

  // Links: [text](url)
  out = out.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (m, text, url) => {
    if (!URL_OK.test(url)) return escapeHtml(m);
    return `<a href="${url}" target="_blank" rel="nofollow noopener noreferrer">${text}</a>`;
  });

  // Bold **x**
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');

  // Italic *x*  (single-asterisk; lookahead/behind to avoid eating ** matches)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

  return out;
}

/**
 * Render markdown source to a safe HTML string.
 * Pure function, no DOM. Output is intended to be set as innerHTML on
 * a container whose contents we control.
 */
export function renderMarkdown(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const out = [];

  let i = 0;
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  const closeOpenBlocks = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  };

  while (i < lines.length) {
    let line = lines[i];

    // Code fence
    if (/^```/.test(line.trim())) {
      closeOpenBlocks();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      i++; // skip closing fence
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      closeOpenBlocks();
      const level = headingMatch[1].length;
      out.push(`<h${level + 2}>${renderInline(headingMatch[2])}</h${level + 2}>`);
      // h3 max for safety (since the page itself has h1/h2)
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
      const text = line.replace(/^>\s?/, '');
      out.push(`<p>${renderInline(text)}</p>`);
      i++;
      continue;
    }
    if (inBlockquote && line.trim() === '') {
      // blockquote ends on blank line
      out.push('</blockquote>');
      inBlockquote = false;
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      if (!inUl) { closeOpenBlocks(); out.push('<ul>'); inUl = true; }
      const item = line.replace(/^\s*[-*+]\s+/, '');
      out.push(`<li>${renderInline(item)}</li>`);
      i++;
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) { closeOpenBlocks(); out.push('<ol>'); inOl = true; }
      const item = line.replace(/^\s*\d+\.\s+/, '');
      out.push(`<li>${renderInline(item)}</li>`);
      i++;
      continue;
    }

    // End list on blank line or non-list
    if ((inUl || inOl) && line.trim() === '') {
      closeOpenBlocks();
      i++;
      continue;
    }

    // Blank line = paragraph break
    if (line.trim() === '') {
      closeOpenBlocks();
      i++;
      continue;
    }

    // Default: collect consecutive non-blank lines as a paragraph
    closeOpenBlocks();
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^```/.test(lines[i].trim()) &&
           !/^#{1,3}\s/.test(lines[i]) &&
           !/^>\s?/.test(lines[i]) &&
           !/^\s*[-*+]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(paraLines.join(' '))}</p>`);
  }

  closeOpenBlocks();
  return out.join('\n');
}

// ===========================================================
// Snippet generation (for thread previews)
// ===========================================================

/**
 * Return a plain-text snippet of markdown content, suitable for thread
 * list previews. Strips formatting, collapses whitespace, truncates.
 */
export function snippet(src, maxChars = 180) {
  if (!src) return '';
  let s = String(src)
    .replace(/```[\s\S]*?```/g, ' ')              // remove code fences
    .replace(/!\[([^\]]*?)\]\([^)]+?\)/g, ' ')    // remove images
    .replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1')    // links -> text
    .replace(/`([^`\n]+?)`/g, '$1')               // inline code
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')         // bold
    .replace(/\*([^*\n]+?)\*/g, '$1')             // italic
    .replace(/^#{1,3}\s+/gm, '')                  // heading markers
    .replace(/^>\s?/gm, '')                       // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, '')                // list bullets
    .replace(/^\s*\d+\.\s+/gm, '')                // ordered list
    .replace(/\s+/g, ' ')                         // collapse whitespace
    .trim();
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1).trimEnd() + '…';
}

// ===========================================================
// Time formatting
// ===========================================================

/**
 * Compact relative time: "just now", "3m", "2h", "5d", "Mar 12"
 */
export function timeAgo(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 365) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Full timestamp for tooltips and detail pages: "Mar 12, 2026 at 4:30 PM"
 */
export function fullTime(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ===========================================================
// Tank snapshot
// ===========================================================

/**
 * Build a snapshot blob from a tank + livestock + (optional) bioload result.
 * This is what gets stored on a thread when the user attaches a tank.
 * Snapshots are intentionally minimal — they don't include private fields
 * like prices, maintenance logs, or water tests.
 */
export function buildTankSnapshot({ tank, livestock = [], bioloadResult = null, primaryPhotoUrl = null }) {
  if (!tank) return null;
  const livestockSummary = livestock.map((l) => ({
    name: l.species?.common_name || l.custom_name || 'Unknown',
    scientific: l.species?.scientific_name || null,
    type: l.species?.species_type || 'other',
    quantity: l.quantity || 0,
  }));
  return {
    name: tank.name,
    tank_type: tank.tank_type,
    volume_gallons: tank.volume_gallons,
    setup_date: tank.setup_date,
    lighting: tank.lighting,
    livestock: livestockSummary,
    bioload_pct: bioloadResult ? Math.round(bioloadResult.percent) : null,
    bioload_status: bioloadResult ? bioloadResult.status : null,
    primary_photo_url: primaryPhotoUrl,
    snapshot_at: new Date().toISOString(),
  };
}

// ===========================================================
// Display name validation (matches DB constraint)
// ===========================================================

const NAME_RE = /^[A-Za-z0-9 _-]+$/;

export function validateDisplayName(name) {
  if (!name) return 'Display name is required.';
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Display name must be at least 2 characters.';
  if (trimmed.length > 30) return 'Display name must be 30 characters or less.';
  if (!NAME_RE.test(trimmed)) return 'Use letters, numbers, spaces, hyphens, or underscores only.';
  return null; // valid
}

// ===========================================================
// Profanity / spam check (very basic — placeholder for real one later)
// ===========================================================

const SLUR_PATTERNS = [
  // Intentionally minimal; real moderation needs a proper service.
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\bn+i+g+/i,
  /\bf+a+g+/i,
  /\bc+u+n+t+/i,
];

/**
 * Returns the matched word if the text contains a flagged term, or null.
 * Used on thread titles (which are forever-visible) — not on bodies, since
 * those can be reported and removed if needed.
 */
export function titleProfanityCheck(text) {
  if (!text) return null;
  for (const p of SLUR_PATTERNS) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}
