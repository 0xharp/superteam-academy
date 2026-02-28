import type { TrackImageService } from "./interfaces";

class StaticTrackImageService implements TrackImageService {
  getImageUrl(trackSlug: string): string {
    return `/images/credentials/${trackSlug}.png`;
  }

  async uploadImage(_trackSlug: string, _file: File): Promise<string> {
    throw new Error("Upload not supported in static image service");
  }
}

function createService(): TrackImageService {
  return new StaticTrackImageService();
}

export const trackImageService: TrackImageService = createService();

/**
 * Returns the credential image URL for a track slug, with fallback to default.
 */
export function getCredentialImageUrl(trackSlug: string): string {
  return `/images/credentials/${trackSlug}.png`;
}

export const CREDENTIAL_IMAGE_FALLBACK = "/images/credentials/sample.png";
