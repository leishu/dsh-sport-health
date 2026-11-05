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
