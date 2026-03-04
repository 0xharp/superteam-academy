"use client";

import { useReducer, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { wizardReducer, createInitialState } from "@/lib/wizard-reducer";
import { validateStep1, validateStep2, validateAll } from "@/lib/wizard-validation";
import type { ValidationErrors } from "@/lib/wizard-validation";
import { WizardStep1 } from "@/components/creator/wizard-step1";
import { WizardStep2 } from "@/components/creator/wizard-step2";
import { WizardStep3 } from "@/components/creator/wizard-step3";

interface TrackOption {
  _id: string;
  name: string;
  trackId?: number;
}

export default function CreateCoursePage() {
  const t = useTranslations("creatorWizard");
  const tc = useTranslations("common");
  const { data: session } = useSession();
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, undefined, createInitialState);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [activeCourses, setActiveCourses] = useState<{ courseId: string; title: string }[]>([]);

  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    if (res.ok) {
      const data = await res.json();
      setTracks(data.map((t: Record<string, unknown>) => ({
        _id: t.sanityId as string,
        name: t.name as string,
        trackId: t.trackId as number | undefined,
      })));
    }
  }, []);

  const fetchActiveCourses = useCallback(async () => {
    const res = await fetch("/api/courses");
    if (res.ok) {
      setActiveCourses(await res.json());
    }
  }, []);

  useEffect(() => {
    fetchTracks();
    fetchActiveCourses();
  }, [fetchTracks, fetchActiveCourses]);

  if (!session?.walletAddress) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-muted-foreground">{tc("signIn")}</p>
      </div>
    );
  }

  const goToStep = (step: 1 | 2 | 3) => {
    if (step > state.step) {
      // Validate current step before advancing
      if (state.step === 1) {
        const result = validateStep1(state.course);
        setErrors(result.errors);
        if (!result.valid) return;
      }
      if (state.step === 2) {
        const result = validateStep2(state.modules);
        setErrors(result.errors);
        if (!result.valid) return;
      }
    }
    setErrors({});
    dispatch({ type: "SET_STEP", step });
  };

  const handleSaveDraft = async () => {
    // Relaxed validation for drafts
    const result = validateAll(state.course, state.modules, true);
    if (!result.valid) {
      setErrors(result.errors);
      toast.error(t("fixErrors"));
      return;
    }

    dispatch({ type: "SET_SUBMITTING", value: true });
    dispatch({ type: "SET_ERROR", error: null });

    try {
      const res = await fetch("/api/creator/courses?draft=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: state.course, modules: state.modules }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      toast.success(t("draftSaved"));
      router.push("/creator");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SET_ERROR", error: msg });
      toast.error(msg);
    } finally {
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  };

  const handleSubmit = async (isDraft: boolean) => {
    const result = validateAll(state.course, state.modules, isDraft);
    if (!result.valid) {
      setErrors(result.errors);
      toast.error(t("fixErrors"));
      // Go to first step with errors
      const step1Errors = validateStep1(state.course, isDraft);
      if (!step1Errors.valid) {
        dispatch({ type: "SET_STEP", step: 1 });
      } else {
        const step2Errors = validateStep2(state.modules, isDraft);
        if (!step2Errors.valid) {
          dispatch({ type: "SET_STEP", step: 2 });
        }
      }
      return;
    }

    dispatch({ type: "SET_SUBMITTING", value: true });
    dispatch({ type: "SET_ERROR", error: null });

    try {
      const res = await fetch(`/api/creator/courses?draft=${isDraft}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: state.course, modules: state.modules }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      toast.success(isDraft ? t("draftSaved") : t("submittedForReview"));
      router.push("/creator");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SET_ERROR", error: msg });
      toast.error(msg);
    } finally {
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  };

  const trackName = tracks.find((t) => t._id === state.course.trackId)?.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t("createCourse")}</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToStep(step as 1 | 2 | 3)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                state.step === step
                  ? "bg-primary text-primary-foreground"
                  : state.step > step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step}
            </button>
            <span className={`text-sm hidden sm:inline ${state.step === step ? "font-medium" : "text-muted-foreground"}`}>
              {step === 1 ? t("stepCourseDetails") : step === 2 ? t("stepModulesLessons") : t("stepReview")}
            </span>
            {step < 3 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      {state.step === 1 && (
        <WizardStep1
          course={state.course}
          dispatch={dispatch}
          errors={errors}
          tracks={tracks}
          activeCourses={activeCourses}
          isEdit={false}
        />
      )}

      {state.step === 2 && (
        <WizardStep2
          modules={state.modules}
          dispatch={dispatch}
          errors={errors}
        />
      )}

      {state.step === 3 && (
        <WizardStep3
          state={state}
          onSubmit={handleSubmit}
          trackName={trackName}
        />
      )}

      {/* Navigation */}
      {state.step < 3 && (
        <div className="flex justify-between mt-8">
          <div className="flex gap-2">
            {state.step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => goToStep((state.step - 1) as 1 | 2)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {tc("previous")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={state.submitting}
              onClick={handleSaveDraft}
            >
              {state.submitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {t("saveDraft")}
            </Button>
            <Button
              type="button"
              onClick={() => goToStep((state.step + 1) as 2 | 3)}
            >
              {tc("next")} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
