// AquaHub — Marketplace helpers
//
// Pure functions for formatting and validating marketplace forum threads.
// Imported by forum-compose.html, forum-thread.html, forum-category.html.

export const MARKETPLACE_CATEGORY_SLUG = 'marketplace';

export const MARKETPLACE_KINDS = [
  {
    code: 'wts',
    label: 'WTS — Want to Sell',
    shortLabel: 'WTS',
    helper: 'I have something I want to sell.',
    resolvedLabel: 'SOLD',
    resolveVerb: 'Mark as sold',
  },
  {
    code: 'fs',
    label: 'FS — For Sale (free / casual)',
    shortLabel: 'FS',
    helper: 'Selling, but with less commitment (free, low price, take if interested).',
    resolvedLabel: 'SOLD',
    resolveVerb: 'Mark as sold',
  },
  {
    code: 'wtb',
    label: 'WTB — Want to Buy',
    shortLabel: 'WTB',
    helper: 'Looking to buy something specific.',
    resolvedLabel: 'FOUND',
    resolveVerb: 'Mark as found',
  },
  {
    code: 'ft',
    label: 'FT — For Trade',
    shortLabel: 'FT',
    helper: 'Open to trading for something else.',
    resolvedLabel: 'TRADED',
    resolveVerb: 'Mark as traded',
  },
];

/**
 * Returns the kind config for a given code, or null.
 */
export function getMarketplaceKind(code) {
  if (!code) return null;
  return MARKETPLACE_KINDS.find((k) => k.code === code) || null;
}

/**
 * Returns the prefix to render for a thread title.
 * e.g. (kind='wts', status='active')   → '[WTS]'
 *      (kind='wts', status='resolved') → '[SOLD]'
 *      (kind=null, ...)                → '' (non-marketplace)
 */
export function marketplacePrefix(kind, status) {
  const k = getMarketplaceKind(kind);
  if (!k) return '';
  if (status === 'resolved') return `[${k.resolvedLabel}]`;
  return `[${k.shortLabel}]`;
}

/**
 * Returns a CSS class for visual treatment of the prefix badge.
 */
export function marketplacePrefixClass(kind, status) {
  if (!kind) return '';
  if (status === 'resolved') return 'mp-prefix mp-prefix-resolved';
  if (kind === 'wtb') return 'mp-prefix mp-prefix-wtb';
  if (kind === 'ft')  return 'mp-prefix mp-prefix-ft';
  return 'mp-prefix mp-prefix-sell';
}

/**
 * Format a thread title with its marketplace prefix.
 *   marketplaceThreadTitle({ title: 'My tank', marketplace_kind: 'wts', marketplace_status: 'active' })
 *   → '[WTS] My tank'
 */
export function marketplaceThreadTitle(thread) {
  const prefix = marketplacePrefix(thread.marketplace_kind, thread.marketplace_status);
  if (!prefix) return thread.title;
  return `${prefix} ${thread.title}`;
}

/**
 * Format the price as USD (or whatever currency the user enters — we store a number).
 */
export function formatPrice(price) {
  if (price === null || price === undefined || price === '') return null;
  const n = Number(price);
  if (Number.isNaN(n)) return null;
  if (n === 0) return 'Free';
  return `$${n.toFixed(2).replace(/\.00$/, '')}`;
}

/**
 * Render the meta strip HTML (price · location · shipping). Returns '' if no fields populated.
 * Caller is responsible for embedding in a parent element with the .mp-meta-strip class.
 */
export function renderMarketplaceMetaStrip(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const parts = [];

  const priceStr = formatPrice(meta.price);
  if (priceStr) parts.push(`<span class="mp-meta-price">💰 ${escapeHtml(priceStr)}</span>`);

  if (meta.location && String(meta.location).trim() !== '') {
    parts.push(`<span class="mp-meta-location">📍 ${escapeHtml(meta.location)}</span>`);
  }

  if (meta.willing_to_ship === true) {
    parts.push(`<span class="mp-meta-ship">📦 Will ship</span>`);
  } else if (meta.willing_to_ship === false && (meta.price != null || meta.location)) {
    // Only show "local only" if some other field is populated (otherwise it's noise)
    parts.push(`<span class="mp-meta-ship-no">🏠 Local pickup only</span>`);
  }

  if (parts.length === 0) return '';
  return parts.join('');
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * Validate marketplace fields at compose time.
 * Returns { valid, error } — error is a user-facing string when invalid.
 */
export function validateMarketplaceFields({ categorySlug, kind, meta }) {
  if (categorySlug !== MARKETPLACE_CATEGORY_SLUG) {
    return { valid: true, error: null };
  }
  if (!kind || !getMarketplaceKind(kind)) {
    return { valid: false, error: 'Please pick what kind of marketplace post this is.' };
  }
  if (meta?.price != null && meta.price !== '') {
    const n = Number(meta.price);
    if (Number.isNaN(n) || n < 0) {
      return { valid: false, error: 'Price must be a positive number (or leave blank).' };
    }
  }
  return { valid: true, error: null };
}
