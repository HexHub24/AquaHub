// AquaHub — Tank setup calculator
//
// Pure math, no DOM, no Supabase. Computes:
//   - Real usable water volume (after substrate displacement)
//   - Total filled-tank weight + floor load
//   - Common dosing volumes (drops per liter, ml per gallon, etc.)
//
// Numbers are conservative estimates calibrated from published
// substrate density data and real-world tank measurements. Users
// should treat the totals as planning numbers, not load-bearing
// engineering specs.

// ===========================================================
// Constants
// ===========================================================

export const WATER_LBS_PER_GAL = {
  freshwater: 8.34,
  brackish:   8.45,
  saltwater:  8.55,
};

export const TANK_LBS_PER_GAL = {
  glass:   1.1,   // standard glass tanks (avg from popular brands)
  acrylic: 0.55,  // acrylic is ~50% lighter
};

// Substrate properties: weight per dry gallon of substrate volume,
// and what fraction of that volume actually displaces water
// (the rest is air gaps between grains).
export const SUBSTRATE = {
  gravel:        { label: 'Gravel',         weightLbsPerGal: 10, displacement: 0.70 },
  sand:          { label: 'Sand',           weightLbsPerGal: 13, displacement: 0.70 },
  aquasoil:      { label: 'Aquasoil',       weightLbsPerGal:  6, displacement: 0.65 },
  crushed_coral: { label: 'Crushed coral',  weightLbsPerGal: 12, displacement: 0.70 },
  aragonite:     { label: 'Aragonite',      weightLbsPerGal: 12, displacement: 0.70 },
  bare_bottom:   { label: 'Bare bottom',    weightLbsPerGal:  0, displacement: 0.00 },
};

// 231 cubic inches in a US gallon
export const CUBIC_INCHES_PER_GAL = 231;

// Residential floor load reference (live load, lbs/sq ft)
// IRC residential floor minimum is 40 psf live load.
// Most modern homes handle 50-70 psf without issue.
// Going above 100 psf concentrated load is when engineers recommend
// checking joists and weight distribution.
export const FLOOR_LOAD_REFERENCE = {
  comfortable: 40,
  caution: 100,
  high: 150,
};

// ===========================================================
// Helpers
// ===========================================================

function isNum(v) {
  return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
}

function toNum(v, fallback = 0) {
  return isNum(v) ? Number(v) : fallback;
}

// ===========================================================
// Main computation
// ===========================================================

/**
 * Compute the full setup numbers for a tank.
 *
 * @param {object} tank — A tank record with optional setup fields:
 *   volume_gallons, length_inches, width_inches, height_inches,
 *   tank_material, substrate_type, substrate_depth_inches,
 *   hardscape_weight_lbs, equipment_weight_lbs, tank_type
 *
 * @returns {object} A setup result with usable volume and weights,
 *   plus a `missing` array of fields needed to compute remaining values.
 */
export function computeSetup(tank) {
  const advertised = toNum(tank.volume_gallons);
  const L = toNum(tank.length_inches);
  const W = toNum(tank.width_inches);
  const H = toNum(tank.height_inches);
  const subDepth = toNum(tank.substrate_depth_inches);
  const subType = tank.substrate_type || null;
  const hardscape = toNum(tank.hardscape_weight_lbs);
  const equipment = toNum(tank.equipment_weight_lbs);
  const material = tank.tank_material || 'glass';
  const waterType =
    tank.tank_type === 'saltwater' || tank.tank_type === 'reef'
      ? 'saltwater'
      : 'freshwater';

  const missing = [];
  if (!advertised) missing.push('volume_gallons');
  if (!L || !W) missing.push('footprint');

  // ---- Substrate volume + water displacement ----
  let footprintSqIn = null;
  let footprintSqFt = null;
  let substrateVolumeGal = 0;
  let waterDisplacedGal = 0;
  let substrateWeight = 0;

  if (L && W) {
    footprintSqIn = L * W;
    footprintSqFt = footprintSqIn / 144;

    if (subType && subDepth > 0 && SUBSTRATE[subType]) {
      const sub = SUBSTRATE[subType];
      substrateVolumeGal = (footprintSqIn * subDepth) / CUBIC_INCHES_PER_GAL;
      waterDisplacedGal = substrateVolumeGal * sub.displacement;
      substrateWeight = substrateVolumeGal * sub.weightLbsPerGal;
    }
  }

  // ---- Usable water volume ----
  // Even if we have substrate calc, we can only compute usable if we know advertised.
  // We also subtract estimated displacement from hardscape (rocks displace water too).
  // Rule of thumb: 1 lb rock ≈ 0.04 gallons displaced (avg rock density).
  const hardscapeDisplacedGal = hardscape * 0.04;

  let usableWater = null;
  if (advertised) {
    usableWater = Math.max(0, advertised - waterDisplacedGal - hardscapeDisplacedGal);
  }

  // ---- Weights ----
  const tankLbsPerGal = TANK_LBS_PER_GAL[material] ?? TANK_LBS_PER_GAL.glass;
  const waterLbsPerGal = WATER_LBS_PER_GAL[waterType] ?? WATER_LBS_PER_GAL.freshwater;

  const tankWeight = advertised ? advertised * tankLbsPerGal : null;
  const waterWeight = usableWater !== null ? usableWater * waterLbsPerGal : null;
  const totalWeight =
    tankWeight !== null && waterWeight !== null
      ? tankWeight + waterWeight + substrateWeight + hardscape + equipment
      : null;

  // ---- Floor load ----
  const floorLoadPsf =
    totalWeight !== null && footprintSqFt
      ? totalWeight / footprintSqFt
      : null;

  let floorLoadStatus = null;
  if (floorLoadPsf !== null) {
    if (floorLoadPsf < FLOOR_LOAD_REFERENCE.comfortable)
      floorLoadStatus = 'low';
    else if (floorLoadPsf < FLOOR_LOAD_REFERENCE.caution)
      floorLoadStatus = 'comfortable';
    else if (floorLoadPsf < FLOOR_LOAD_REFERENCE.high)
      floorLoadStatus = 'caution';
    else
      floorLoadStatus = 'high';
  }

  return {
    // Inputs (echoed back)
    advertisedGallons: advertised || null,
    waterType,
    material,

    // Volumes
    usableWater,
    substrateVolumeGal,
    waterDisplacedGal,
    hardscapeDisplacedGal,

    // Weights (all in lbs; nulls when we can't compute)
    tankWeight,
    waterWeight,
    substrateWeight,
    hardscapeWeight: hardscape,
    equipmentWeight: equipment,
    totalWeight,

    // Footprint + floor load
    footprintSqIn,
    footprintSqFt,
    floorLoadPsf,
    floorLoadStatus,

    // What's still needed to compute everything
    missing,
  };
}

// ===========================================================
// Dosing helpers
// ===========================================================

/**
 * Common dosing conversions, computed from the usable water volume.
 * @param {number} usableGallons
 * @returns {object}
 */
export function dosingTable(usableGallons) {
  if (!usableGallons || usableGallons <= 0) return null;
  const liters = usableGallons * 3.78541;
  const ml = liters * 1000;

  return {
    liters: round(liters, 1),
    ml: Math.round(ml),
    // common dosing references (per 10 gallons / per 10 L is the typical label)
    capfulsPerDose10Gal: round(usableGallons / 10, 2),
    capfulsPerDose10L: round(liters / 10, 2),
  };
}

function round(n, places) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

// ===========================================================
// Floor-load helper text
// ===========================================================

export function floorLoadAdvice(status) {
  switch (status) {
    case 'low':
      return 'Well under typical floor capacity. No concern on any modern floor.';
    case 'comfortable':
      return 'Within typical residential floor capacity. Place over multiple joists if possible.';
    case 'caution':
      return 'Approaching the limit for older wood-frame floors. Place perpendicular to joists, and consider a load-bearing wall nearby on upper floors.';
    case 'high':
      return 'Heavy load. On upper floors, consult a builder or inspect joists. Ground floor with concrete slab is safest.';
    default:
      return '';
  }
}

// ===========================================================
// Hardscape & equipment catalogs
// ===========================================================
// Generic, brand-agnostic items grouped by category. Each item
// has a stable `key` (used as data_id when stored on a tank),
// a human-readable `label`, and a `lbs` weight per unit.
// Items are best-effort averages across major brands; users can
// fall through to a "custom" entry if their item is unusual.

export const HARDSCAPE_CATALOG = [
  // ---- Wood ----
  { key: 'wood_spider_sm',   group: 'Wood', label: 'Spiderwood / mopani — small (4–6")',   lbs: 0.5 },
  { key: 'wood_spider_md',   group: 'Wood', label: 'Spiderwood / mopani — medium (6–10")', lbs: 2.0 },
  { key: 'wood_spider_lg',   group: 'Wood', label: 'Spiderwood / mopani — large (10–16")', lbs: 5.0 },
  { key: 'wood_dense_sm',    group: 'Wood', label: 'Driftwood (manzanita, malaysian) — small',  lbs: 1.5 },
  { key: 'wood_dense_md',    group: 'Wood', label: 'Driftwood (manzanita, malaysian) — medium', lbs: 4.0 },
  { key: 'wood_dense_lg',    group: 'Wood', label: 'Driftwood (manzanita, malaysian) — large',  lbs: 10.0 },
  { key: 'wood_cholla',      group: 'Wood', label: 'Cholla wood — single 4–6" stick',          lbs: 0.2 },

  // ---- Rock ----
  { key: 'rock_seiryu_sm',   group: 'Rock', label: 'Seiryu / dragon stone — small (fist-size)', lbs: 0.7 },
  { key: 'rock_seiryu_md',   group: 'Rock', label: 'Seiryu / dragon stone — medium',            lbs: 2.5 },
  { key: 'rock_seiryu_lg',   group: 'Rock', label: 'Seiryu / dragon stone — large (8–12")',     lbs: 6.0 },
  { key: 'rock_lava_sm',     group: 'Rock', label: 'Lava rock — small (fist-size)',             lbs: 0.4 },
  { key: 'rock_lava_md',     group: 'Rock', label: 'Lava rock — medium',                        lbs: 1.5 },
  { key: 'rock_lava_lg',     group: 'Rock', label: 'Lava rock — large',                         lbs: 4.0 },
  { key: 'rock_live',        group: 'Rock', label: 'Live rock (saltwater) — per piece',         lbs: 3.0 },
  { key: 'rock_slate',       group: 'Rock', label: 'Slate (per ~6×6" piece)',                   lbs: 1.0 },
  { key: 'rock_holey',       group: 'Rock', label: 'Texas holey rock — medium',                 lbs: 3.0 },
  { key: 'rock_river_sm',    group: 'Rock', label: 'River stone — small (fist-size)',           lbs: 0.8 },

  // ---- Other ----
  { key: 'decor_ceramic',    group: 'Other', label: 'Ceramic decor / pot',          lbs: 1.0 },
  { key: 'decor_resin_sm',   group: 'Other', label: 'Resin ornament — small',       lbs: 0.3 },
  { key: 'decor_resin_lg',   group: 'Other', label: 'Resin ornament — large',       lbs: 1.0 },
];

export const EQUIPMENT_CATALOG = [
  // ---- Filters ----
  { key: 'filt_hob_sm',      group: 'Filter', label: 'HOB filter — small (rated up to 30 gal)',   lbs: 2.0 },
  { key: 'filt_hob_md',      group: 'Filter', label: 'HOB filter — medium (30–70 gal)',           lbs: 3.0 },
  { key: 'filt_hob_lg',      group: 'Filter', label: 'HOB filter — large (70+ gal)',              lbs: 4.5 },
  { key: 'filt_internal',    group: 'Filter', label: 'Internal / sponge filter',                  lbs: 1.5 },
  { key: 'filt_canister_sm', group: 'Filter', label: 'Canister filter — small (up to 50 gal)',    lbs: 9.0 },
  { key: 'filt_canister_md', group: 'Filter', label: 'Canister filter — medium (50–100 gal)',     lbs: 12.0 },
  { key: 'filt_canister_lg', group: 'Filter', label: 'Canister filter — large (100+ gal)',        lbs: 18.0 },
  { key: 'filt_sump_sm',     group: 'Filter', label: 'Sump filter — small (10–30 gal sump)',      lbs: 25.0 },
  { key: 'filt_sump_lg',     group: 'Filter', label: 'Sump filter — large (30+ gal sump)',        lbs: 50.0 },

  // ---- Heaters ----
  { key: 'heat_sub_sm',      group: 'Heater', label: 'Submersible heater — small (<100 W)',   lbs: 0.5 },
  { key: 'heat_sub_md',      group: 'Heater', label: 'Submersible heater — medium (100–200 W)', lbs: 0.8 },
  { key: 'heat_sub_lg',      group: 'Heater', label: 'Submersible heater — large (>200 W)',    lbs: 1.2 },
  { key: 'heat_inline',      group: 'Heater', label: 'Inline / external heater',              lbs: 2.5 },

  // ---- Lights ----
  { key: 'light_basic',      group: 'Light', label: 'Basic LED — nano / standard',         lbs: 2.0 },
  { key: 'light_planted_md', group: 'Light', label: 'Planted-spec LED — medium tank',       lbs: 3.5 },
  { key: 'light_planted_lg', group: 'Light', label: 'Planted-spec LED — large tank',        lbs: 5.0 },
  { key: 'light_reef_single',group: 'Light', label: 'Reef-spec LED — single fixture',       lbs: 4.5 },
  { key: 'light_reef_multi', group: 'Light', label: 'Reef-spec LED — multi / hybrid',       lbs: 9.0 },
  { key: 'light_t5',         group: 'Light', label: 'T5 / fluorescent strip light',         lbs: 3.5 },

  // ---- Other ----
  { key: 'eq_airpump',       group: 'Other', label: 'Air pump',                        lbs: 0.5 },
  { key: 'eq_co2_paintball', group: 'Other', label: 'CO₂ system — paintball setup',    lbs: 4.0 },
  { key: 'eq_co2_5lb',       group: 'Other', label: 'CO₂ system — 5 lb cylinder',      lbs: 12.0 },
  { key: 'eq_pump_sm',       group: 'Other', label: 'Wavemaker / powerhead — small',   lbs: 1.0 },
  { key: 'eq_pump_lg',       group: 'Other', label: 'Wavemaker / powerhead — large',   lbs: 2.5 },
  { key: 'eq_skimmer_hob',   group: 'Other', label: 'Protein skimmer — HOB',           lbs: 4.0 },
  { key: 'eq_skimmer_sump',  group: 'Other', label: 'Protein skimmer — in-sump',       lbs: 8.0 },
];

/**
 * Sum the weights of a saved items array.
 * Items: [{ catalog_key, label, weight_per_unit, quantity }] or custom { custom: true, label, weight_per_unit, quantity }
 */
export function sumItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, it) => {
    const w = Number(it.weight_per_unit) || 0;
    const q = Number(it.quantity) || 0;
    return acc + w * q;
  }, 0);
}

/**
 * Look up an item by its catalog_key in either catalog.
 */
export function findCatalogItem(key) {
  return HARDSCAPE_CATALOG.find((x) => x.key === key)
      || EQUIPMENT_CATALOG.find((x) => x.key === key)
      || null;
}
