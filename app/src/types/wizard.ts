/** Form-specific types for the course creator wizard. Distinct from read-side Course/Module/Lesson types. */

export interface WizardTestCaseForm {
  tempId: string;
  label: string;
  input: string;
  expectedOutput: string;
  validator?: string;
}

export interface WizardChallengeForm {
  prompt: string;
  language: "rust" | "typescript" | "json";
  starterCode: string;
  solution: string;
  testCases: WizardTestCaseForm[];
  hints: string[];
}

export interface WizardLessonForm {
  tempId: string;
  sanityId?: string;
  title: string;
  type: "content" | "challenge";
  duration: number;
  videoUrl: string;
  markdownContent: string;
  challenge: WizardChallengeForm;
}

export interface WizardModuleForm {
  tempId: string;
  sanityId?: string;
  title: string;
  description: string;
  order: number;
  lessons: WizardLessonForm[];
}

export interface WizardCourseForm {
  title: string;
  courseId: string;
  description: string;
  longDescription: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "";
  trackId: string;
  tags: string[];
  xpPerLesson: number;
  trackLevel: number;
  creatorRewardXp: number;
  minCompletionsForReward: number;
  prerequisiteCourseId: string;
  thumbnailAssetId: string;
  thumbnailPreviewUrl: string;
}

export interface WizardState {
  step: 1 | 2 | 3;
  course: WizardCourseForm;
  modules: WizardModuleForm[];
  submitting: boolean;
  error: string | null;
}

export type WizardAction =
  | { type: "SET_STEP"; step: WizardState["step"] }
  | { type: "UPDATE_COURSE"; field: keyof WizardCourseForm; value: WizardCourseForm[keyof WizardCourseForm] }
  | { type: "ADD_MODULE" }
  | { type: "REMOVE_MODULE"; tempId: string }
  | { type: "UPDATE_MODULE"; tempId: string; field: keyof WizardModuleForm; value: string }
  | { type: "REORDER_MODULE"; tempId: string; direction: "up" | "down" }
  | { type: "ADD_LESSON"; moduleTempId: string }
  | { type: "REMOVE_LESSON"; moduleTempId: string; lessonTempId: string }
  | { type: "UPDATE_LESSON"; moduleTempId: string; lessonTempId: string; field: keyof WizardLessonForm; value: WizardLessonForm[keyof WizardLessonForm] }
  | { type: "UPDATE_CHALLENGE"; moduleTempId: string; lessonTempId: string; field: keyof WizardChallengeForm; value: WizardChallengeForm[keyof WizardChallengeForm] }
  | { type: "ADD_TEST_CASE"; moduleTempId: string; lessonTempId: string }
  | { type: "REMOVE_TEST_CASE"; moduleTempId: string; lessonTempId: string; testCaseTempId: string }
  | { type: "UPDATE_TEST_CASE"; moduleTempId: string; lessonTempId: string; testCaseTempId: string; field: keyof WizardTestCaseForm; value: string }
  | { type: "ADD_HINT"; moduleTempId: string; lessonTempId: string }
  | { type: "REMOVE_HINT"; moduleTempId: string; lessonTempId: string; index: number }
  | { type: "UPDATE_HINT"; moduleTempId: string; lessonTempId: string; index: number; value: string }
  | { type: "REORDER_LESSON"; moduleTempId: string; lessonTempId: string; direction: "up" | "down" }
  | { type: "SET_SUBMITTING"; value: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "LOAD_EXISTING"; course: WizardCourseForm; modules: WizardModuleForm[] };
