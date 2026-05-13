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
