import assert from "node:assert/strict";
import test from "node:test";
import { ALL_LESSONS } from "../src/learn-linux/content.ts";
import { defaultProgress, sanitizeProgress } from "../src/learn-linux/progress.ts";
import { completeShellInput } from "../src/learn-linux/shell/completion.ts";
import { createInitialState, evaluateCheck, executeCommandLine } from "../src/learn-linux/sim-shell.ts";
import { buildAdaptiveQueue, updateLessonPerformance } from "../src/learn-linux/v2/adaptive.ts";
import { createScenarioState, LABS, PRACTICAL_EXAMS } from "../src/learn-linux/v2/labs.ts";
import { ALL_PRACTICES, practiceId } from "../src/learn-linux/v2/practice.ts";

function executeAll(commands: string[], initial = createInitialState()) {
  let state = initial;
  let last = executeCommandLine(state, "true");
  state = last.state;
  for (const command of commands) {
    last = executeCommandLine(state, command);
    state = last.state;
  }
  return last;
}

test("la V2 fournit trois entraînements par leçon et quinze laboratoires", () => {
  assert.equal(ALL_PRACTICES.length, ALL_LESSONS.length * 3);
  assert.equal(LABS.length, 15);
  assert.equal(PRACTICAL_EXAMS.length, 5);
  assert.equal(new Set(ALL_PRACTICES.map((item) => item.id)).size, ALL_PRACTICES.length);
  assert.equal(new Set(LABS.map((item) => item.id)).size, LABS.length);
});

test("SimShell 2.0 gère les opérateurs, substitutions, globbing et structures Bash", () => {
  let state = createInitialState();
  let result = executeCommandLine(state, "false || echo secours");
  assert.match(result.stdout, /secours/);
  state = result.state;
  result = executeCommandLine(state, "true && echo $(pwd)");
  assert.match(result.stdout, /\/home\/learner/);
  state = result.state;
  result = executeCommandLine(state, "echo *.txt");
  assert.match(result.stdout, /notes\.txt/);
  state = result.state;
  result = executeCommandLine(state, "for cible in alpha beta; do echo $cible; done");
  assert.equal(result.stdout, "alpha\nbeta\n");
  state = result.state;
  result = executeCommandLine(state, "if [ -f notes.txt ]; then echo présent; else echo absent; fi");
  assert.match(result.stdout, /présent/);
  state = result.state;
  state = executeCommandLine(state, "saluer() { echo bonjour; }").state;
  assert.match(executeCommandLine(state, "saluer").stdout, /bonjour/);
});

test("la complétion propose commandes et chemins virtuels", () => {
  const state = createInitialState();
  assert.equal(completeShellInput(state, "pw").input, "pwd ");
  assert.equal(completeShellInput(state, "cat note").input, "cat notes.txt ");
});

test("la progression V1 migre vers la V2 sans compte ni perte de leçons", () => {
  const lessonId = ALL_LESSONS[0].id;
  const migrated = sanitizeProgress({
    version: 1,
    displayName: "Kev",
    onboardingComplete: true,
    completedLessons: [lessonId],
    passedExams: [1],
    xp: 320,
  });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.displayName, "Kev");
  assert.ok(migrated.completedLessons.includes(lessonId));
  assert.ok(migrated.completedPractices.includes(practiceId(lessonId, "guided")));
  assert.equal(migrated.xp, 320);
});

test("le coach local planifie les révisions selon la réussite", () => {
  const lesson = ALL_LESSONS[0];
  const progress = { ...defaultProgress(), completedLessons: [lesson.id], completedPractices: [practiceId(lesson.id, "guided")] };
  const queue = buildAdaptiveQueue(progress);
  assert.equal(queue[0]?.lessonId, lesson.id);
  assert.equal(queue[0]?.exercise.mode, "consolidation");
  const first = updateLessonPerformance(undefined, { passed: true, hintsUsed: 0, elapsedSeconds: 12, error: null, now: new Date("2026-08-25T10:00:00Z") });
  assert.equal(first.reviewStage, 1);
  assert.equal(first.nextReviewAt, "2026-08-26T10:00:00.000Z");
  const failed = updateLessonPerformance(first, { passed: false, hintsUsed: 1, elapsedSeconds: 8, error: "chemin", now: new Date("2026-08-26T10:00:00Z") });
  assert.equal(failed.reviewStage, 0);
  assert.equal(failed.errors.chemin, 1);
});

test("les quinze scénarios sont réellement résolubles", () => {
  const solutions: Record<string, string[]> = {
    "find-lost-guide": ["find ~ -name guide.txt"],
    "clean-temp-file": ["rm temp.txt"],
    "project-archive": ["tar -czf backup-projets.tar.gz Projets"],
    "ssh-key-permissions": ["chmod 600 .ssh/id_ed25519"],
    "extract-errors": ["grep ERROR logs/app.log > incident.txt"],
    "install-diagnostic-tool": ["sudo apt update && sudo apt install htop"],
    "stop-runaway-process": ["ps aux", "kill 4242"],
    "production-environment": ["export APP_ENV=production"],
    "restore-web-service": ["sudo systemctl restart webapp"],
    "remote-support": ["ssh admin@server.lab"],
    "dns-diagnosis": ["dig api.creatix.test"],
    "git-config-audit": ["git diff"],
    "container-recovery": ["docker restart api"],
    "cron-audit": ["crontab -l"],
    "production-capstone": ["chmod 600 .ssh/id_ed25519", "sudo systemctl restart webapp", "docker restart api", "curl http://web.lab"],
  };
  for (const scenario of LABS) {
    const result = executeAll(solutions[scenario.id], createScenarioState(scenario.setupCommands));
    for (const check of scenario.checks) assert.equal(evaluateCheck(result.state, check), true, `${scenario.id}: ${check.label}`);
  }
});

test("chaque examen pratique possède une solution vérifiable", () => {
  const solutions: Record<number, string[]> = {
    1: ["pwd"],
    2: ["mkdir examen && touch examen/preuve.txt"],
    3: ["chmod 600 .ssh/id_ed25519"],
    4: ["sudo systemctl restart webapp"],
    5: ["sudo systemctl restart webapp", "docker restart api", "curl http://web.lab"],
  };
  for (const exam of PRACTICAL_EXAMS) {
    const result = executeAll(solutions[exam.level], createScenarioState(exam.setupCommands));
    for (const check of exam.checks) assert.equal(evaluateCheck(result.state, check), true, `niveau ${exam.level}: ${check.label}`);
  }
});
