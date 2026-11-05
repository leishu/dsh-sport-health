/** Number / duration / pace formatting shared by every card and the dashboard. */

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—'
  const total = Math.round(minutes * 60)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, '0')} 分`
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`
}

export function fmtSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}'${String(s).padStart(2, '0')}"`
}

export function fmtPace(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm) return '—'
  return `${fmtSeconds(secondsPerKm)}/km`
}

export function shortDate(date: string | undefined): string {
  if (!date) return ''
  return date.slice(5).replace('-', '/')
}

/** 1000 m → "1 km", 5000 m → "5 km", 1500 m → "1.5 km". */
export function distanceLabel(meters: number): string {
  if (meters >= 1000) return `${fmt(meters / 1000, meters % 1000 === 0 ? 0 : 1)} km`
  return `${meters} m`
}

export function signed(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${fmt(value, digits)}`
}

/** Chinese race names for the distances the prediction tool can target. */
const RACE_NAMES: Array<{ meters: number; name: string }> = [
  { meters: 1000, name: '1K' },
  { meters: 5000, name: '5K' },
  { meters: 10000, name: '10K' },
  { meters: 21097.5, name: '半马' },
  { meters: 42195, name: '全马' },
]

/** 21097.5 m → "半马"; unknown distances fall back to "12.5 km". */
export function raceName(meters: number | undefined): string {
  if (!meters) return '—'
  const hit = RACE_NAMES.find(entry => Math.abs(entry.meters - meters) < 1)
  return hit ? hit.name : distanceLabel(meters)
}

/**
 * Pace deltas are signed and read in seconds, so the sign has to survive:
 * "+1 秒" is slower, "-3.9 秒" is faster. `signed()` alone would round the
 * second case to "-4", which is fine, but the unit and sign wording differ
 * enough between views to deserve one helper.
 */
export function fmtPaceDelta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  const rounded = Math.round(seconds * 10) / 10
  if (rounded === 0) return '持平'
  return `${rounded > 0 ? '+' : ''}${rounded} 秒/km`
}
