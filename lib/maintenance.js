// AquaHub — Maintenance helpers
//
// Pure functions for computing task status, next-due dates, and
// suggested tasks per tank type. No DOM, no Supabase.

// ===========================================================
// Status math
// ===========================================================

/**
 * Compute when a task is next due.
 * @param {object} task — { interval_days, last_done_at, created_at }
 * @returns {Date} the date the task is next due
 */
export function nextDue(task) {
  const base = task.last_done_at
    ? new Date(task.last_done_at)
    : new Date(task.created_at);
  const next = new Date(base);
  next.setDate(next.getDate() + Number(task.interval_days || 0));
  return next;
}

/**
 * Compute a status for display.
 * @returns {{ status: 'overdue'|'due_soon'|'on_track'|'never_done', daysUntilDue: number, daysOverdue: number }}
 */
export function taskStatus(task, now = new Date()) {
  const due = nextDue(task);
  const ms = due.getTime() - now.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  if (!task.last_done_at) {
    // Never logged — use created_at + interval. If that's in the past, overdue.
    if (days < 0) return { status: 'overdue', daysUntilDue: days, daysOverdue: -days };
    if (days <= 2) return { status: 'due_soon', daysUntilDue: days, daysOverdue: 0 };
    return { status: 'never_done', daysUntilDue: days, daysOverdue: 0 };
  }

  if (days < 0) return { status: 'overdue', daysUntilDue: days, daysOverdue: -days };
  if (days <= 2) return { status: 'due_soon', daysUntilDue: days, daysOverdue: 0 };
  return { status: 'on_track', daysUntilDue: days, daysOverdue: 0 };
}

export const STATUS_META = {
  overdue:     { label: 'Overdue',    tone: 'danger',  emoji: '🚨' },
  due_soon:    { label: 'Due soon',   tone: 'warning', emoji: '⏰' },
  on_track:    { label: 'On track',   tone: 'success', emoji: '✓'  },
  never_done:  { label: 'Not done yet', tone: 'neutral', emoji: '·' },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.never_done;
}

// ===========================================================
// Suggestion library
// ===========================================================
// Curated by tank type. These appear in the "Suggested tasks"
// panel when a user has no tasks set up yet (or wants to add more).

const COMMON = [
  { title: 'Weekly water change',         interval_days: 7,   notes: '~25% water change, dechlorinate fresh water' },
  { title: 'Glass cleaning',              interval_days: 7,   notes: 'Wipe inside walls, scrape algae if needed' },
  { title: 'Rinse filter media',          interval_days: 30,  notes: 'Rinse in old tank water, never tap' },
];

const FRESHWATER_EXTRAS = [
  { title: 'Test parameters',             interval_days: 14,  notes: 'Temp, pH, ammonia, nitrite, nitrate' },
  { title: 'Trim plants',                 interval_days: 30,  notes: 'For planted tanks' },
  { title: 'Replace filter cartridge',    interval_days: 60,  notes: 'Cartridge-style filters only' },
  { title: 'Vacuum substrate',            interval_days: 14,  notes: 'Pair with water change' },
  { title: 'Inspect equipment',           interval_days: 90,  notes: 'Heater, lights, filter for wear' },
];

const SALTWATER_EXTRAS = [
  { title: 'Test salinity',               interval_days: 7,   notes: 'Maintain 1.024–1.026 SG' },
  { title: 'Test alkalinity',             interval_days: 7,   notes: 'Target 8–11 dKH' },
  { title: 'Test calcium + magnesium',    interval_days: 14,  notes: 'Ca 380–450 ppm, Mg 1250–1350 ppm' },
  { title: 'Top off RO/DI water',         interval_days: 3,   notes: 'Replace evaporation only — never salt water' },
  { title: 'Empty skimmer cup',           interval_days: 7,   notes: 'Clean inside the cup and neck too' },
  { title: 'Clean pumps and powerheads',  interval_days: 60,  notes: 'Vinegar soak, remove buildup' },
];

const REEF_EXTRAS = [
  { title: 'Dose 2-part / kalk',          interval_days: 1,   notes: 'Track in notes if needed' },
  { title: 'Spot-feed corals',            interval_days: 3,   notes: 'LPS, NPS, gorgonians' },
  { title: 'Glass cleaning (coralline)',  interval_days: 7,   notes: 'Magnet scraper, careful of livestock' },
];

const PLANTED_EXTRAS = [
  { title: 'Dose ferts',                  interval_days: 3,   notes: 'NPK / micros per your routine' },
  { title: 'Check CO₂ levels',            interval_days: 7,   notes: 'Drop checker green = good' },
  { title: 'Trim plants',                 interval_days: 14,  notes: 'Replant tops, remove old leaves' },
];

/**
 * Get suggestion list for a tank type.
 * @param {string} tankType
 * @returns {Array<{ title, interval_days, notes }>}
 */
export function suggestionsFor(tankType) {
  const base = [...COMMON];
  if (tankType === 'saltwater' || tankType === 'reef') {
    base.push(...SALTWATER_EXTRAS);
  } else if (tankType === 'planted') {
    base.push(...FRESHWATER_EXTRAS, ...PLANTED_EXTRAS);
  } else {
    // freshwater / brackish / unknown
    base.push(...FRESHWATER_EXTRAS);
  }
  if (tankType === 'reef') {
    base.push(...REEF_EXTRAS);
  }
  return base;
}

// ===========================================================
// Formatting helpers
// ===========================================================

export function formatInterval(days) {
  if (days === 1)  return 'Daily';
  if (days === 7)  return 'Weekly';
  if (days === 14) return 'Every 2 weeks';
  if (days === 30) return 'Monthly';
  if (days === 60) return 'Every 2 months';
  if (days === 90) return 'Quarterly';
  if (days === 180) return 'Twice a year';
  if (days === 365) return 'Yearly';
  if (days < 7)  return `Every ${days} days`;
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  if (days % 30 === 0) return `Every ${days / 30} months`;
  return `Every ${days} days`;
}

export function formatRelativeDue(status) {
  if (status.status === 'overdue')  return `${status.daysOverdue}d overdue`;
  if (status.status === 'due_soon') return status.daysUntilDue === 0 ? 'Due today' : status.daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${status.daysUntilDue}d`;
  if (status.status === 'never_done') return `${status.daysUntilDue}d until first due`;
  return `${status.daysUntilDue}d`;
}
