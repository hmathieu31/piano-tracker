export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}min`;
  return `${seconds}s`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** A date as a local practice day (YYYY-MM-DD), matching `sessions.date`. */
export function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return localDay();
}

/** Whole days from `date` (YYYY-MM-DD) to today; null without a date. */
export function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.round((Date.parse(todayStr() + 'T00:00:00') - Date.parse(date + 'T00:00:00')) / 86400000);
}

/** Spotify search link for a song; songs without an artist get none. */
export function spotifySearchUrl(song: { title: string; artist: string | null }): string | null {
  if (!song.artist) return null;
  return `spotify:search:${encodeURIComponent(`${song.title} ${song.artist}`)}`;
}
