export interface CompleteLessonRequest {
  courseId: string;
  lessonIndex: number;
  learnerWallet: string;
}

export interface CompleteLessonResponse {
  success: boolean;
  signature: string;
  xpEarned: number;
  isComplete: boolean;
  finalizeSignature?: string;
}

export interface FinalizeCourseRequest {
  courseId: string;
  learnerWallet: string;
}

export interface FinalizeCourseResponse {
  success: boolean;
  signature: string;
}

export interface IssueCredentialRequest {
  courseId: string;
  learnerWallet: string;
  credentialName: string;
  metadataUri: string;
  coursesCompleted: number;
  totalXp: number;
  completedCourseIds?: string;
}

export interface IssueCredentialResponse {
  success: boolean;
  signature: string;
  credentialAsset: string;
}

export interface RewardXpRequest {
  recipientWallet: string;
  amount: number;
  memo: string;
}

export interface RewardXpResponse {
  success: boolean;
  signature: string;
}

export interface CreateCourseRequest {
  courseId: string;
  creator: string;
  lessonCount: number;
  difficulty: number;
  xpPerLesson: number;
  trackId: number;
  trackLevel: number;
  prerequisiteCourseId?: string | null;
  creatorRewardXp: number;
  minCompletionsForReward: number;
  contentTxId: string;
}

export interface CreateCourseResponse {
  success: boolean;
  signature: string;
  coursePDA: string;
}

export interface UpdateCourseRequest {
  courseId: string;
  newIsActive?: boolean;
  newXpPerLesson?: number;
  newCreatorRewardXp?: number;
  newMinCompletionsForReward?: number;
  newContentTxId?: string;
}

export interface UpdateCourseResponse {
  success: boolean;
  signature: string;
}

export interface UpgradeCredentialRequest {
  courseId: string;
  learnerWallet: string;
  credentialAsset: string;
  credentialName: string;
  metadataUri: string;
  coursesCompleted: number;
  totalXp: number;
}

export interface UpgradeCredentialResponse {
  success: boolean;
  signature: string;
  credentialAsset: string;
}
