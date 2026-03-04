"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { LessonEditor } from "./lesson-editor";
import type { WizardModuleForm, WizardAction } from "@/types/wizard";
import type { ValidationErrors } from "@/lib/wizard-validation";

interface WizardStep2Props {
  modules: WizardModuleForm[];
  dispatch: React.Dispatch<WizardAction>;
  errors: ValidationErrors;
}

export function WizardStep2({ modules, dispatch, errors }: WizardStep2Props) {
  const t = useTranslations("creatorWizard");

  return (
    <div className="space-y-6">
      {errors.modules && (
        <p className="text-sm text-destructive">{errors.modules}</p>
      )}

      {modules.map((mod, mi) => (
        <Card key={mod.tempId}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="flex-1 text-base">
                {t("moduleNumber", { n: mi + 1 })}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={mi === 0}
                  onClick={() => dispatch({ type: "REORDER_MODULE", tempId: mod.tempId, direction: "up" })}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={mi === modules.length - 1}
                  onClick={() => dispatch({ type: "REORDER_MODULE", tempId: mod.tempId, direction: "down" })}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={modules.length <= 1}
                  onClick={() => dispatch({ type: "REMOVE_MODULE", tempId: mod.tempId })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("moduleTitle")}</Label>
                <Input
                  value={mod.title}
                  onChange={(e) => dispatch({
                    type: "UPDATE_MODULE",
                    tempId: mod.tempId,
                    field: "title",
                    value: e.target.value,
                  })}
                  placeholder={t("moduleTitlePlaceholder")}
                />
                {errors[`module_${mi}_title`] && (
                  <p className="text-sm text-destructive mt-1">{errors[`module_${mi}_title`]}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("moduleDescription")}</Label>
                <Textarea
                  value={mod.description}
                  onChange={(e) => dispatch({
                    type: "UPDATE_MODULE",
                    tempId: mod.tempId,
                    field: "description",
                    value: e.target.value,
                  })}
                  placeholder={t("moduleDescriptionPlaceholder")}
                  rows={1}
                />
              </div>
            </div>

            {/* Lessons */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("lessons")} ({mod.lessons.length})
                </Label>
              </div>

              {mod.lessons.map((lesson, li) => (
                <div key={lesson.tempId} className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      {t("lessonNumber", { n: li + 1 })}
                    </span>
                    <div className="flex gap-1 ml-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={li === 0}
                        onClick={() => dispatch({
                          type: "REORDER_LESSON",
                          moduleTempId: mod.tempId,
                          lessonTempId: lesson.tempId,
                          direction: "up",
                        })}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={li === mod.lessons.length - 1}
                        onClick={() => dispatch({
                          type: "REORDER_LESSON",
                          moduleTempId: mod.tempId,
                          lessonTempId: lesson.tempId,
                          direction: "down",
                        })}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={mod.lessons.length <= 1}
                        onClick={() => dispatch({
                          type: "REMOVE_LESSON",
                          moduleTempId: mod.tempId,
                          lessonTempId: lesson.tempId,
                        })}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <LessonEditor
                    lesson={lesson}
                    moduleTempId={mod.tempId}
                    dispatch={dispatch}
                  />
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: "ADD_LESSON", moduleTempId: mod.tempId })}
              >
                <Plus className="h-3 w-3 mr-1" /> {t("addLesson")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => dispatch({ type: "ADD_MODULE" })}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" /> {t("addModule")}
      </Button>
    </div>
  );
}
