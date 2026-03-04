import type { WizardCourseForm, WizardModuleForm } from "@/types/wizard";

export type ValidationErrors = Record<string, string>;
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrors;
}

const COURSE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateStep1(course: WizardCourseForm, isDraft = false): ValidationResult {
  const errors: ValidationErrors = {};

  if (!course.title.trim()) {
    errors.title = "Title is required";
  }

  if (!course.courseId.trim()) {
    errors.courseId = "Course ID is required";
  } else if (course.courseId.length > 32) {
    errors.courseId = "Course ID must be 32 characters or less";
  } else if (!COURSE_ID_RE.test(course.courseId)) {
    errors.courseId = "Course ID must be lowercase alphanumeric with hyphens only";
  }

  if (!isDraft) {
    if (!course.description.trim()) {
      errors.description = "Description is required";
    }
    if (!course.difficulty) {
      errors.difficulty = "Difficulty is required";
    }
    if (!course.trackId) {
      errors.trackId = "Track is required";
    }
    if (course.xpPerLesson < 1) {
      errors.xpPerLesson = "XP per lesson must be at least 1";
    }
    if (course.trackLevel < 1 || course.trackLevel > 3) {
      errors.trackLevel = "Track level must be 1, 2, or 3";
    }
    if (course.creatorRewardXp < 0) {
      errors.creatorRewardXp = "Creator reward XP cannot be negative";
    }
    if (course.minCompletionsForReward < 1) {
      errors.minCompletionsForReward = "Min completions must be at least 1";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep2(modules: WizardModuleForm[], isDraft = false): ValidationResult {
  const errors: ValidationErrors = {};

  if (modules.length === 0) {
    errors.modules = "At least one module is required";
    return { valid: false, errors };
  }

  modules.forEach((mod, mi) => {
    if (!isDraft && !mod.title.trim()) {
      errors[`module_${mi}_title`] = `Module ${mi + 1}: Title is required`;
    }

    if (mod.lessons.length === 0) {
      errors[`module_${mi}_lessons`] = `Module ${mi + 1}: At least one lesson is required`;
    }

    mod.lessons.forEach((lesson, li) => {
      const prefix = `module_${mi}_lesson_${li}`;

      if (!isDraft && !lesson.title.trim()) {
        errors[`${prefix}_title`] = `Module ${mi + 1}, Lesson ${li + 1}: Title is required`;
      }

      if (!isDraft && lesson.type === "challenge") {
        const c = lesson.challenge;
        if (!c.prompt.trim()) {
          errors[`${prefix}_prompt`] = `Module ${mi + 1}, Lesson ${li + 1}: Challenge prompt is required`;
        }
        if (!c.starterCode.trim()) {
          errors[`${prefix}_starterCode`] = `Module ${mi + 1}, Lesson ${li + 1}: Starter code is required`;
        }
        if (!c.solution.trim()) {
          errors[`${prefix}_solution`] = `Module ${mi + 1}, Lesson ${li + 1}: Solution is required`;
        }
        if (c.testCases.length === 0) {
          errors[`${prefix}_testCases`] = `Module ${mi + 1}, Lesson ${li + 1}: At least one test case is required`;
        }
      }
    });
  });

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateAll(
  course: WizardCourseForm,
  modules: WizardModuleForm[],
  isDraft = false,
): ValidationResult {
  const step1 = validateStep1(course, isDraft);
  const step2 = validateStep2(modules, isDraft);
  const errors = { ...step1.errors, ...step2.errors };
  return { valid: Object.keys(errors).length === 0, errors };
}
