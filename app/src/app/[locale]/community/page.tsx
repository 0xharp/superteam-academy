import { getCourseCards } from "@/lib/courses";
import CommunityView from "./community-view";

export const revalidate = 3600;

export default async function CommunityPage() {
  const courseCards = await getCourseCards();
  return <CommunityView courseCards={courseCards} />;
}
