import { useState } from "react";
import type { CourseLevel } from "../types";
import type { LearnerProgress } from "../progress";
import { evaluateCheck, type ExecutionResult, type SimState } from "../sim-shell";
import { TerminalPanel } from "../TerminalPanel";
import { createScenarioState, PRACTICAL_EXAMS } from "./labs";

export function ExamViewV2({
  level,
  progress,
  onComplete,
  onBack,
}: {
  level: CourseLevel;
  progress: LearnerProgress;
  onComplete: (score: number) => void;
  onBack: () => void;
}) {
  const passing = Math.ceil(level.exam.length * 0.8);
  const previousTheory = progress.passedExams.includes(level.id);
  const previousPractice = progress.passedPracticalExams.includes(level.id);
  const [stage, setStage] = useState<"quiz" | "practical" | "done">(previousTheory && !previousPractice ? "practical" : "quiz");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(previousTheory ? passing : 0);
  const practical = PRACTICAL_EXAMS.find((item) => item.level === level.id) ?? PRACTICAL_EXAMS[0];
  const [simState, setSimState] = useState<SimState>(() => createScenarioState(practical.setupCommands));
  const [practicalPassed, setPracticalPassed] = useState(false);
  const score = level.exam.filter((question, index) => answers[index] === question.answer).length;

  const submitQuiz = () => {
    setResult(score);
    if (score >= passing) setQuizScore(score);
  };

  const executePractice = (_command: string, execution: ExecutionResult) => {
    if (practicalPassed) return;
    const passed = practical.checks.every((check) => evaluateCheck(execution.state, check));
    if (!passed) return;
    setPracticalPassed(true);
    setStage("done");
    onComplete(quizScore || passing);
  };

  return (
    <div className="exam-view view-stack">
      <button className="back-button" onClick={onBack}>← <span>Retour au parcours</span></button>
      <header className="exam-hero"><span>EXAMEN V2 · NIVEAU {level.id}</span><h1>{level.title}</h1><p>La validation combine les connaissances et une mission réelle dans SimShell.</p><div><b>+150 XP</b><i />5 questions<i />1 cas pratique</div></header>

      <div className="exam-steps" aria-label="Étapes de l'examen"><span className={stage === "quiz" ? "active" : result !== null && (quizScore >= passing || previousTheory) ? "done" : ""}><b>1</b>Connaissances</span><i /><span className={stage === "practical" ? "active" : stage === "done" ? "done" : ""}><b>2</b>Mission terminal</span><i /><span className={stage === "done" ? "active done" : ""}><b>3</b>Validation</span></div>

      {stage === "quiz" && (
        <form className="question-list" onSubmit={(event) => { event.preventDefault(); submitQuiz(); }}>
          {level.exam.map((question, questionIndex) => (
            <fieldset className="question-card panel" key={question.question}>
              <legend><span>{String(questionIndex + 1).padStart(2, "0")}</span>{question.question}</legend>
              <div className="choice-list">{question.choices.map((choice, choiceIndex) => { const selected = answers[questionIndex] === choiceIndex; const reveal = result !== null; const correct = choiceIndex === question.answer; return <label className={`${selected ? "selected" : ""} ${reveal && correct ? "correct" : ""} ${reveal && selected && !correct ? "wrong" : ""}`} key={choice}><input type="radio" name={`question-${questionIndex}`} checked={selected} disabled={reveal} onChange={() => setAnswers((current) => ({ ...current, [questionIndex]: choiceIndex }))} /><span>{String.fromCharCode(65 + choiceIndex)}</span><p>{choice}</p></label>; })}</div>
              {result !== null && <p className="answer-explanation">{question.explanation}</p>}
            </fieldset>
          ))}
          {result === null ? <button className="button button-primary exam-submit" disabled={Object.keys(answers).length < level.exam.length}>Valider mes réponses</button> : <div className={`exam-result ${result >= passing ? "exam-pass" : "exam-fail"}`}><span>{result >= passing ? "✓" : "↻"}</span><div><h2>{result >= passing ? "Partie théorique réussie" : "Connaissances à consolider"}</h2><p>Score : {result}/{level.exam.length}. {result >= passing ? "Le cas pratique est maintenant disponible." : `Il faut ${passing}/${level.exam.length}.`}</p></div><button className="button button-primary" type="button" onClick={result >= passing ? () => setStage("practical") : () => { setResult(null); setAnswers({}); }}>{result >= passing ? "Lancer la mission →" : "Réessayer"}</button></div>}
        </form>
      )}

      {stage === "practical" && (
        <section className="practical-exam-grid">
          <div className="panel practical-brief"><p className="eyebrow">CAS PRATIQUE</p><h2>{practical.title}</h2><p>{practical.prompt}</p><div className="mission-checks">{practical.checks.map((check, index) => { const done = evaluateCheck(simState, check); return <div className={done ? "done" : ""} key={`${check.label}-${index}`}><span>{done ? "✓" : index + 1}</span><p>{check.label}</p></div>; })}</div><div className="autonomous-note"><span>◎</span><p>{"Aucun indice complet pendant l'examen. Lis les erreurs, observe l'état, puis vérifie ton résultat."}</p></div><button className="button button-ghost button-wide" onClick={() => setSimState(createScenarioState(practical.setupCommands))}>↻ Recommencer le cas</button></div>
          <div><TerminalPanel state={simState} onStateChange={setSimState} onExecute={executePractice} compact quickCommands={practical.quickCommands} title={`Examen · Niveau ${level.id}`} /><div className="terminal-safety"><span>◉</span><div><strong>Examen isolé</strong><p>Le résultat du système est vérifié automatiquement</p></div><i>ACTIF</i></div></div>
        </section>
      )}

      {stage === "done" && <div className="exam-result exam-pass final-exam-result"><span>✓</span><div><h2>Niveau {level.id} validé de bout en bout</h2><p>Tu as réussi le questionnaire et démontré la compétence dans le terminal. Le niveau suivant est débloqué.</p></div><button className="button button-primary" onClick={onBack}>Continuer →</button></div>}
      {previousPractice && <p className="already-passed">{"✓ Cet examen complet a déjà été validé. Le repasser n'ajoute pas de nouvel XP."}</p>}
    </div>
  );
}
