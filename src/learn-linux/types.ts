export type Check =
  | { type: "command"; pattern: string; label: string }
  | { type: "cwd"; path: string; label: string }
  | { type: "output"; includes: string; label: string }
  | { type: "fileExists"; path: string; label: string }
  | { type: "fileMissing"; path: string; label: string }
  | { type: "fileContent"; path: string; includes: string; label: string }
  | { type: "permission"; path: string; mode: string; label: string }
  | { type: "env"; name: string; value: string; label: string }
  | { type: "package"; name: string; label: string }
  | { type: "processKilled"; pid: number; label: string }
  | { type: "service"; name: string; status: "active" | "inactive"; label: string }
  | { type: "ssh"; host: string; label: string }
  | { type: "docker"; container: string; status: "running" | "stopped"; label: string };

export interface Exercise {
  prompt: string;
  checks: Check[];
  hints: [string, string, string];
  success: string;
  xp: number;
}

export interface Lesson {
  id: string;
  title: string;
  eyebrow: string;
  intro: string;
  points: string[];
  command?: string;
  commandBreakdown?: { token: string; meaning: string }[];
  example?: string;
  exercise: Exercise;
}

export interface CourseModule {
  id: string;
  level: number;
  number: number;
  title: string;
  subtitle: string;
  icon: string;
  duration: number;
  skills: string[];
  lessons: Lesson[];
}

export interface QuizQuestion {
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
}

export interface CourseLevel {
  id: number;
  title: string;
  rank: string;
  description: string;
  color: string;
  modules: CourseModule[];
  exam: QuizQuestion[];
}

export interface CommandDoc {
  name: string;
  category: string;
  level: number;
  description: string;
  syntax: string;
  example: string;
  note?: string;
  danger?: boolean;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  level: number;
}
