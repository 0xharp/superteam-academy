import { nanoid } from "nanoid";
import type {
  WizardState,
  WizardAction,
  WizardCourseForm,
  WizardModuleForm,
  WizardLessonForm,
  WizardChallengeForm,
} from "@/types/wizard";

function emptyChallenge(): WizardChallengeForm {
  return {
    prompt: "",
    language: "typescript",
    starterCode: "",
    solution: "",
    testCases: [],
    hints: [],
  };
}

function emptyLesson(): WizardLessonForm {
  return {
    tempId: nanoid(8),
    title: "",
    type: "content",
    duration: 10,
    videoUrl: "",
    markdownContent: "",
    challenge: emptyChallenge(),
  };
}

function emptyModule(order: number): WizardModuleForm {
  return {
    tempId: nanoid(8),
    title: "",
    description: "",
    order,
    lessons: [emptyLesson()],
  };
}

export function createInitialState(): WizardState {
  return {
    step: 1,
    course: {
      title: "",
      courseId: "",
      description: "",
      longDescription: "",
      difficulty: "",
      trackId: "",
      tags: [],
      xpPerLesson: 100,
      trackLevel: 1,
      creatorRewardXp: 500,
      minCompletionsForReward: 10,
      prerequisiteCourseId: "",
      thumbnailAssetId: "",
      thumbnailPreviewUrl: "",
    },
    modules: [emptyModule(1)],
    submitting: false,
    error: null,
  };
}

function updateModules(
  modules: WizardModuleForm[],
  moduleTempId: string,
  updater: (mod: WizardModuleForm) => WizardModuleForm,
): WizardModuleForm[] {
  return modules.map((m) => (m.tempId === moduleTempId ? updater(m) : m));
}

function updateLessonInModule(
  mod: WizardModuleForm,
  lessonTempId: string,
  updater: (lesson: WizardLessonForm) => WizardLessonForm,
): WizardModuleForm {
  return {
    ...mod,
    lessons: mod.lessons.map((l) => (l.tempId === lessonTempId ? updater(l) : l)),
  };
}

function reorderArray<T>(arr: T[], index: number, direction: "up" | "down"): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= arr.length) return arr;
  const copy = [...arr];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };

    case "UPDATE_COURSE":
      return {
        ...state,
        course: { ...state.course, [action.field]: action.value } as WizardCourseForm,
      };

    case "ADD_MODULE":
      return {
        ...state,
        modules: [...state.modules, emptyModule(state.modules.length + 1)],
      };

    case "REMOVE_MODULE":
      if (state.modules.length <= 1) return state;
      return {
        ...state,
        modules: state.modules
          .filter((m) => m.tempId !== action.tempId)
          .map((m, i) => ({ ...m, order: i + 1 })),
      };

    case "UPDATE_MODULE":
      return {
        ...state,
        modules: updateModules(state.modules, action.tempId, (m) => ({
          ...m,
          [action.field]: action.value,
        })),
      };

    case "REORDER_MODULE": {
      const idx = state.modules.findIndex((m) => m.tempId === action.tempId);
      const reordered = reorderArray(state.modules, idx, action.direction);
      return {
        ...state,
        modules: reordered.map((m, i) => ({ ...m, order: i + 1 })),
      };
    }

    case "ADD_LESSON":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) => ({
          ...m,
          lessons: [...m.lessons, emptyLesson()],
        })),
      };

    case "REMOVE_LESSON":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) => ({
          ...m,
          lessons: m.lessons.length <= 1
            ? m.lessons
            : m.lessons.filter((l) => l.tempId !== action.lessonTempId),
        })),
      };

    case "UPDATE_LESSON":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            [action.field]: action.value,
          })),
        ),
      };

    case "UPDATE_CHALLENGE":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: { ...l.challenge, [action.field]: action.value },
          })),
        ),
      };

    case "ADD_TEST_CASE":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: {
              ...l.challenge,
              testCases: [
                ...l.challenge.testCases,
                { tempId: nanoid(8), label: "", input: "", expectedOutput: "" },
              ],
            },
          })),
        ),
      };

    case "REMOVE_TEST_CASE":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: {
              ...l.challenge,
              testCases: l.challenge.testCases.filter((tc) => tc.tempId !== action.testCaseTempId),
            },
          })),
        ),
      };

    case "UPDATE_TEST_CASE":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: {
              ...l.challenge,
              testCases: l.challenge.testCases.map((tc) =>
                tc.tempId === action.testCaseTempId ? { ...tc, [action.field]: action.value } : tc,
              ),
            },
          })),
        ),
      };

    case "ADD_HINT":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: { ...l.challenge, hints: [...l.challenge.hints, ""] },
          })),
        ),
      };

    case "REMOVE_HINT":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: {
              ...l.challenge,
              hints: l.challenge.hints.filter((_, i) => i !== action.index),
            },
          })),
        ),
      };

    case "UPDATE_HINT":
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) =>
          updateLessonInModule(m, action.lessonTempId, (l) => ({
            ...l,
            challenge: {
              ...l.challenge,
              hints: l.challenge.hints.map((h, i) => (i === action.index ? action.value : h)),
            },
          })),
        ),
      };

    case "REORDER_LESSON": {
      return {
        ...state,
        modules: updateModules(state.modules, action.moduleTempId, (m) => {
          const idx = m.lessons.findIndex((l) => l.tempId === action.lessonTempId);
          return { ...m, lessons: reorderArray(m.lessons, idx, action.direction) };
        }),
      };
    }

    case "SET_SUBMITTING":
      return { ...state, submitting: action.value };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "LOAD_EXISTING":
      return { ...state, course: action.course, modules: action.modules, step: 1 };

    default:
      return state;
  }
}
