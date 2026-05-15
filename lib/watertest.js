// AquaHub — Water test analysis
//
// Pure functions for evaluating water test readings against:
//   - Generic ideal ranges by water type (freshwater / brackish / saltwater)
//   - The actual livestock in the tank (tiered species-aware warnings)
//
// Two-tier warning model:
//   - RED  ("out of range"):    reading is outside the *union* of all species ranges —
//                               i.e. no species in this tank tolerates this value
//   - YELLOW ("outside ideal"): reading is inside the union but outside the *intersection* —
//                               some species are happy, others are stressed
//   - GREEN ("ok"):             reading is inside every species' preferred range

// ===========================================================
// Generic ideal ranges
// ===========================================================
// These are defensible community baselines, not absolutes.
// Used as a fallback when no species-specific ranges are available.

export const GENERIC_RANGES = {
  freshwater: {
    temperature: { min: 72, max: 82, unit: '°F' },
    ph:          { min: 6.5, max: 7.8, unit: '' },
    ammonia:     { min: 0,   max: 0,   unit: 'ppm', toxic: 0.25 },
    nitrite:     { min: 0,   max: 0,   unit: 'ppm', toxic: 0.5 },
    nitrate:     { min: 0,   max: 40,  unit: 'ppm', toxic: 80 },
    gh:          { min: 4,   max: 12,  unit: 'dGH' },
    kh:          { min: 3,   max: 10,  unit: 'dKH' },
  },
  brackish: {
    temperature: { min: 74, max: 82, unit: '°F' },
    ph:          { min: 7.5, max: 8.4, unit: '' },
    ammonia:     { min: 0,   max: 0,   unit: 'ppm', toxic: 0.25 },
    nitrite:     { min: 0,   max: 0,   unit: 'ppm', toxic: 0.5 },
    nitrate:     { min: 0,   max: 30,  unit: 'ppm', toxic: 60 },
    gh:          { min: 8,   max: 20,  unit: 'dGH' },
    kh:          { min: 8,   max: 15,  unit: 'dKH' },
  },
  saltwater: {
    temperature: { min: 75, max: 80, unit: '°F' },
    ph:          { min: 8.1, max: 8.4, unit: '' },
    ammonia:     { min: 0,   max: 0,   unit: 'ppm', toxic: 0.25 },
    nitrite:     { min: 0,   max: 0,   unit: 'ppm', toxic: 0.5 },
    nitrate:     { min: 0,   max: 20,  unit: 'ppm', toxic: 50 },
    gh:          { min: null, max: null, unit: 'dGH' }, // not normally tested in salt
    kh:          { min: 8,   max: 12,  unit: 'dKH' },
  },
};

// Map tank types to which generic range set to use
function rangeSetForTank(tankType) {
  if (tankType === 'saltwater' || tankType === 'reef') return 'saltwater';
  if (tankType === 'brackish') return 'brackish';
  return 'freshwater';
}

// ===========================================================
// Species-aware ranges
// ===========================================================
// Reduces an array of species with min_temp/max_temp + min_ph/max_ph
// to two ranges:
//   - intersection: range where ALL species are in their preferred zone
//   - union:        range where AT LEAST ONE species tolerates it
//
// Species with null values are silently skipped for that parameter.

function combineSpeciesRanges(livestock, paramMin, paramMax) {
  let intersectionMin = -Infinity, intersectionMax = Infinity;
  let unionMin = Infinity, unionMax = -Infinity;
  let count = 0;

  for (const item of livestock) {
    const s = item.species;
    if (!s) continue;
    const lo = s[paramMin];
    const hi = s[paramMax];
    if (lo === null || lo === undefined || hi === null || hi === undefined) continue;
    intersectionMin = Math.max(intersectionMin, Number(lo));
    intersectionMax = Math.min(intersectionMax, Number(hi));
    unionMin        = Math.min(unionMin,        Number(lo));
    unionMax        = Math.max(unionMax,        Number(hi));
    count++;
  }

  if (count === 0) return null;

  // If species ranges don't overlap, intersection collapses — return null intersection
  // (we'll fall back to a single "union" check)
  const intersection =
    intersectionMin <= intersectionMax
      ? { min: intersectionMin, max: intersectionMax }
      : null;

  return {
    intersection,
    union: { min: unionMin, max: unionMax },
    speciesCount: count,
  };
}

// ===========================================================
// Per-parameter status
// ===========================================================

/**
 * Evaluate one parameter reading.
 * @param {string}   param         'temperature', 'ph', 'ammonia', etc.
 * @param {number}   value         the reading
 * @param {object}   tank          { tank_type }
 * @param {Array}    livestock     livestock array with .species joined
 * @returns {{
 *   status: 'ok'|'caution'|'bad'|'unknown',
 *   tone:   'success'|'warning'|'danger'|'neutral',
 *   reason: string,
 *   ideal:  { min, max } | null,
 *   source: 'species'|'generic'
 * }}
 */
export function evaluateReading(param, value, tank, livestock) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return { status: 'unknown', tone: 'neutral', reason: '', ideal: null, source: 'generic' };
  }
  const v = Number(value);

  // Toxic absolutes first (ammonia/nitrite/nitrate) — these override everything
  const gen = GENERIC_RANGES[rangeSetForTank(tank?.tank_type)][param];
  if (gen?.toxic !== undefined && v >= gen.toxic) {
    return {
      status: 'bad',
      tone: 'danger',
      reason: `${v} ${gen.unit} is toxic (${param})`.trim(),
      ideal: gen.min !== null ? { min: gen.min, max: gen.max } : null,
      source: 'generic',
    };
  }
  // Ammonia and nitrite: anything above 0 is a problem
  if ((param === 'ammonia' || param === 'nitrite') && v > 0) {
    return {
      status: 'bad',
      tone: 'danger',
      reason: `${v} ppm ${param} — should be 0`,
      ideal: { min: 0, max: 0 },
      source: 'generic',
    };
  }

  // Species-aware nitrate ceiling
  // Nitrate is a ceiling, not a range — find the most sensitive species and
  // use its max_nitrate as the safe upper bound for the whole tank.
  if (param === 'nitrate' && Array.isArray(livestock) && livestock.length > 0) {
    let strictestMax = null;
    let strictestSpecies = null;
    for (const item of livestock) {
      const s = item.species;
      if (!s) continue;
      if (s.max_nitrate === null || s.max_nitrate === undefined) continue;
      const mn = Number(s.max_nitrate);
      if (Number.isNaN(mn)) continue;
      if (strictestMax === null || mn < strictestMax) {
        strictestMax = mn;
        strictestSpecies = s.common_name;
      }
    }

    if (strictestMax !== null) {
      // Above the most-sensitive species' ceiling → red
      if (v > strictestMax) {
        return {
          status: 'bad',
          tone: 'danger',
          reason: `Above ${strictestSpecies}'s nitrate ceiling (${strictestMax} ppm) — water change recommended`,
          ideal: { min: 0, max: strictestMax },
          source: 'species',
        };
      }
      // Within 75–100% of the ceiling → yellow (approaching the limit)
      if (v > strictestMax * 0.75) {
        return {
          status: 'caution',
          tone: 'warning',
          reason: `Approaching ${strictestSpecies}'s nitrate tolerance (${strictestMax} ppm) — plan a water change`,
          ideal: { min: 0, max: strictestMax },
          source: 'species',
        };
      }
      // Below 75% of ceiling → green
      return {
        status: 'ok',
        tone: 'success',
        reason: `Within nitrate tolerance for all species in this tank`,
        ideal: { min: 0, max: strictestMax },
        source: 'species',
      };
    }
  }

  // Species-aware for temperature and pH
  if (param === 'temperature' || param === 'ph') {
    const minKey = param === 'temperature' ? 'min_temp' : 'min_ph';
    const maxKey = param === 'temperature' ? 'max_temp' : 'max_ph';
    const combined = combineSpeciesRanges(livestock || [], minKey, maxKey);

    if (combined && combined.speciesCount > 0) {
      const { intersection, union } = combined;

      // Outside the union = no species tolerates this
      if (v < union.min || v > union.max) {
        return {
          status: 'bad',
          tone: 'danger',
          reason: `Outside the safe range for every species in this tank (${union.min}–${union.max}${gen?.unit || ''})`,
          ideal: intersection || union,
          source: 'species',
        };
      }
      // Inside union but outside intersection = some species stressed
      if (intersection && (v < intersection.min || v > intersection.max)) {
        return {
          status: 'caution',
          tone: 'warning',
          reason: `Outside the ideal range for some species (ideal ${intersection.min}–${intersection.max}${gen?.unit || ''})`,
          ideal: intersection,
          source: 'species',
        };
      }
      // Inside intersection = everybody happy
      return {
        status: 'ok',
        tone: 'success',
        reason: `Inside the ideal range for all species`,
        ideal: intersection,
        source: 'species',
      };
    }
  }

  // Fall back to generic range
  if (gen && gen.min !== null && gen.max !== null) {
    if (v < gen.min || v > gen.max) {
      return {
        status: 'caution',
        tone: 'warning',
        reason: `Outside typical ${rangeSetForTank(tank?.tank_type)} range (${gen.min}–${gen.max}${gen.unit ? ' ' + gen.unit : ''})`,
        ideal: { min: gen.min, max: gen.max },
        source: 'generic',
      };
    }
    return {
      status: 'ok',
      tone: 'success',
      reason: `Inside typical ${rangeSetForTank(tank?.tank_type)} range`,
      ideal: { min: gen.min, max: gen.max },
      source: 'generic',
    };
  }

  return { status: 'unknown', tone: 'neutral', reason: '', ideal: null, source: 'generic' };
}

// ===========================================================
// Parameter metadata
// ===========================================================

export const PARAMETERS = [
  { key: 'temperature', label: 'Temp',    step: 0.1, unit: '°F' },
  { key: 'ph',          label: 'pH',      step: 0.1, unit: '' },
  { key: 'ammonia',     label: 'NH₃',     step: 0.05, unit: 'ppm' },
  { key: 'nitrite',     label: 'NO₂',     step: 0.05, unit: 'ppm' },
  { key: 'nitrate',     label: 'NO₃',     step: 0.5, unit: 'ppm' },
  { key: 'gh',          label: 'gH',      step: 0.5, unit: 'dGH' },
  { key: 'kh',          label: 'kH',      step: 0.5, unit: 'dKH' },
];

export function paramMeta(key) {
  return PARAMETERS.find((p) => p.key === key) || null;
}

// ===========================================================
// Display helpers
// ===========================================================

export function formatReading(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  // Use one decimal except for nitrate/gh/kh which can be whole numbers
  return unit ? `${n} ${unit}`.trim() : `${n}`;
}
