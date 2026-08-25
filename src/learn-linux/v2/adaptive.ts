import { ALL_LESSONS, ALL_MODULES } from "../content.ts";
import type { ExecutionResult } from "../sim-shell";
import type { LearnerProgress, LessonPerformance } from "../progress";
import { nextPracticeForLesson, type PracticeExercise } from "./practice.ts";

export type LearningError = "commande" | "syntaxe" | "chemin" | "permission" | "option" | "objectif";

const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30, 60];

export function classifyLearningError(result: ExecutionResult, objectivePassed: boolean): LearningError | null {
  if (objectivePassed) return null;
  const message = `${result.stdout} ${result.stderr}`.toLocaleLowerCase("fr");
  if (result.exitCode === 127 || message.includes("commande introuvable")) return "commande";
  if (message.includes("syntaxe") || message.includes("opérande manquant") || message.includes("nécessaire")) return "syntaxe";
  if (message.includes("introuvable") || message.includes("dossier parent")) return "chemin";
  if (message.includes("permission") || message.includes("refus")) return "permission";
  if (message.includes("option") || message.includes("action") || message.includes("utilisez")) return "option";
  return "objectif";
}

export function updateLessonPerformance(
  current: LessonPerformance | undefined,
  options: { passed: boolean; hintsUsed: number; elapsedSeconds: number; error: LearningError | null; now?: Date },
): LessonPerformance {
  const previous = current ?? {
    attempts: 0,
    successes: 0,
    hintsUsed: 0,
    totalSeconds: 0,
    reviewStage: 0,
    nextReviewAt: new Date(0).toISOString(),
    lastAttemptAt: "",
    errors: {},
  };
  const now = options.now ?? new Date();
  const reviewStage = options.passed ? Math.min(REVIEW_INTERVALS.length - 1, previous.reviewStage + 1) : Math.max(0, previous.reviewStage - 1);
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + REVIEW_INTERVALS[reviewStage]);
  const errors = { ...previous.errors };
  if (options.error) errors[options.error] = (errors[options.error] ?? 0) + 1;
  return {
    attempts: previous.attempts + 1,
    successes: previous.successes + (options.passed ? 1 : 0),
    hintsUsed: previous.hintsUsed + options.hintsUsed,
    totalSeconds: previous.totalSeconds + Math.max(0, Math.round(options.elapsedSeconds)),
    reviewStage,
    nextReviewAt: due.toISOString(),
    lastAttemptAt: now.toISOString(),
    errors,
  };
}

export interface AdaptiveQueueItem {
  lessonId: string;
  lessonTitle: string;
  skill: string;
  exercise: PracticeExercise;
  priority: number;
  reason: string;
}

function moduleForLesson(lessonId: string) {
  return ALL_MODULES.find((module) => module.lessons.some((lesson) => lesson.id === lessonId));
}

export function buildAdaptiveQueue(progress: LearnerProgress, limit = 5, now = new Date()): AdaptiveQueueItem[] {
  return ALL_LESSONS
    .filter((lesson) => progress.completedLessons.includes(lesson.id))
    .map((lesson) => {
      const courseModule = moduleForLesson(lesson.id);
      const skill = courseModule?.skills[0] ?? lesson.command ?? "Linux";
      const mastery = courseModule?.skills.length
        ? courseModule.skills.reduce((sum, item) => sum + (progress.skillMastery[item] ?? 35), 0) / courseModule.skills.length
        : 35;
      const performance = progress.performanceByLesson[lesson.id];
      const due = !performance?.nextReviewAt || new Date(performance.nextReviewAt).getTime() <= now.getTime();
      const exercise = nextPracticeForLesson(lesson.id, progress.completedLessons, progress.completedPractices);
      if (!exercise) return null;
      const needsVariant = !progress.completedPractices.includes(exercise.id);
      const failedAttempts = Math.max(0, (performance?.attempts ?? 0) - (performance?.successes ?? 0));
      const priority = (100 - mastery) + (due ? 35 : 0) + (needsVariant ? 25 : 0) + failedAttempts * 7 + (performance?.hintsUsed ?? 0) * 2;
      const reason = needsVariant
        ? exercise.mode === "consolidation" ? "À consolider sans recopier" : "Défi autonome à valider"
        : due ? "Révision espacée arrivée à échéance" : `Maîtrise à renforcer · ${Math.round(mastery)} %`;
      return { lessonId: lesson.id, lessonTitle: lesson.title, skill, exercise, priority, reason };
    })
    .filter((item): item is AdaptiveQueueItem => Boolean(item))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export function mostFrequentErrors(progress: LearnerProgress): { error: LearningError; count: number }[] {
  const totals: Partial<Record<LearningError, number>> = {};
  for (const performance of Object.values(progress.performanceByLesson)) {
    for (const [error, count] of Object.entries(performance.errors)) {
      const key = error as LearningError;
      totals[key] = (totals[key] ?? 0) + count;
    }
  }
  return Object.entries(totals)
    .map(([error, count]) => ({ error: error as LearningError, count: count ?? 0 }))
    .sort((a, b) => b.count - a.count);
}
