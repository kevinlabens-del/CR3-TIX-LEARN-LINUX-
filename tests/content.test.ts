import assert from "node:assert/strict";
import test from "node:test";
import { ALL_LESSONS, ALL_MODULES, COMMAND_DOCS, COURSE_LEVELS, GLOSSARY } from "../src/learn-linux/content.ts";

test("le parcours couvre cinq niveaux et reste extensible", () => {
  assert.equal(COURSE_LEVELS.length, 5);
  assert.equal(ALL_MODULES.length, 27);
  assert.ok(ALL_LESSONS.length >= 50);
  assert.ok(COMMAND_DOCS.length >= 40);
  assert.ok(GLOSSARY.length >= 20);
});

test("les identifiants sont uniques et chaque exercice possède trois indices", () => {
  assert.equal(new Set(ALL_MODULES.map((item) => item.id)).size, ALL_MODULES.length);
  assert.equal(new Set(ALL_LESSONS.map((item) => item.id)).size, ALL_LESSONS.length);
  for (const lesson of ALL_LESSONS) {
    assert.equal(lesson.exercise.hints.length, 3, lesson.id);
    assert.ok(lesson.exercise.checks.length > 0, lesson.id);
    assert.ok(lesson.exercise.xp > 0, lesson.id);
  }
});

test("chaque examen contient cinq questions valides", () => {
  for (const level of COURSE_LEVELS) {
    assert.equal(level.exam.length, 5, `niveau ${level.id}`);
    for (const question of level.exam) {
      assert.equal(question.choices.length, 4);
      assert.ok(question.answer >= 0 && question.answer < question.choices.length);
    }
  }
});
