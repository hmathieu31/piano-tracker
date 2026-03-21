const MB_BASE = 'https://musicbrainz.org/ws/2';
const CAA_BASE = 'https://coverartarchive.org';
const USER_AGENT = 'PianoTracker/1.0 (practice-tracker-app)';

export interface MBSearchResult {
  recordingId: string;
  releaseId: string | null;
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  coverUrl: string | null;
  spotifyUrl: string;
}

interface MBRecording {
  id: string;
  title: string;
  score: number;
  'artist-credit'?: Array<{ name?: string; artist: { name: string } }>;
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
  }>;
}

export async function searchRecordings(query: string): Promise<MBSearchResult[]> {
  if (!query.trim()) return [];

  const url = `${MB_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=8`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`);

  const data = await res.json();
  const recordings: MBRecording[] = data.recordings ?? [];

  return recordings.slice(0, 8).map((rec) => {
    const artistCredit = rec['artist-credit'];
    const artist = artistCredit?.[0]?.name ?? artistCredit?.[0]?.artist?.name ?? 'Unknown Artist';
    const release = rec.releases?.[0] ?? null;
    const releaseId = release?.id ?? null;
    const album = release?.title ?? null;
    const yearStr = release?.date?.slice(0, 4);
    const year = yearStr ? parseInt(yearStr, 10) : null;
    const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(`${rec.title} ${artist}`)}`;

    return {
      recordingId: rec.id,
      releaseId,
      title: rec.title,
      artist,
      album,
      year,
      coverUrl: releaseId ? `${CAA_BASE}/release/${releaseId}/front-250` : null,
      spotifyUrl,
    };
  });
}

export async function fetchRecordingGenre(recordingId: string): Promise<string | null> {
  try {
    const url = `${MB_BASE}/recording/${recordingId}?inc=genres&fmt=json`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    const genres: Array<{ name: string; count: number }> = data.genres ?? [];
    if (genres.length === 0) return null;
    genres.sort((a, b) => b.count - a.count);
    return genres[0].name;
  } catch {
    return null;
  }
}

/** Test if a cover art URL exists (CAA returns 404 for releases without art) */
export async function checkCoverArtExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
