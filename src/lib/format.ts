/** Local wall-clock time, e.g. "14:07:32". */
export function formatClock(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Human relative time, e.g. "just now", "42s ago", "3m ago". */
export function formatRelative(ts: number | null, now: number = Date.now()): string {
  if (!ts) return 'no data yet'
  const diff = Math.max(0, now - ts)
  if (diff < 5000) return 'just now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Compact coordinate label, e.g. "51.50740, -0.12780". */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
