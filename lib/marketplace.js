// AquaHub — Marketplace helpers
//
// Marketplace threads are forum threads in any category where the
// category's `section` = 'marketplace'. Previously this was a single
// hardcoded slug ('marketplace'); now there are sectioned sub-categories
// (mkt_freshwater, mkt_saltwater) that all share section = 'marketplace'.

// The section identifier on forum_categories that indicates a marketplace
// sub-category. Compose / category / thread UI checks this against the
// fetched category record's `.section` field.
export const MARKETPLACE_SECTION = 'marketplace';

/**
 * True when the given category record is a marketplace sub-category.
 * Pass the row from forum_categories, not just the slug.
 */
export function isMarketplaceCategory(category) {
  return !!category && category.section === MARKETPLACE_SECTION;
}

// ===========================================================
// Kinds
// ===========================================================

export const MARKETPLACE_KINDS = [
  {
    key: 'wts',
    label: 'WTS — Want to Sell',
    short: 'WTS',
    resolvedShort: 'SOLD',
    resolvedLabel: 'Sold',
    resolveVerb: 'Mark as sold',
    resolveConfirm: 'Mark this listing as sold? This locks replies.',
  },
  {
    key: 'fs',
    label: 'FS — For Sale',
    short: 'FS',
    resolvedShort: 'SOLD',
    resolvedLabel: 'Sold',
    resolveVerb: 'Mark as sold',
    resolveConfirm: 'Mark this listing as sold? This locks replies.',
  },
  {
    key: 'wtb',
    label: 'WTB — Want to Buy',
    short: 'WTB',
    resolvedShort: 'FOUND',
    resolvedLabel: 'Found',
    resolveVerb: 'Mark as found',
    resolveConfirm: 'Mark this as found? This locks replies.',
  },
  {
    key: 'ft',
    label: 'FT — For Trade',
    short: 'FT',
    resolvedShort: 'TRADED',
    resolvedLabel: 'Traded',
    resolveVerb: 'Mark as traded',
    resolveConfirm: 'Mark as traded? This locks replies.',
  },
];

export function kindMeta(kind) {
  return MARKETPLACE_KINDS.find((k) => k.key === kind) || null;
}

export function validateKind(kind) {
  return !!kindMeta(kind);
}

// ===========================================================
// Title prefix
// ===========================================================

/**
 * Format a thread title with its marketplace prefix.
 * (wts, active)    -> '[WTS] My Acropora colony'
 * (wts, resolved)  -> '[SOLD] My Acropora colony'
 * (null, _)        -> 'My Acropora colony'   (non-marketplace thread)
 */
export function formatTitleWithPrefix(title, marketplaceKind, marketplaceStatus) {
  if (!marketplaceKind) return title;
  const meta = kindMeta(marketplaceKind);
  if (!meta) return title;
  const prefix = marketplaceStatus === 'resolved' ? meta.resolvedShort : meta.short;
  return `[${prefix}] ${title}`;
}

/**
 * Same as above but returns just the prefix part (for separate styling),
 * or null if not a marketplace thread.
 */
export function marketplacePrefix(marketplaceKind, marketplaceStatus) {
  if (!marketplaceKind) return null;
  const meta = kindMeta(marketplaceKind);
  if (!meta) return null;
  return marketplaceStatus === 'resolved' ? meta.resolvedShort : meta.short;
}

// ===========================================================
// Meta strip
// ===========================================================

/**
 * Render the price/location/ship strip as HTML. Returns empty string
 * when there's nothing to render.
 */
export function renderMetaStrip(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const bits = [];
  if (meta.price !== undefined && meta.price !== null && meta.price !== '') {
    const n = Number(meta.price);
    if (!Number.isNaN(n) && n >= 0) bits.push(`💰 $${n}`);
  }
  if (meta.location) {
    bits.push(`📍 ${escapeHtml(meta.location)}`);
  }
  if (meta.willing_to_ship) {
    bits.push('📦 Will ship');
  }
  if (!bits.length) return '';
  return `<div class="marketplace-meta-strip">${bits.join(' &nbsp;·&nbsp; ')}</div>`;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ===========================================================
// Validation for the compose form
// ===========================================================

/**
 * Validate marketplace fields at submit. Returns null if OK, error string otherwise.
 */
export function validateMarketplaceFields({ kind, price, location }) {
  if (!validateKind(kind)) return 'Pick a marketplace listing type.';
  if (price !== '' && price !== null && price !== undefined) {
    const n = Number(price);
    if (Number.isNaN(n) || n < 0 || n > 999999) {
      return 'Price must be a positive number.';
    }
  }
  if (location && location.length > 80) {
    return 'Location must be 80 characters or less.';
  }
  return null;
}
