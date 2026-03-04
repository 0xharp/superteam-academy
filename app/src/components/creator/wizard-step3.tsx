"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertCircle, Loader2, Save, Send } from "lucide-react";
import type { WizardState } from "@/types/wizard";

interface WizardStep3Props {
  state: WizardState;
  onSubmit: (isDraft: boolean) => void;
  trackName?: string;
}

export function WizardStep3({ state, onSubmit, trackName }: WizardStep3Props) {
  const t = useTranslations("creatorWizard");
  const { course, modules, submitting, error } = state;

  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const totalDuration = modules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + l.duration, 0),
    0,
  );
  const challengeCount = modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => l.type === "challenge").length,
    0,
  );

  const difficultyLabel: Record<string, string> = {
    beginner: t("beginner"),
    intermediate: t("intermediate"),
    advanced: t("advanced"),
  };

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">{t("submissionFailed")}</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Course overview */}
      <Card>
        <CardHeader>
          <CardTitle>{t("courseOverview")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">{t("title")}</p>
              <p className="font-medium">{course.title || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("courseId")}</p>
              <p className="font-mono text-sm">{course.courseId || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("difficulty")}</p>
              <p>{course.difficulty ? difficultyLabel[course.difficulty] : "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("track")}</p>
              <p>{trackName || "—"}</p>
            </div>
          </div>
          {course.description && (
            <div>
              <p className="text-sm text-muted-foreground">{t("description")}</p>
              <p className="text-sm">{course.description}</p>
            </div>
          )}
          {course.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {course.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{totalLessons}</p>
            <p className="text-sm text-muted-foreground">{t("totalLessons")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{totalDuration}</p>
            <p className="text-sm text-muted-foreground">{t("totalMinutes")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{challengeCount}</p>
            <p className="text-sm text-muted-foreground">{t("challenges")}</p>
          </CardContent>
        </Card>
      </div>

      {/* On-chain params */}
      <Card>
        <CardHeader>
          <CardTitle>{t("onChainParams")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">{t("xpPerLesson")}</p>
              <p className="font-medium">{course.xpPerLesson} XP</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("totalXp")}</p>
              <p className="font-medium">{course.xpPerLesson * totalLessons} XP</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("creatorRewardXp")}</p>
              <p className="font-medium">{course.creatorRewardXp} XP</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("minCompletions")}</p>
              <p className="font-medium">{course.minCompletionsForReward}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modules accordion */}
      <Card>
        <CardHeader>
          <CardTitle>{t("modulesAndLessons")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {modules.map((mod, mi) => (
              <AccordionItem key={mod.tempId} value={mod.tempId}>
                <AccordionTrigger>
                  <span className="text-sm">
                    {t("moduleNumber", { n: mi + 1 })}: {mod.title || t("untitled")}
                    <Badge variant="outline" className="ml-2">
                      {mod.lessons.length} {t("lessons").toLowerCase()}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pl-4">
                    {mod.lessons.map((lesson, li) => (
                      <div key={lesson.tempId} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground w-6">{li + 1}.</span>
                        <span className="flex-1">{lesson.title || t("untitled")}</span>
                        <Badge variant={lesson.type === "challenge" ? "default" : "secondary"}>
                          {lesson.type === "challenge" ? t("typeChallenge") : t("typeContent")}
                        </Badge>
                        <span className="text-muted-foreground">{lesson.duration} min</span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={submitting}
          onClick={() => onSubmit(true)}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {t("saveDraft")}
        </Button>
        <Button
          type="button"
          disabled={submitting}
          onClick={() => onSubmit(false)}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {t("submitForReview")}
        </Button>
      </div>
    </div>
  );
}
