const ITUNES_BASE = 'https://itunes.apple.com/search';

export interface MBSearchResult {
  recordingId: string;
  releaseId: string | null;
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  coverUrl: string | null;
  spotifyUrl: string;
  genre: string | null;
}

interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackViewUrl?: string;
}

export async function searchRecordings(query: string): Promise<MBSearchResult[]> {
  if (!query.trim()) return [];

  const url = `${ITUNES_BASE}?term=${encodeURIComponent(query)}&media=music&entity=musicTrack&limit=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search error: ${res.status}`);

  const data = await res.json();
  const tracks: ItunesTrack[] = data.results ?? [];

  return tracks.slice(0, 8).map((t) => {
    const coverUrl = t.artworkUrl100
      ? t.artworkUrl100.replace('100x100bb', '400x400bb')
      : null;

    const yearStr = t.releaseDate?.slice(0, 4);
    const year = yearStr ? parseInt(yearStr, 10) : null;

    // spotify: URI opens directly in the desktop app (Spotify must be installed)
    const spotifyUrl = `spotify:search:${encodeURIComponent(`${t.trackName} ${t.artistName}`)}`;

    return {
      recordingId: String(t.trackId),
      releaseId: null,
      title: t.trackName,
      artist: t.artistName,
      album: t.collectionName ?? null,
      year,
      coverUrl,
      spotifyUrl,
      genre: t.primaryGenreName ?? null,
    };
  });
}

/** Genre is already returned by iTunes — this is a no-op kept for API compatibility */
export async function fetchRecordingGenre(_recordingId: string): Promise<string | null> {
  return null;
}

export async function checkCoverArtExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

