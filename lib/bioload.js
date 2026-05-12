// AquaHub — Bioload calculator
//
// Pure calculation functions, no DOM, no Supabase. Shared between
// the inline tank widget and the standalone /bioload.html planner.
//
// Methodology
// -----------
// 1. Each species has a curated `bioload_score` representing one adult's
//    waste contribution, anchored at Neon Tetra = 1.0.
// 2. For species without a curated score, we ESTIMATE from max_size_inches
//    and diet (carnivores produce more N per unit mass). The result is
//    flagged so the UI can show "estimated" badges.
// 3. Tank capacity is computed from volume_gallons * stockingFactor(type).
//    Reef and planted tanks have lower stocking factors (corals are
//    sensitive; planted relies on plant uptake but we don't double-count).
// 4. Plant offset reduces the effective bioload, capped at 40% of the
//    raw load so users can't "plant their way out of" overstocking.

// ===========================================================
// Tunable constants — single source of truth for the math
// ===========================================================

// One "stocking unit" = bioload of one adult neon tetra.
// Capacity is in stocking units per gallon.
export const STOCKING_FACTORS = {
  freshwater: 1.0,   // baseline
  planted:    1.1,   // plants buffer ammonia, slight bonus
  saltwater:  0.6,   // marine fish are bigger / more sensitive
  reef:       0.5,   // reef fish + corals need very stable conditions
};

// Maximum fraction of bioload that plants can offset
export const PLANT_OFFSET_CAP = 0.40;

// Conversion: 1 mg NO3 offset per day ≈ 0.05 stocking-units-equivalent.
// Derivation: a neon tetra produces roughly 20 mg NO3/day under typical
// conditions, so 1 mg/day offset ≈ 0.05 neons of removed load.
export const NITRATE_TO_UNITS = 0.05;

// ===========================================================
// Per-species bioload (curated or estimated)
// ===========================================================

/**
 * Compute a livestock entry's bioload contribution.
 * @param {object} item   livestock row joined with species
 * @returns {{units: number, perIndividual: number, source: 'curated'|'estimated'|'unknown', reason?: string}}
 */
export function livestockBioload(item) {
  const qty = item.quantity || 0;
  const species = item.species;

  // Plants don't contribute bioload — they may offset it instead
  if (species?.species_type === 'plant') {
    return { units: 0, perIndividual: 0, source: 'curated', reason: 'Plants do not contribute bioload.' };
  }

  // Use curated score if present
  if (species && species.bioload_score !== null && species.bioload_score !== undefined) {
    const per = Number(species.bioload_score);
    return { units: per * qty, perIndividual: per, source: 'curated' };
  }

  // Estimate from size + diet
  const per = estimateBioloadScore(species, item);
  if (per !== null) {
    return { units: per * qty, perIndividual: per, source: 'estimated' };
  }

  // Fully unknown (custom entry with no library link)
  // We assume an average small community fish so we don't return zero —
  // zero would let users add unlimited customs and think they're fine.
  return {
    units: 1.5 * qty,
    perIndividual: 1.5,
    source: 'unknown',
    reason: 'Custom entry — using a conservative default of 1.5 units each.',
  };
}

/**
 * Fall-back estimator when curated bioload_score is missing.
 * Returns null only if we have literally no information.
 */
function estimateBioloadScore(species, item) {
  if (!species) return null;
  const size = species.max_size_inches;
  if (!size) return null;

  // Base: bioload scales roughly with body mass, mass scales ~ length^2.5
  // for typical aquarium fish (most are not eel-shaped).
  // Calibrate: 1.5" neon = 1.0, 3" guppy ≈ 1.5, 6" angel ≈ 8.
  let score = Math.pow(size / 1.5, 2.5);

  // Diet adjustment: carnivores produce more nitrogenous waste per gram
  if (species.diet === 'carnivore') score *= 1.3;
  else if (species.diet === 'herbivore') score *= 0.85;

  // Invert adjustment: shrimp and snails produce far less waste than fish of the same size
  if (species.species_type === 'invertebrate') score *= 0.15;

  // Coral adjustment: very low (filter feeders, mostly photosynthetic)
  if (species.species_type === 'coral') score *= 0.1;

  return Math.round(score * 10) / 10;
}

// ===========================================================
// Plant offset
// ===========================================================

/**
 * Compute plant nitrate offset in stocking units.
 * @param {Array} livestock — full livestock list
 * @returns {{units: number, plants: Array}}
 */
export function plantOffset(livestock) {
  const plants = livestock.filter(
    (x) => x.species?.species_type === 'plant' && x.species?.nitrate_offset_per_day,
  );
  let nitrateMg = 0;
  for (const p of plants) {
    nitrateMg += Number(p.species.nitrate_offset_per_day) * (p.quantity || 0);
  }
  return {
    units: nitrateMg * NITRATE_TO_UNITS,
    nitrateMg,
    plants,
  };
}

// ===========================================================
// Tank-level computation
// ===========================================================

/**
 * Compute a complete bioload assessment for a tank.
 *
 * @param {object} tank  — { tank_type, volume_gallons }
 * @param {Array}  livestock — array of livestock rows with .species joined
 * @returns {{
 *   capacity: number,         // stocking units the tank supports
 *   rawLoad: number,          // sum of all livestock bioload, before plant offset
 *   offsetApplied: number,    // actual plant offset applied (after cap)
 *   offsetMax: number,        // theoretical plant offset before cap
 *   netLoad: number,          // load after plant offset
 *   percent: number,          // netLoad / capacity * 100
 *   status: 'understocked'|'comfortable'|'fully stocked'|'overstocked'|'severely overstocked',
 *   contributors: Array<{ id, name, quantity, units, perIndividual, source }>,
 *   warnings: string[],
 *   tankType: string,
 *   stockingFactor: number,
 * }}
 */
export function computeBioload(tank, livestock) {
  const tankType = tank.tank_type || 'freshwater';
  const volume = Number(tank.volume_gallons) || 0;
  const stockingFactor = STOCKING_FACTORS[tankType] ?? STOCKING_FACTORS.freshwater;
  const capacity = volume * stockingFactor;

  const warnings = [];
  const contributors = [];
  let rawLoad = 0;

  for (const item of livestock) {
    const b = livestockBioload(item);
    if (b.units > 0) {
      contributors.push({
        id: item.id,
        name: item.species?.common_name || item.custom_name || 'Unknown',
        quantity: item.quantity,
        units: b.units,
        perIndividual: b.perIndividual,
        source: b.source,
      });
      rawLoad += b.units;
    }
  }

  contributors.sort((a, b) => b.units - a.units);

  const offset = plantOffset(livestock);
  const offsetMax = offset.units;
  const offsetCap = rawLoad * PLANT_OFFSET_CAP;
  const offsetApplied = Math.min(offsetMax, offsetCap);
  const netLoad = Math.max(0, rawLoad - offsetApplied);

  const percent = capacity > 0 ? (netLoad / capacity) * 100 : 0;

  let status;
  if (volume === 0)            status = 'unknown';
  else if (percent < 30)       status = 'understocked';
  else if (percent < 75)       status = 'comfortable';
  else if (percent < 100)      status = 'fully stocked';
  else if (percent < 130)      status = 'overstocked';
  else                         status = 'severely overstocked';

  // Warnings
  if (volume === 0) warnings.push('Tank volume not set — bioload can\'t be calculated.');
  if (offsetMax > offsetCap && offsetMax > 0) {
    warnings.push(`Plant offset capped at ${Math.round(PLANT_OFFSET_CAP * 100)}% of load. Plants help, but they won't save an overstocked tank.`);
  }
  const unknowns = contributors.filter((c) => c.source === 'unknown').length;
  if (unknowns > 0) {
    warnings.push(`${unknowns} custom entr${unknowns === 1 ? 'y is' : 'ies are'} using a default bioload — add them to the library for an accurate score.`);
  }
  const estimates = contributors.filter((c) => c.source === 'estimated').length;
  if (estimates > 0) {
    warnings.push(`${estimates} species ${estimates === 1 ? 'has an estimated' : 'have estimated'} bioload (no curated value yet).`);
  }

  return {
    capacity,
    rawLoad,
    offsetApplied,
    offsetMax,
    offsetNitrateMg: offset.nitrateMg,
    netLoad,
    percent,
    status,
    contributors,
    warnings,
    tankType,
    stockingFactor,
  };
}

// ===========================================================
// Display helpers
// ===========================================================

export const STATUS_META = {
  unknown:                { label: 'Unknown',             tone: 'neutral', emoji: '❓' },
  understocked:           { label: 'Understocked',        tone: 'neutral', emoji: '⬇️' },
  comfortable:            { label: 'Comfortable',         tone: 'success', emoji: '✅' },
  'fully stocked':        { label: 'Fully stocked',       tone: 'success', emoji: '✅' },
  overstocked:            { label: 'Overstocked',         tone: 'warning', emoji: '⚠️' },
  'severely overstocked': { label: 'Severely overstocked',tone: 'danger',  emoji: '🚨' },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.unknown;
}
