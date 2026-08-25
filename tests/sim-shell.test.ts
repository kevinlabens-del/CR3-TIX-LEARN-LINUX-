import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, evaluateCheck, executeCommandLine } from "../src/learn-linux/sim-shell.ts";
import { ALL_MODULES } from "../src/learn-linux/content.ts";

function run(commands: string[]) {
  let state = createInitialState();
  let lastOutput = "";
  for (const command of commands) {
    const result = executeCommandLine(state, command);
    state = result.state;
    lastOutput = `${result.stdout}${result.stderr}`;
  }
  return { state, lastOutput };
}

test("navigue, crée et lit un fichier virtuel", () => {
  const { state, lastOutput } = run(["mkdir lab", "cd lab", "echo Bonjour > note.txt", "cat note.txt"]);
  assert.equal(state.cwd, "/home/learner/lab");
  assert.match(lastOutput, /Bonjour/);
  assert.equal(state.fs["/home/learner/lab/note.txt"].content, "Bonjour\n");
});

test("enchaîne les pipes et redirections", () => {
  const { state, lastOutput } = run(["grep ERROR logs/app.log | wc -l", "sort users.txt | uniq > uniques.txt", "cat uniques.txt"]);
  assert.match(lastOutput, /alice/);
  assert.equal(state.fs["/home/learner/uniques.txt"].content, "alice\nbob\ncharlie\n");
});

test("isole les opérations dangereuses du vrai système", () => {
  const initial = createInitialState();
  const result = executeCommandLine(initial, "rm -rf /");
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.state.fs["/home/learner"]);
  assert.equal(initial.fs["/home/learner/notes.txt"].type, "file");
});

test("résout un incident simulé de bout en bout", () => {
  const { state, lastOutput } = run(["chmod 600 .ssh/id_ed25519", "sudo systemctl restart webapp", "docker restart api", "curl http://web.lab"]);
  assert.equal(state.fs["/home/learner/.ssh/id_ed25519"].mode, "600");
  assert.equal(state.services.webapp, "active");
  assert.equal(state.containers.api, "running");
  assert.match(lastOutput, /200 OK/);
});

test("chaque exemple pédagogique satisfait ses contrôles", () => {
  for (const courseModule of ALL_MODULES) {
    let state = createInitialState();
    for (const lesson of courseModule.lessons) {
      const commands = (lesson.example ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
      assert.ok(commands.length, `${lesson.id}: exemple manquant`);
      for (const command of commands) state = executeCommandLine(state, command).state;
      for (const check of lesson.exercise.checks) {
        assert.equal(evaluateCheck(state, check), true, `${lesson.id}: contrôle non satisfait — ${check.label} — exemple: ${lesson.example}`);
      }
    }
  }
});
