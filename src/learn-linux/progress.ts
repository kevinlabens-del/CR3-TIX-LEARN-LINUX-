import { ALL_LESSONS, ALL_MODULES, COURSE_LEVELS, totalCourseXp } from "./content";

export const PROGRESS_STORAGE_KEY = "creatix-learn-linux:progress:v1";
export const THEME_STORAGE_KEY = "creatix-learn-linux:theme";

export interface CommandHistoryItem {
  command: string;
  output: string;
  exitCode: number;
  at: string;
}

export interface LearnerProgress {
  version: 1;
  displayName: string;
  onboardingComplete: boolean;
  xp: number;
  completedLessons: string[];
  passedExams: number[];
  skillMastery: Record<string, number>;
  hintsByLesson: Record<string, number>;
  attemptsByLesson: Record<string, number>;
  commandHistory: CommandHistoryItem[];
  favoriteCommands: string[];
  activeDays: string[];
  totalSeconds: number;
  achievements: string[];
  currentLessonId: string;
}

export interface AchievementDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "first-command", icon: ">_", title: "Premier prompt", description: "Exécuter une première commande." },
  { id: "first-lesson", icon: "✓", title: "Déclic", description: "Terminer une première leçon." },
  { id: "ten-lessons", icon: "10", title: "Régularité", description: "Terminer 10 leçons." },
  { id: "first-exam", icon: "A", title: "Niveau validé", description: "Réussir un premier examen." },
  { id: "pipe-master", icon: "|", title: "Maître des pipes", description: "Maîtriser les redirections et les pipes." },
  { id: "admin", icon: "#", title: "Administrateur", description: "Valider le niveau avancé." },
  { id: "streak-3", icon: "3", title: "Série lancée", description: "Apprendre pendant 3 jours consécutifs." },
  { id: "graduate", icon: "★", title: "Linux Pro", description: "Terminer tout le parcours." },
];

export const RANKS = [
  { min: 0, name: "Nouveau terminaliste", short: "N1" },
  { min: 250, name: "Explorateur Linux", short: "N2" },
  { min: 650, name: "Opérateur terminal", short: "N3" },
  { min: 1200, name: "Utilisateur confirmé", short: "N4" },
  { min: 2000, name: "Administrateur Linux", short: "N5" },
  { min: 3000, name: "Expert CR3@TIX", short: "PRO" },
];

export function defaultProgress(): LearnerProgress {
  return {
    version: 1,
    displayName: "",
    onboardingComplete: false,
    xp: 0,
    completedLessons: [],
    passedExams: [],
    skillMastery: {},
    hintsByLesson: {},
    attemptsByLesson: {},
    commandHistory: [],
    favoriteCommands: [],
    activeDays: [],
    totalSeconds: 0,
    achievements: [],
    currentLessonId: ALL_LESSONS[0]?.id ?? "",
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function sanitizeProgress(value: unknown): LearnerProgress {
  const base = defaultProgress();
  if (!value || typeof value !== "object") return base;
  const source = value as Partial<LearnerProgress>;
  const validLessonIds = new Set(ALL_LESSONS.map((item) => item.id));
  const validCommandNames = new Set(ALL_LESSONS.flatMap((item) => item.command ? [item.command] : []));

  return {
    ...base,
    displayName: typeof source.displayName === "string" ? source.displayName.slice(0, 40) : "",
    onboardingComplete: Boolean(source.onboardingComplete),
    xp: typeof source.xp === "number" && Number.isFinite(source.xp) ? Math.max(0, Math.round(source.xp)) : 0,
    completedLessons: isStringArray(source.completedLessons)
      ? [...new Set(source.completedLessons.filter((id) => validLessonIds.has(id)))]
      : [],
    passedExams: Array.isArray(source.passedExams)
      ? [...new Set(source.passedExams.filter((id): id is number => typeof id === "number" && id >= 1 && id <= COURSE_LEVELS.length))]
      : [],
    skillMastery: source.skillMastery && typeof source.skillMastery === "object" ? source.skillMastery : {},
    hintsByLesson: source.hintsByLesson && typeof source.hintsByLesson === "object" ? source.hintsByLesson : {},
    attemptsByLesson: source.attemptsByLesson && typeof source.attemptsByLesson === "object" ? source.attemptsByLesson : {},
    commandHistory: Array.isArray(source.commandHistory)
      ? source.commandHistory
          .filter((item): item is CommandHistoryItem => Boolean(item && typeof item.command === "string" && typeof item.at === "string"))
          .slice(-250)
      : [],
    favoriteCommands: isStringArray(source.favoriteCommands)
      ? [...new Set(source.favoriteCommands.filter((name) => validCommandNames.has(name)))].slice(0, 100)
      : [],
    activeDays: isStringArray(source.activeDays) ? [...new Set(source.activeDays)].sort() : [],
    totalSeconds: typeof source.totalSeconds === "number" && Number.isFinite(source.totalSeconds) ? Math.max(0, Math.round(source.totalSeconds)) : 0,
    achievements: isStringArray(source.achievements) ? [...new Set(source.achievements)] : [],
    currentLessonId: typeof source.currentLessonId === "string" && validLessonIds.has(source.currentLessonId)
      ? source.currentLessonId
      : base.currentLessonId,
  };
}

export function loadProgress(): LearnerProgress {
  if (typeof window === "undefined") return defaultProgress();
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    return raw ? sanitizeProgress(JSON.parse(raw)) : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: LearnerProgress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function isoDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function touchToday(progress: LearnerProgress): LearnerProgress {
  const today = isoDay();
  if (progress.activeDays.includes(today)) return progress;
  return { ...progress, activeDays: [...progress.activeDays, today].sort() };
}

export function currentStreak(activeDays: string[], today = new Date()): number {
  const daySet = new Set(activeDays);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!daySet.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function rankForXp(xp: number) {
  return [...RANKS].reverse().find((rank) => xp >= rank.min) ?? RANKS[0];
}

export function nextRankForXp(xp: number) {
  return RANKS.find((rank) => rank.min > xp) ?? null;
}

export function coursePercent(progress: LearnerProgress): number {
  const lessonPart = progress.completedLessons.length;
  const examPart = progress.passedExams.length;
  return Math.min(100, Math.round(((lessonPart + examPart) / (ALL_LESSONS.length + COURSE_LEVELS.length)) * 100));
}

export function xpPercent(progress: LearnerProgress): number {
  return Math.min(100, Math.round((progress.xp / totalCourseXp) * 100));
}

export function isModuleComplete(moduleId: string, progress: LearnerProgress): boolean {
  const target = ALL_MODULES.find((item) => item.id === moduleId);
  return Boolean(target && target.lessons.every((item) => progress.completedLessons.includes(item.id)));
}

export function isLevelComplete(levelId: number, progress: LearnerProgress): boolean {
  const level = COURSE_LEVELS.find((item) => item.id === levelId);
  return Boolean(level && level.modules.every((item) => isModuleComplete(item.id, progress)));
}

export function isModuleUnlocked(moduleId: string, progress: LearnerProgress): boolean {
  const index = ALL_MODULES.findIndex((item) => item.id === moduleId);
  if (index < 0) return false;
  const target = ALL_MODULES[index];
  if (target.level > 1 && !progress.passedExams.includes(target.level - 1)) return false;
  if (index === 0) return true;
  return isModuleComplete(ALL_MODULES[index - 1].id, progress);
}

export function isLessonUnlocked(lessonId: string, progress: LearnerProgress): boolean {
  const targetModule = ALL_MODULES.find((item) => item.lessons.some((lesson) => lesson.id === lessonId));
  if (!targetModule || !isModuleUnlocked(targetModule.id, progress)) return false;
  const index = targetModule.lessons.findIndex((item) => item.id === lessonId);
  return index === 0 || progress.completedLessons.includes(targetModule.lessons[index - 1].id);
}

export function findNextLesson(progress: LearnerProgress) {
  return ALL_LESSONS.find((item) => isLessonUnlocked(item.id, progress) && !progress.completedLessons.includes(item.id)) ?? ALL_LESSONS.at(-1);
}

export function lessonAward(baseXp: number, hintsUsed: number): number {
  const multipliers = [1, 0.85, 0.65, 0.4];
  return Math.max(5, Math.round(baseXp * (multipliers[Math.min(3, hintsUsed)] ?? 0.4)));
}

export function masteryForSkill(progress: LearnerProgress, skill: string): number {
  return Math.max(0, Math.min(100, Math.round(progress.skillMastery[skill] ?? 0)));
}

export function refreshAchievements(progress: LearnerProgress): LearnerProgress {
  const unlocked = new Set(progress.achievements);
  const streak = currentStreak(progress.activeDays);
  if (progress.commandHistory.length >= 1) unlocked.add("first-command");
  if (progress.completedLessons.length >= 1) unlocked.add("first-lesson");
  if (progress.completedLessons.length >= 10) unlocked.add("ten-lessons");
  if (progress.passedExams.length >= 1) unlocked.add("first-exam");
  if (progress.completedLessons.some((id) => id.includes("pipe"))) unlocked.add("pipe-master");
  if (progress.passedExams.includes(4)) unlocked.add("admin");
  if (streak >= 3) unlocked.add("streak-3");
  if (progress.completedLessons.length === ALL_LESSONS.length && progress.passedExams.length === COURSE_LEVELS.length) unlocked.add("graduate");
  return { ...progress, achievements: [...unlocked] };
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest.toString().padStart(2, "0")}`;
}
