import { PublicKey } from "@solana/web3.js";

interface TrackInfo {
  trackId: number;
  name: string;
  slug: string;
  collectionAddress: string;
}

const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || "";
const SANITY_DATASET = process.env.SANITY_DATASET || "production";

const TRACKS_QUERY = encodeURIComponent(
  `*[_type == "track"] { trackId, name, "slug": slug.current, collectionAddress }`,
);

let cachedTracks: TrackInfo[] = [];
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchTracks(): Promise<TrackInfo[]> {
  if (Date.now() < cacheExpiry && cachedTracks.length > 0) {
    return cachedTracks;
  }

  if (!SANITY_PROJECT_ID) {
    console.warn("SANITY_PROJECT_ID not set — track resolution unavailable");
    return [];
  }

  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${TRACKS_QUERY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sanity query failed: ${res.status}`);
  }

  const data = await res.json();
  const results = (data.result ?? []) as TrackInfo[];

  cachedTracks = results;
  cacheExpiry = Date.now() + CACHE_TTL;
  return results;
}

export async function getTrackCollection(trackId: number): Promise<PublicKey> {
  const tracks = await fetchTracks();
  const track = tracks.find((t) => t.trackId === trackId);
  if (!track?.collectionAddress) {
    throw new Error(`No collection address found for trackId ${trackId}`);
  }
  return new PublicKey(track.collectionAddress);
}

export async function getTrackImageUrl(_trackId: number): Promise<string> {
  return "/images/credentials/sample.png";
}
