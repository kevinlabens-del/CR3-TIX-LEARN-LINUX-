import { ALL_LESSONS } from "../content.ts";
import type { Check, Lesson } from "../types";

export type PracticeMode = "guided" | "consolidation" | "autonomous";

export interface PracticeExercise {
  id: string;
  lessonId: string;
  mode: PracticeMode;
  title: string;
  prompt: string;
  checks: Check[];
  hints: string[];
  success: string;
  xp: number;
}

const MODE_LABELS: Record<PracticeMode, string> = {
  guided: "Découverte guidée",
  consolidation: "Consolidation",
  autonomous: "Défi autonome",
};

export function practiceId(lessonId: string, mode: PracticeMode): string {
  return `${lessonId}:${mode}`;
}

export function practicesForLesson(lesson: Lesson): PracticeExercise[] {
  return [
    {
      id: practiceId(lesson.id, "guided"),
      lessonId: lesson.id,
      mode: "guided",
      title: MODE_LABELS.guided,
      prompt: lesson.exercise.prompt,
      checks: lesson.exercise.checks,
      hints: [...lesson.exercise.hints],
      success: lesson.exercise.success,
      xp: lesson.exercise.xp,
    },
    {
      id: practiceId(lesson.id, "consolidation"),
      lessonId: lesson.id,
      mode: "consolidation",
      title: MODE_LABELS.consolidation,
      prompt: `Refais l'objectif « ${lesson.exercise.prompt} » sans recopier l'exemple.`,
      checks: lesson.exercise.checks,
      hints: [lesson.exercise.hints[0], lesson.exercise.hints[1]],
      success: `Tu sais maintenant reproduire « ${lesson.title} » avec moins d'aide.`,
      xp: Math.max(8, Math.round(lesson.exercise.xp * 0.4)),
    },
    {
      id: practiceId(lesson.id, "autonomous"),
      lessonId: lesson.id,
      mode: "autonomous",
      title: MODE_LABELS.autonomous,
      prompt: `Mission autonome : ${lesson.exercise.prompt}`,
      checks: lesson.exercise.checks,
      hints: [],
      success: `Compétence confirmée : ${lesson.title}.`,
      xp: Math.max(12, Math.round(lesson.exercise.xp * 0.6)),
    },
  ];
}

export const ALL_PRACTICES = ALL_LESSONS.flatMap(practicesForLesson);

export function getPractice(exerciseId: string): PracticeExercise | undefined {
  return ALL_PRACTICES.find((exercise) => exercise.id === exerciseId);
}

export function getLessonForPractice(exercise: PracticeExercise): Lesson | undefined {
  return ALL_LESSONS.find((lesson) => lesson.id === exercise.lessonId);
}

export function nextPracticeForLesson(
  lessonId: string,
  completedLessons: string[],
  completedPractices: string[],
): PracticeExercise | undefined {
  if (!completedLessons.includes(lessonId)) return undefined;
  const exercises = ALL_PRACTICES.filter((exercise) => exercise.lessonId === lessonId);
  return exercises.find((exercise) => exercise.mode !== "guided" && !completedPractices.includes(exercise.id))
    ?? exercises.find((exercise) => exercise.mode === "autonomous");
}

export const reinforcementXp = ALL_PRACTICES
  .filter((exercise) => exercise.mode !== "guided")
  .reduce((sum, exercise) => sum + exercise.xp, 0);
