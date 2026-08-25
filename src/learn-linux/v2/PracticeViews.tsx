import { ALL_LESSONS, ALL_MODULES } from "../content";
import type { LearnerProgress } from "../progress";
import { evaluateCheck, type ExecutionResult, type SimState } from "../sim-shell";
import { TerminalPanel } from "../TerminalPanel";
import { buildAdaptiveQueue, mostFrequentErrors } from "./adaptive";
import { ALL_PRACTICES, getLessonForPractice, nextPracticeForLesson, type PracticeExercise } from "./practice";

const ERROR_LABELS: Record<string, string> = {
  commande: "Commande inconnue",
  syntaxe: "Syntaxe",
  chemin: "Chemins",
  permission: "Permissions",
  option: "Options",
  objectif: "Objectif incomplet",
};

export function PracticeCenter({
  progress,
  onStart,
  onCourse,
}: {
  progress: LearnerProgress;
  onStart: (exercise: PracticeExercise) => void;
  onCourse: () => void;
}) {
  const queue = buildAdaptiveQueue(progress);
  const reinforced = progress.completedPractices.filter((id) => !id.endsWith(":guided")).length;
  const errors = mostFrequentErrors(progress).slice(0, 3);
  const available = ALL_LESSONS
    .filter((lesson) => progress.completedLessons.includes(lesson.id))
    .map((lesson) => ({ lesson, exercise: nextPracticeForLesson(lesson.id, progress.completedLessons, progress.completedPractices) }))
    .filter((item): item is { lesson: (typeof ALL_LESSONS)[number]; exercise: PracticeExercise } => Boolean(item.exercise));

  return (
    <div className="view-stack practice-view">
      <header className="practice-hero">
        <div>
          <p className="eyebrow">COACH ADAPTATIF · V2</p>
          <h1>Ta séance de 5 minutes</h1>
          <p>Les exercices sont classés selon tes erreurs, les indices utilisés et la date de ta dernière réussite.</p>
        </div>
        <div className="practice-score"><strong>{reinforced}</strong><span>/ {ALL_LESSONS.length * 2}</span><small>renforcements validés</small></div>
      </header>

      <section className="adaptive-session panel">
        <div className="panel-head"><div><p className="eyebrow">PRIORITÉS DU JOUR</p><h2>{queue.length ? `${queue.length} exercices personnalisés` : "Commence par une leçon"}</h2></div><span className="ai-badge">LOCAL · PRIVÉ</span></div>
        {queue.length ? (
          <div className="adaptive-queue">
            {queue.map((item, index) => (
              <article key={item.exercise.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{item.lessonTitle}</strong><p>{item.reason}</p><small>{item.skill} · {item.exercise.title} · +{item.exercise.xp} XP</small></div>
                <button className="button button-primary" onClick={() => onStart(item.exercise)}>Pratiquer →</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><span>&gt;_</span><p>Termine ta première leçon pour générer une séance adaptée.</p><button className="button button-primary" onClick={onCourse}>Ouvrir le parcours</button></div>
        )}
      </section>

      <div className="practice-grid">
        <section className="panel practice-catalog">
          <div className="panel-head"><div><p className="eyebrow">ENTRAÎNEMENTS</p><h2>3 passages par notion</h2></div><span>{ALL_PRACTICES.length} exercices</span></div>
          <p className="panel-copy">Chaque leçon passe par la découverte guidée, la consolidation puis un défi sans indice.</p>
          <div className="practice-list">
            {available.slice(0, 12).map(({ lesson, exercise }) => {
              const courseModule = ALL_MODULES.find((item) => item.lessons.some((entry) => entry.id === lesson.id));
              const completed = progress.completedPractices.includes(exercise.id);
              return <button key={exercise.id} onClick={() => onStart(exercise)}><span className={`mode-dot mode-${exercise.mode}`} /> <div><strong>{lesson.title}</strong><small>N{courseModule?.level ?? 1} · {exercise.title}</small></div><b>{completed ? "Réviser" : `+${exercise.xp} XP`}</b></button>;
            })}
          </div>
        </section>

        <section className="panel error-insights">
          <div className="panel-head"><div><p className="eyebrow">DIAGNOSTIC</p><h2>Ce qui te ralentit</h2></div></div>
          {errors.length ? errors.map((item, index) => <div className="error-row" key={item.error}><span>{index + 1}</span><div><strong>{ERROR_LABELS[item.error] ?? item.error}</strong><small>{item.count} erreur{item.count > 1 ? "s" : ""} observée{item.count > 1 ? "s" : ""}</small></div><i style={{ width: `${Math.min(100, item.count * 14)}%` }} /></div>) : <div className="empty-state compact"><p>Le diagnostic apparaîtra après quelques essais.</p></div>}
          <div className="privacy-note"><span>✓</span><p>{"Cette analyse se fait uniquement dans ton navigateur. Aucune donnée ni commande n'est envoyée à un serveur."}</p></div>
        </section>
      </div>
    </div>
  );
}

export function PracticeSession({
  exercise,
  state,
  hintsUsed,
  passed,
  onState,
  onExecute,
  onHint,
  onBack,
  onReset,
}: {
  exercise: PracticeExercise;
  state: SimState;
  hintsUsed: number;
  passed: boolean;
  onState: (state: SimState) => void;
  onExecute: (command: string, result: ExecutionResult) => void;
  onHint: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const lesson = getLessonForPractice(exercise);
  const checks = exercise.checks.map((check) => ({ ...check, done: passed || evaluateCheck(state, check) }));
  const modeLabel = exercise.mode === "consolidation" ? "CONSOLIDATION" : exercise.mode === "autonomous" ? "AUTONOME" : "GUIDÉ";
  return (
    <div className="practice-session lesson-view">
      <header className="lesson-nav"><button className="back-button" onClick={onBack}>← <span>Révisions</span></button><span className={`difficulty-chip mode-${exercise.mode}`}>{modeLabel}</span><span className="xp-chip">+{exercise.xp} XP</span></header>
      <div className="lesson-grid">
        <main className="lesson-content">
          <p className="eyebrow">ENTRAÎNEMENT ADAPTATIF</p>
          <h1>{lesson?.title ?? "Révision Linux"}</h1>
          <p className="lesson-intro">{exercise.prompt}</p>
          <section className={`exercise-card ${passed ? "exercise-complete" : ""}`}>
            <div className="exercise-heading"><div><p className="eyebrow">OBJECTIFS VÉRIFIÉS</p><h2>Le résultat compte, pas la commande exacte.</h2></div><span className="difficulty-chip">{modeLabel}</span></div>
            <div className="check-list">{checks.map((check, index) => <div className={check.done ? "check-done" : ""} key={`${check.label}-${index}`}><span>{check.done ? "✓" : index + 1}</span><p>{check.label}</p></div>)}</div>
            {passed ? <div className="success-box"><span>✓</span><div><strong>Compétence consolidée</strong><p>{exercise.success}</p></div><button className="button button-primary" onClick={onBack}>Séance suivante →</button></div> : exercise.hints.length ? <div className="hint-zone">{hintsUsed > 0 && <div className="visible-hints">{exercise.hints.slice(0, hintsUsed).map((hint, index) => <p key={hint}><b>Indice {index + 1}</b>{hint}</p>)}</div>}<button className="hint-button" disabled={hintsUsed >= exercise.hints.length} onClick={onHint}>💡 {hintsUsed ? "Indice suivant" : "Demander un indice"}<small>{exercise.hints.length - hintsUsed} restant{exercise.hints.length - hintsUsed > 1 ? "s" : ""}</small></button></div> : <div className="autonomous-note"><span>◎</span><p>Mode autonome : observe les messages du terminal et corrige ta stratégie sans indice.</p></div>}
          </section>
          <button className="button button-ghost" onClick={onReset}>↻ Recommencer avec un laboratoire propre</button>
        </main>
        <aside className="lesson-terminal"><TerminalPanel state={state} onStateChange={onState} onExecute={onExecute} compact quickCommands={["pwd", "ls", "clear"]} title={`Révision · ${lesson?.title ?? "Linux"}`} /><div className="terminal-safety"><span>◉</span><div><strong>Système simulé</strong><p>Retour arrière disponible dans le terminal</p></div><i>ISOLÉ</i></div></aside>
      </div>
    </div>
  );
}
