"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookOpen, ExternalLink, MessageSquare } from "lucide-react";
import { SUBMISSION_STATUS } from "@/types/course";
import { Link } from "@/i18n/routing";

interface CreatorCourse {
  _id: string;
  title: string;
  courseId: string;
  description: string;
  difficulty: string;
  published: boolean;
  submissionStatus: string | null;
  reviewComment: string | null;
  xpPerLesson: number | null;
  lessonCount: number | null;
  _createdAt: string;
}

function submissionLabel(s: string | null): string {
  if (!s || s === SUBMISSION_STATUS.WAITING) return "Waiting For Approval";
  if (s === SUBMISSION_STATUS.APPROVED) return "Approved & Published";
  if (s === SUBMISSION_STATUS.REJECTED) return "Rejected";
  if (s === SUBMISSION_STATUS.DEACTIVATED) return "Deactivated";
  return s;
}

function submissionVariant(s: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!s || s === SUBMISSION_STATUS.WAITING) return "secondary";
  if (s === SUBMISSION_STATUS.APPROVED) return "default";
  if (s === SUBMISSION_STATUS.REJECTED) return "destructive";
  return "outline";
}

export default function CreatorPage() {
  const t = useTranslations("creator");
  const tc = useTranslations("common");
  const { data: session, status } = useSession();
  const [courses, setCourses] = useState<CreatorCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/courses/creator");
    if (res.ok) {
      const data = await res.json();
      setCourses(data.courses);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.walletAddress) {
      fetchCourses();
    } else {
      setLoading(false);
    }
  }, [session?.walletAddress, fetchCourses]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-center">
        <p className="text-muted-foreground">{tc("signIn")}</p>
      </div>
    );
  }

  if (!session.walletAddress) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("connectWalletPrompt")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">{t("title")}</h1>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t("noCourses")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("yourCourses")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("courseTitle")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{tc("lessons")}</TableHead>
                  <TableHead>{t("xpPerLesson")}</TableHead>
                  <TableHead>{t("created")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => (
                  <TableRow key={course._id}>
                    <TableCell className="font-medium">
                      {course.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant={submissionVariant(course.submissionStatus)}>
                        {submissionLabel(course.submissionStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>{course.lessonCount ?? "—"}</TableCell>
                    <TableCell>{course.xpPerLesson ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(course._createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/courses/preview/${course.courseId}`} target="_blank">
                            {t("preview")}
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={`https://${process.env.NEXT_PUBLIC_SANITY_STUDIO_HOST ?? "superteam-academy"}.sanity.studio/structure/course;${course._id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-1 h-3 w-3" />
                            {t("editInStudio")}
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Show review comments for rejected courses */}
            {courses.some((c) => c.submissionStatus === SUBMISSION_STATUS.REJECTED && c.reviewComment) && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {t("reviewFeedback")}
                </h3>
                {courses
                  .filter((c) => c.submissionStatus === SUBMISSION_STATUS.REJECTED && c.reviewComment)
                  .map((c) => (
                    <div
                      key={c._id}
                      className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
                    >
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {c.reviewComment}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
