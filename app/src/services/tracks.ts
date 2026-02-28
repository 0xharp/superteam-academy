import type { TrackService } from "./interfaces";
import type { Track, CourseCardData } from "@/types/course";
import type { Enrollment } from "@/types/user";
import { getTracks, getCourseCards } from "@/lib/courses";

class SanityTrackService implements TrackService {
  async getTracks(): Promise<Track[]> {
    return getTracks();
  }

  async getTrackBySlug(slug: string): Promise<Track | null> {
    const tracks = await this.getTracks();
    return tracks.find((t) => t.slug === slug) ?? null;
  }

  async getTrackCourses(trackSlug: string): Promise<CourseCardData[]> {
    const [tracks, courses] = await Promise.all([
      this.getTracks(),
      getCourseCards(),
    ]);
    const track = tracks.find((t) => t.slug === trackSlug);
    if (!track) return [];
    return courses.filter((c) => c.trackName === track.name);
  }

  getTrackProgress(trackSlug: string, enrollments: Enrollment[]): number {
    // This is a synchronous calculation — caller must provide enrollments
    // and we match by trackSlug on the enrollment's courseId
    // In practice, this requires course data too, so we return 0 here.
    // Use the helper below for full calculation.
    return 0;
  }
}

/**
 * Calculate weighted progress across all courses in a track.
 * Progress = average of enrolled course progress percentages, divided by total track courses.
 */
export function calculateTrackProgress(
  trackName: string,
  courses: CourseCardData[],
  enrollments: { courseId: string; progressPct: number }[],
): number {
  const trackCourses = courses.filter((c) => c.trackName === trackName);
  if (trackCourses.length === 0) return 0;

  const totalProgress = trackCourses.reduce((sum, c) => {
    const enrollment = enrollments.find((e) => e.courseId === c.courseId);
    return sum + (enrollment?.progressPct ?? 0);
  }, 0);

  return totalProgress / trackCourses.length;
}

function createService(): TrackService {
  return new SanityTrackService();
}

export const trackService: TrackService = createService();
