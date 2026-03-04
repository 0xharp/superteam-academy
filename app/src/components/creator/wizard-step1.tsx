"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Upload, Loader2 } from "lucide-react";
import type { WizardCourseForm, WizardAction } from "@/types/wizard";
import type { ValidationErrors } from "@/lib/wizard-validation";

interface TrackOption {
  _id: string;
  name: string;
  trackId?: number;
}

interface CourseOption {
  courseId: string;
  title: string;
}

interface WizardStep1Props {
  course: WizardCourseForm;
  dispatch: React.Dispatch<WizardAction>;
  errors: ValidationErrors;
  tracks: TrackOption[];
  activeCourses: CourseOption[];
  isEdit: boolean;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-sm text-destructive mt-1">{error}</p>;
}

export function WizardStep1({ course, dispatch, errors, tracks, activeCourses, isEdit }: WizardStep1Props) {
  const t = useTranslations("creatorWizard");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const set = (field: keyof WizardCourseForm, value: WizardCourseForm[keyof WizardCourseForm]) => {
    dispatch({ type: "UPDATE_COURSE", field, value });
  };

  const handleThumbnailSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/creator/courses/thumbnail", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { assetId, url } = await res.json();
      set("thumbnailAssetId", assetId);
      set("thumbnailPreviewUrl", url);
    } catch {
      // Reset on failure
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeThumbnail = () => {
    set("thumbnailAssetId", "");
    set("thumbnailPreviewUrl", "");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const input = e.currentTarget;
      const tag = input.value.trim().replace(",", "");
      if (tag && !course.tags.includes(tag)) {
        set("tags", [...course.tags, tag]);
      }
      input.value = "";
    }
  };

  const removeTag = (tag: string) => {
    set("tags", course.tags.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-8">
      {/* Thumbnail */}
      <div className="space-y-2">
        <Label>{t("thumbnail")}</Label>
        <p className="text-sm text-muted-foreground">{t("thumbnailHint")}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleThumbnailSelect}
        />
        {course.thumbnailPreviewUrl ? (
          <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border">
            <img
              src={course.thumbnailPreviewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={removeThumbnail}
            >
              <X className="h-4 w-4 mr-1" />
              {t("removeThumbnail")}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-video w-full max-w-md items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors"
          >
            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("uploading")}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-8 w-8" />
                {t("thumbnailUpload")}
              </div>
            )}
          </button>
        )}
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {/* Title */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">{t("title")} *</Label>
          <Input
            id="title"
            value={course.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("titlePlaceholder")}
          />
          <FieldError error={errors.title} />
        </div>

        {/* Course ID */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="courseId">{t("courseId")} *</Label>
          <div className="relative">
            <Input
              id="courseId"
              value={course.courseId}
              onChange={(e) => set("courseId", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder={t("courseIdPlaceholder")}
              maxLength={32}
              disabled={isEdit}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {course.courseId.length}/32
            </span>
          </div>
          {isEdit && (
            <p className="text-xs text-muted-foreground">{t("courseIdImmutable")}</p>
          )}
          <FieldError error={errors.courseId} />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">{t("description")} *</Label>
          <Textarea
            id="description"
            value={course.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={3}
          />
          <FieldError error={errors.description} />
        </div>

        {/* Long Description */}
        <div className="space-y-2">
          <Label htmlFor="longDescription">{t("longDescription")}</Label>
          <Textarea
            id="longDescription"
            value={course.longDescription}
            onChange={(e) => set("longDescription", e.target.value)}
            placeholder={t("longDescriptionPlaceholder")}
            rows={3}
          />
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <Label>{t("difficulty")} *</Label>
          <Select
            value={course.difficulty}
            onValueChange={(v) => set("difficulty", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("selectDifficulty")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">{t("beginner")}</SelectItem>
              <SelectItem value="intermediate">{t("intermediate")}</SelectItem>
              <SelectItem value="advanced">{t("advanced")}</SelectItem>
            </SelectContent>
          </Select>
          <FieldError error={errors.difficulty} />
        </div>

        {/* Track */}
        <div className="space-y-2">
          <Label>{t("track")} *</Label>
          <Select
            value={course.trackId}
            onValueChange={(v) => set("trackId", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("selectTrack")} />
            </SelectTrigger>
            <SelectContent>
              {tracks.map((track) => (
                <SelectItem key={track._id} value={track._id}>
                  {track.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError error={errors.trackId} />
        </div>

        {/* Tags */}
        <div className="space-y-2 sm:col-span-2">
          <Label>{t("tags")}</Label>
          <Input
            placeholder={t("tagsPlaceholder")}
            onKeyDown={handleTagKeyDown}
          />
          {course.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {course.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* On-chain params */}
      <div>
        <h3 className="text-lg font-semibold mb-4">{t("onChainParams")}</h3>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="xpPerLesson">{t("xpPerLesson")} *</Label>
            <Input
              id="xpPerLesson"
              type="number"
              min={1}
              value={course.xpPerLesson}
              onChange={(e) => set("xpPerLesson", parseInt(e.target.value) || 0)}
            />
            <FieldError error={errors.xpPerLesson} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trackLevel">{t("trackLevel")} *</Label>
            <Select
              value={String(course.trackLevel)}
              onValueChange={(v) => set("trackLevel", parseInt(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — {t("beginner")}</SelectItem>
                <SelectItem value="2">2 — {t("intermediate")}</SelectItem>
                <SelectItem value="3">3 — {t("advanced")}</SelectItem>
              </SelectContent>
            </Select>
            <FieldError error={errors.trackLevel} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creatorRewardXp">{t("creatorRewardXp")} *</Label>
            <Input
              id="creatorRewardXp"
              type="number"
              min={0}
              value={course.creatorRewardXp}
              onChange={(e) => set("creatorRewardXp", parseInt(e.target.value) || 0)}
            />
            <FieldError error={errors.creatorRewardXp} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="minCompletionsForReward">{t("minCompletions")} *</Label>
            <Input
              id="minCompletionsForReward"
              type="number"
              min={1}
              value={course.minCompletionsForReward}
              onChange={(e) => set("minCompletionsForReward", parseInt(e.target.value) || 0)}
            />
            <FieldError error={errors.minCompletionsForReward} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>{t("prerequisiteCourseId")}</Label>
            <Select
              value={course.prerequisiteCourseId || "__none__"}
              onValueChange={(v) => set("prerequisiteCourseId", v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("prerequisitePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("noPrerequisite")}</SelectItem>
                {activeCourses.map((c) => (
                  <SelectItem key={c.courseId} value={c.courseId!}>
                    {c.title} ({c.courseId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
