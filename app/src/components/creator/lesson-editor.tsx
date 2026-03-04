"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import type { WizardLessonForm, WizardAction } from "@/types/wizard";

interface LessonEditorProps {
  lesson: WizardLessonForm;
  moduleTempId: string;
  dispatch: React.Dispatch<WizardAction>;
}

export function LessonEditor({ lesson, moduleTempId, dispatch }: LessonEditorProps) {
  const t = useTranslations("creatorWizard");
  const [showPreview, setShowPreview] = useState(false);

  const updateLesson = (field: keyof WizardLessonForm, value: WizardLessonForm[keyof WizardLessonForm]) => {
    dispatch({
      type: "UPDATE_LESSON",
      moduleTempId,
      lessonTempId: lesson.tempId,
      field,
      value,
    });
  };

  const updateChallenge = (field: string, value: unknown) => {
    dispatch({
      type: "UPDATE_CHALLENGE",
      moduleTempId,
      lessonTempId: lesson.tempId,
      field: field as keyof WizardLessonForm["challenge"],
      value: value as WizardLessonForm["challenge"][keyof WizardLessonForm["challenge"]],
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>{t("lessonTitle")}</Label>
          <Input
            value={lesson.title}
            onChange={(e) => updateLesson("title", e.target.value)}
            placeholder={t("lessonTitlePlaceholder")}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("lessonType")}</Label>
          <Select
            value={lesson.type}
            onValueChange={(v) => updateLesson("type", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="content">{t("typeContent")}</SelectItem>
              <SelectItem value="challenge">{t("typeChallenge")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("duration")}</Label>
          <Input
            type="number"
            min={1}
            value={lesson.duration}
            onChange={(e) => updateLesson("duration", parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      {lesson.type === "content" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("videoUrl")}</Label>
            <Input
              value={lesson.videoUrl}
              onChange={(e) => updateLesson("videoUrl", e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>{t("markdownContent")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                {showPreview ? t("hidePreview") : t("showPreview")}
              </Button>
            </div>
            {showPreview ? (
              <div className="rounded-lg border p-4 min-h-[200px] prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={lesson.markdownContent || "*No content yet*"} />
              </div>
            ) : (
              <Textarea
                value={lesson.markdownContent}
                onChange={(e) => updateLesson("markdownContent", e.target.value)}
                placeholder={t("markdownPlaceholder")}
                rows={10}
                className="font-mono text-sm"
              />
            )}
          </div>
        </div>
      )}

      {lesson.type === "challenge" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("challengePrompt")}</Label>
            <Textarea
              value={lesson.challenge.prompt}
              onChange={(e) => updateChallenge("prompt", e.target.value)}
              placeholder={t("challengePromptPlaceholder")}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("challengeLanguage")}</Label>
              <Select
                value={lesson.challenge.language}
                onValueChange={(v) => updateChallenge("language", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="typescript">TypeScript</SelectItem>
                  <SelectItem value="rust">Rust</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("starterCode")}</Label>
            <Textarea
              value={lesson.challenge.starterCode}
              onChange={(e) => updateChallenge("starterCode", e.target.value)}
              placeholder={t("starterCodePlaceholder")}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>{t("solution")}</Label>
            <Textarea
              value={lesson.challenge.solution}
              onChange={(e) => updateChallenge("solution", e.target.value)}
              placeholder={t("solutionPlaceholder")}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          {/* Test Cases */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t("testCases")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({
                  type: "ADD_TEST_CASE",
                  moduleTempId,
                  lessonTempId: lesson.tempId,
                })}
              >
                <Plus className="h-3 w-3 mr-1" /> {t("addTestCase")}
              </Button>
            </div>
            <div className="space-y-3">
              {lesson.challenge.testCases.map((tc) => (
                <div key={tc.tempId} className="rounded border p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="grid gap-3 sm:grid-cols-3 flex-1">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("testLabel")}</Label>
                        <Input
                          value={tc.label}
                          onChange={(e) => dispatch({
                            type: "UPDATE_TEST_CASE",
                            moduleTempId,
                            lessonTempId: lesson.tempId,
                            testCaseTempId: tc.tempId,
                            field: "label",
                            value: e.target.value,
                          })}
                          placeholder={t("testLabelPlaceholder")}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("testInput")}</Label>
                        <Input
                          value={tc.input}
                          onChange={(e) => dispatch({
                            type: "UPDATE_TEST_CASE",
                            moduleTempId,
                            lessonTempId: lesson.tempId,
                            testCaseTempId: tc.tempId,
                            field: "input",
                            value: e.target.value,
                          })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("testExpectedOutput")}</Label>
                        <Input
                          value={tc.expectedOutput}
                          onChange={(e) => dispatch({
                            type: "UPDATE_TEST_CASE",
                            moduleTempId,
                            lessonTempId: lesson.tempId,
                            testCaseTempId: tc.tempId,
                            field: "expectedOutput",
                            value: e.target.value,
                          })}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-5 shrink-0"
                      onClick={() => dispatch({
                        type: "REMOVE_TEST_CASE",
                        moduleTempId,
                        lessonTempId: lesson.tempId,
                        testCaseTempId: tc.tempId,
                      })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("testValidator")}</Label>
                    <Input
                      value={tc.validator ?? ""}
                      onChange={(e) => dispatch({
                        type: "UPDATE_TEST_CASE",
                        moduleTempId,
                        lessonTempId: lesson.tempId,
                        testCaseTempId: tc.tempId,
                        field: "validator",
                        value: e.target.value,
                      })}
                      placeholder={t("testValidatorPlaceholder")}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hints */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t("hints")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({
                  type: "ADD_HINT",
                  moduleTempId,
                  lessonTempId: lesson.tempId,
                })}
              >
                <Plus className="h-3 w-3 mr-1" /> {t("addHint")}
              </Button>
            </div>
            <div className="space-y-2">
              {lesson.challenge.hints.map((hint, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={hint}
                    onChange={(e) => dispatch({
                      type: "UPDATE_HINT",
                      moduleTempId,
                      lessonTempId: lesson.tempId,
                      index: i,
                      value: e.target.value,
                    })}
                    placeholder={`${t("hint")} ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch({
                      type: "REMOVE_HINT",
                      moduleTempId,
                      lessonTempId: lesson.tempId,
                      index: i,
                    })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
