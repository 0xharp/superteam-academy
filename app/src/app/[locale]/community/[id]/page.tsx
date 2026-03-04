import { getCourseTitleMap } from "@/lib/courses";
import PostDetailView from "./post-detail-view";

export const revalidate = 3600;

export default async function PostDetailPage() {
  const courseTitleMap = await getCourseTitleMap();
  return <PostDetailView courseTitleMap={courseTitleMap} />;
}
