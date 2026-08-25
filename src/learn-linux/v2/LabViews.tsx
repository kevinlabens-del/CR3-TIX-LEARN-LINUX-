import { useState } from "react";
import type { LearnerProgress } from "../progress";
import { evaluateCheck, type ExecutionResult, type SimState } from "../sim-shell";
import { TerminalPanel } from "../TerminalPanel";
import { LABS, type LabScenario } from "./labs";

const TRACKS = ["Tous", "Fondamentaux", "Administration", "Réseau", "DevOps", "Sécurité"] as const;

function unlockedLevel(progress: LearnerProgress): number {
  let level = 1;
  for (let index = 1; index <= 4; index += 1) {
    if (progress.passedExams.includes(index)) level = index + 1;
    else break;
  }
  return level;
}

export function LabCenter({ progress, onStart }: { progress: LearnerProgress; onStart: (scenario: LabScenario) => void }) {
  const [track, setTrack] = useState<(typeof TRACKS)[number]>("Tous");
  const level = unlockedLevel(progress);
  const visible = LABS.filter((scenario) => track === "Tous" || scenario.track === track);
  const completedXp = LABS.filter((scenario) => progress.completedLabs.includes(scenario.id)).reduce((sum, scenario) => sum + scenario.xp, 0);
  return (
    <div className="view-stack lab-center">
      <header className="lab-hero">
        <div><p className="eyebrow">MODE LABORATOIRE · V2</p><h1>Pense comme un pro.</h1><p>Tu reçois un incident, explores le système, choisis une stratégie puis prouves que le problème est résolu.</p></div>
        <div className="lab-hero-stats"><div><strong>{progress.completedLabs.length}</strong><span>/ {LABS.length} résolus</span></div><div><strong>{completedXp}</strong><span>XP terrain</span></div></div>
      </header>

      <div className="track-filter" role="group" aria-label="Filtrer les laboratoires">{TRACKS.map((item) => <button className={track === item ? "active" : ""} key={item} onClick={() => setTrack(item)}>{item}</button>)}</div>

      <div className="lab-grid">
        {visible.map((scenario, index) => {
          const locked = scenario.level > level;
          const completed = progress.completedLabs.includes(scenario.id);
          const score = progress.labScores[scenario.id];
          return (
            <article className={`lab-card panel ${locked ? "lab-locked" : ""} ${completed ? "lab-complete" : ""}`} key={scenario.id}>
              <div className="lab-card-top"><span>LAB {String(index + 1).padStart(2, "0")}</span><b>{completed ? `✓ ${score ?? 100}%` : locked ? `NIVEAU ${scenario.level}` : scenario.difficulty.toUpperCase()}</b></div>
              <div className="lab-track"><span>{scenario.track}</span><i />{scenario.role}</div>
              <h2>{scenario.title}</h2><p>{scenario.briefing}</p>
              <div className="lab-meta"><span>◷ {scenario.duration} min</span><span>⚡ {scenario.xp} XP</span><span>N{scenario.level}</span></div>
              <button className={`button ${locked ? "button-ghost" : "button-primary"}`} disabled={locked} onClick={() => onStart(scenario)}>{completed ? "Refaire la mission" : locked ? `Valide le niveau ${scenario.level - 1}` : "Accepter la mission →"}</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function LabSession({
  scenario,
  state,
  hintsUsed,
  attempts,
  passed,
  onState,
  onExecute,
  onHint,
  onBack,
  onReset,
}: {
  scenario: LabScenario;
  state: SimState;
  hintsUsed: number;
  attempts: number;
  passed: boolean;
  onState: (state: SimState) => void;
  onExecute: (command: string, result: ExecutionResult) => void;
  onHint: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const checks = scenario.checks.map((check) => ({ ...check, done: passed || evaluateCheck(state, check) }));
  const score = Math.max(40, 100 - hintsUsed * 12 - Math.max(0, attempts - 1) * 4);
  return (
    <div className="lab-session view-stack">
      <header className="lesson-nav"><button className="back-button" onClick={onBack}>← <span>Laboratoires</span></button><span className="difficulty-chip">{scenario.difficulty.toUpperCase()}</span><span className="xp-chip">{passed ? `${score}%` : `+${scenario.xp} XP`}</span></header>
      <section className="mission-brief panel">
        <div className="mission-role"><span>MISSION</span><strong>{scenario.role}</strong><small>{scenario.track} · Niveau {scenario.level}</small></div>
        <div><p className="eyebrow">BRIEFING</p><h1>{scenario.title}</h1><p>{scenario.briefing}</p></div>
      </section>
      <div className="lab-workspace">
        <aside className="mission-panel panel">
          <p className="eyebrow">OBJECTIF</p><h2>{scenario.objective}</h2>
          <div className="mission-checks">{checks.map((check, index) => <div className={check.done ? "done" : ""} key={`${check.label}-${index}`}><span>{check.done ? "✓" : index + 1}</span><p>{check.label}</p></div>)}</div>
          {passed ? <div className="mission-debrief"><span>✓</span><div><strong>Mission accomplie · {score}%</strong><p>{scenario.debrief}</p></div><button className="button button-primary" onClick={onBack}>Retour aux missions →</button></div> : <div className="hint-zone">{hintsUsed > 0 && <div className="visible-hints">{scenario.hints.slice(0, hintsUsed).map((hint, index) => <p key={hint}><b>Indice {index + 1}</b>{hint}</p>)}</div>}<button className="hint-button" disabled={hintsUsed >= 3} onClick={onHint}>💡 {hintsUsed ? "Indice suivant" : "Demander un indice"}<small>Score actuel : {score}%</small></button></div>}
          <button className="button button-ghost button-wide" onClick={onReset}>↻ Réinitialiser ce scénario</button>
        </aside>
        <main className="lab-terminal"><TerminalPanel state={state} onStateChange={onState} onExecute={onExecute} compact quickCommands={scenario.quickCommands} title={`Mission · ${scenario.title}`} /><div className="terminal-safety"><span>◉</span><div><strong>Infrastructure simulée</strong><p>État isolé et réinitialisable</p></div><i>SÛR</i></div></main>
      </div>
    </div>
  );
}
