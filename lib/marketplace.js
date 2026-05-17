// AquaHub — Marketplace helpers
//
// Marketplace threads live in forum categories where `section = 'marketplace'`.
// There are now two marketplace sub-categories (mkt_freshwater, mkt_saltwater)
// instead of one ('marketplace'). To keep existing call sites working, we
// preserve the MARKETPLACE_CATEGORY_SLUG export but recommend using
// isMarketplaceSlug() / isMarketplaceCategory() for new code.

export const MARKETPLACE_SECTION = 'marketplace';

// All slugs that are treated as marketplace categories. If you add more
// marketplace sub-categories in SQL, add them here too (or refactor callers
// to look up section from the category record).
export const MARKETPLACE_SLUGS = ['mkt_freshwater', 'mkt_saltwater', 'marketplace'];

// Legacy export. Equals one of the marketplace slugs but isMarketplaceSlug()
// is the right check now.
export const MARKETPLACE_CATEGORY_SLUG = 'mkt_freshwater';

export function isMarketplaceSlug(slug) {
  return MARKETPLACE_SLUGS.includes(slug);
}

export function isMarketplaceCategory(category) {
  if (!category) return false;
  return category.section === MARKETPLACE_SECTION || isMarketplaceSlug(category.slug);
}

// ===========================================================
// Kinds
// ===========================================================

export const MARKETPLACE_KINDS = [
  {
    code: 'wts',
    label: 'WTS — Want to Sell',
    helper: 'I have something for sale',
    short: 'WTS',
    resolvedShort: 'SOLD',
    resolveVerb: 'Mark as sold',
    resolveConfirm: 'Mark this listing as sold? This locks replies.',
  },
  {
    code: 'fs',
    label: 'FS — For Sale',
    helper: 'Selling something to anyone interested',
    short: 'FS',
    resolvedShort: 'SOLD',
    resolveVerb: 'Mark as sold',
    resolveConfirm: 'Mark this listing as sold? This locks replies.',
  },
  {
    code: 'wtb',
    label: 'WTB — Want to Buy',
    helper: 'Looking to buy something',
    short: 'WTB',
    resolvedShort: 'FOUND',
    resolveVerb: 'Mark as found',
    resolveConfirm: 'Mark this as found? This locks replies.',
  },
  {
    code: 'ft',
    label: 'FT — For Trade',
    helper: 'Looking to swap',
    short: 'FT',
    resolvedShort: 'TRADED',
    resolveVerb: 'Mark as traded',
    resolveConfirm: 'Mark as traded? This locks replies.',
  },
];

export function kindMeta(code) {
  return MARKETPLACE_KINDS.find((k) => k.code === code) || null;
}

// ===========================================================
// Title prefix
// ===========================================================

export function marketplacePrefix(kindCode, status) {
  if (!kindCode) return null;
  const m = kindMeta(kindCode);
  if (!m) return null;
  return status === 'resolved' ? m.resolvedShort : m.short;
}

export function marketplacePrefixClass(kindCode, status) {
  if (!kindCode) return '';
  const isResolved = status === 'resolved';
  return isResolved
    ? 'mp-prefix mp-prefix-resolved'
    : `mp-prefix mp-prefix-${kindCode}`;
}

// ===========================================================
// Meta strip
// ===========================================================

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function renderMarketplaceMetaStrip(meta) {
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
  return `<span class="mp-meta-bit">${bits.join('</span> <span class="mp-meta-bit">')}</span>`;
}

// ===========================================================
// Validation
// ===========================================================

export function validateMarketplaceFields({ categorySlug, kind, meta }) {
  if (!isMarketplaceSlug(categorySlug)) {
    return { valid: true, error: null };
  }
  if (!kindMeta(kind)) {
    return { valid: false, error: 'Pick a listing type (WTS, FS, WTB, or FT).' };
  }
  if (meta) {
    if (meta.price !== undefined && meta.price !== null && meta.price !== '') {
      const n = Number(meta.price);
      if (Number.isNaN(n) || n < 0 || n > 999999) {
        return { valid: false, error: 'Price must be a positive number.' };
      }
    }
    if (meta.location && String(meta.location).length > 80) {
      return { valid: false, error: 'Location must be 80 characters or less.' };
    }
  }
  return { valid: true, error: null };
}
