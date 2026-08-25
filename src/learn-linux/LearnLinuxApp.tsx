"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ALL_LESSONS, ALL_MODULES, COMMAND_DOCS, COURSE_LEVELS, GLOSSARY } from "./content";
import {
  ACHIEVEMENTS,
  coursePercent,
  currentStreak,
  defaultProgress,
  findNextLesson,
  formatDuration,
  isLessonUnlocked,
  isLevelComplete,
  isModuleComplete,
  isModuleUnlocked,
  lessonAward,
  nextRankForXp,
  rankForXp,
  refreshAchievements,
  sanitizeProgress,
  THEME_STORAGE_KEY,
  totalV2Xp,
  touchToday,
  type LearnerProgress,
} from "./progress";
import { createInitialState, evaluateCheck, type ExecutionResult, type SimState } from "./sim-shell";
import { TerminalPanel } from "./TerminalPanel";
import type { CourseLevel, CourseModule, Lesson } from "./types";
import { loadLocalProgress, replaceLocalProgress, saveLocalProgress } from "./storage/local-progress";
import { classifyLearningError, updateLessonPerformance } from "./v2/adaptive";
import { LabCenter, LabSession } from "./v2/LabViews";
import { LABS, createScenarioState, type LabScenario } from "./v2/labs";
import { PracticeCenter, PracticeSession } from "./v2/PracticeViews";
import { practiceId, type PracticeExercise } from "./v2/practice";
import { ExamViewV2 } from "./v2/ExamViewV2";

type MainView = "home" | "course" | "lesson" | "terminal" | "library" | "profile" | "exam" | "practice" | "practice-session" | "labs" | "lab-session";
type Theme = "dark" | "light";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface ToastState {
  title: string;
  detail: string;
  tone?: "success" | "info";
}

const NAV_ITEMS: { id: MainView; label: string; icon: string }[] = [
  { id: "home", label: "Accueil", icon: "⌂" },
  { id: "course", label: "Parcours", icon: "▤" },
  { id: "practice", label: "Révisions", icon: "↻" },
  { id: "labs", label: "Laboratoires", icon: "◇" },
  { id: "terminal", label: "Terminal", icon: ">_" },
  { id: "library", label: "Mémo", icon: "⌕" },
  { id: "profile", label: "Profil", icon: "◎" },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => ["home", "course", "practice", "labs", "terminal"].includes(item.id));

function moduleForLesson(lessonId: string): CourseModule | undefined {
  return ALL_MODULES.find((item) => item.lessons.some((lesson) => lesson.id === lessonId));
}

function getLesson(lessonId: string): Lesson | undefined {
  return ALL_LESSONS.find((item) => item.id === lessonId);
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <header className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="section-description">{description}</p>}
    </header>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{value}%</strong><span>{label}</span></div>
    </div>
  );
}

function LevelPill({ level }: { level: number }) {
  const item = COURSE_LEVELS[level - 1];
  return <span className={`level-pill level-${item?.color ?? "cyan"}`}>Niveau {level} · {item?.title}</span>;
}

function Onboarding({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="onboarding-screen">
      <div className="onboarding-grid" aria-hidden="true" />
      <section className="onboarding-card">
        <div className="brand-lockup brand-large">
          <div className="brand-mark"><span>&gt;_</span></div>
          <div><strong>CR3@TIX <i className="version-badge">V2</i></strong><span>LEARN LINUX</span></div>
        </div>
        <p className="onboarding-kicker"><span /> Bienvenue dans ton laboratoire</p>
        <h1>Apprends Linux.<br /><em>Commande après commande.</em></h1>
        <p className="onboarding-copy">Aucune connaissance requise. Tu vas comprendre, pratiquer et progresser dans un terminal entièrement sécurisé.</p>
        <div className="onboarding-benefits">
          <span><b>01</b> 162 entraînements</span>
          <span><b>02</b> 15 missions terrain</span>
          <span><b>03</b> SimShell 2.0 isolé</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onStart(name.trim() || "Learner");
          }}
        >
          <label htmlFor="learner-name">{"Comment veux-tu qu'on t'appelle ?"}</label>
          <div className="onboarding-input-row">
            <input id="learner-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Ton prénom" autoFocus />
            <button className="button button-primary" type="submit">Entrer dans le lab <span>→</span></button>
          </div>
        </form>
        <small>Progression privée enregistrée sur cet appareil · Aucun compte, aucun traçage</small>
      </section>
    </div>
  );
}

function HomeView({
  progress,
  onContinue,
  onOpenTerminal,
  onOpenPractice,
  onOpenLabs,
}: {
  progress: LearnerProgress;
  onContinue: () => void;
  onOpenTerminal: () => void;
  onOpenPractice: () => void;
  onOpenLabs: () => void;
}) {
  const nextLesson = findNextLesson(progress);
  const nextModule = nextLesson ? moduleForLesson(nextLesson.id) : undefined;
  const percent = coursePercent(progress);
  const streak = currentStreak(progress.activeDays);
  const weakSkills = Object.entries(progress.skillMastery)
    .filter(([, value]) => value < 65)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3);

  return (
    <div className="view-stack dashboard-view">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">SESSION DU JOUR <span className="live-label"><i /> LAB ACTIF</span></p>
          <h1>Bonjour {progress.displayName || "Learner"}<span>.</span></h1>
          <p>{progress.completedLessons.length ? "Reprends exactement là où tu t'es arrêté." : "Ton premier terminal t'attend. On commence sans jargon."}</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={onContinue}>Continuer le parcours <span>→</span></button>
            <button className="button button-ghost" onClick={onOpenTerminal}><span className="mono">&gt;_</span> Terminal libre</button>
          </div>
        </div>
        <ProgressRing value={percent} label="du parcours" />
      </section>

      <section className="stat-grid" aria-label="Statistiques principales">
        <article className="stat-card"><span className="stat-icon">⚡</span><div><strong>{progress.xp.toLocaleString("fr-FR")}</strong><span>XP total</span></div><small>sur {totalV2Xp.toLocaleString("fr-FR")}</small></article>
        <article className="stat-card"><span className="stat-icon">◫</span><div><strong>{progress.completedLessons.length}</strong><span>leçons finies</span></div><small>sur {ALL_LESSONS.length}</small></article>
        <article className="stat-card"><span className="stat-icon">◇</span><div><strong>{progress.completedLabs.length}/{LABS.length}</strong><span>labs résolus</span></div><small>{rankForXp(progress.xp).short}</small></article>
        <article className="stat-card"><span className="stat-icon">↗</span><div><strong>{streak}</strong><span>jour{streak > 1 ? "s" : ""} de série</span></div><small>{streak ? "continue !" : "dès aujourd'hui"}</small></article>
      </section>

      <div className="dashboard-grid">
        <section className="continue-card panel">
          <div className="panel-head">
            <div><p className="eyebrow">PROCHAINE ÉTAPE</p><h2>{nextLesson?.title ?? "Parcours terminé"}</h2></div>
            {nextModule && <LevelPill level={nextModule.level} />}
          </div>
          {nextLesson && nextModule ? (
            <>
              <p>{nextLesson.intro}</p>
              <div className="module-line"><span>{nextModule.icon}</span><div><b>{nextModule.title}</b><small>Leçon {nextModule.lessons.findIndex((item) => item.id === nextLesson.id) + 1}/{nextModule.lessons.length} · environ 7 min</small></div></div>
              <div className="mini-progress"><span style={{ width: `${(progress.completedLessons.length / ALL_LESSONS.length) * 100}%` }} /></div>
              <button className="button button-primary button-wide" onClick={onContinue}>Lancer la leçon <span>→</span></button>
            </>
          ) : <p>Tu as terminé toutes les leçons. Ton certificat Linux Pro est disponible dans ton profil.</p>}
        </section>

        <section className="adaptive-card panel">
          <div className="panel-head"><div><p className="eyebrow">RÉVISION INTELLIGENTE</p><h2>Consolide tes acquis</h2></div><span className="ai-badge">ADAPTATIF</span></div>
          {weakSkills.length ? (
            <div className="skill-list">
              {weakSkills.map(([skill, value]) => <div className="skill-row" key={skill}><span>{skill}</span><div><i style={{ width: `${value}%` }} /></div><b>{Math.round(value)}%</b></div>)}
            </div>
          ) : (
            <div className="empty-state compact"><span>◎</span><p>Pratique quelques leçons : tes points faibles apparaîtront ici.</p></div>
          )}
          <button className="button button-primary button-wide" onClick={onOpenPractice}>Lancer ma révision →</button>
        </section>
      </div>

      <section className="v2-callout panel"><div><span>V2</span><div><p className="eyebrow">MISE EN SITUATION</p><h2>15 incidents proches du monde professionnel</h2><p>Fichiers perdus, clés SSH, processus, services, réseau, conteneurs et incident final.</p></div></div><button className="button button-ghost" onClick={onOpenLabs}>Explorer les laboratoires →</button></section>

      <section className="safety-banner">
        <span className="safety-icon">✓</span>
        <div><strong>Laboratoire 100 % isolé</strong><p>Les commandes modifient uniquement un système de fichiers virtuel en mémoire. Ton appareil reste intact.</p></div>
        <span className="safety-status"><i /> PROTÉGÉ</span>
      </section>
    </div>
  );
}

function CourseView({
  progress,
  onLesson,
  onExam,
}: {
  progress: LearnerProgress;
  onLesson: (lesson: Lesson) => void;
  onExam: (level: CourseLevel) => void;
}) {
  return (
    <div className="view-stack">
      <SectionHeading eyebrow="PARCOURS COMPLET" title="De zéro à Linux Pro" description="Chaque module se débloque dans l'ordre. Les examens valident les compétences avant le niveau suivant." />
      <div className="roadmap-summary panel">
        <ProgressRing value={coursePercent(progress)} label="terminé" />
        <div><strong>{progress.completedLessons.length}/{ALL_LESSONS.length} leçons</strong><span>{progress.passedExams.length}/5 examens réussis</span></div>
        <div className="roadmap-legend"><span><i className="legend-done" /> Terminé</span><span><i className="legend-now" /> Disponible</span><span><i /> Verrouillé</span></div>
      </div>

      <div className="level-list">
        {COURSE_LEVELS.map((level) => {
          const complete = isLevelComplete(level.id, progress);
          const passed = progress.passedExams.includes(level.id);
          const unlocked = level.id === 1 || progress.passedExams.includes(level.id - 1);
          return (
            <section className={`level-section level-border-${level.color} ${!unlocked ? "is-locked" : ""}`} key={level.id}>
              <header className="level-header">
                <div className={`level-number level-${level.color}`}>{String(level.id).padStart(2, "0")}</div>
                <div><p className="eyebrow">NIVEAU {level.id}</p><h2>{level.title}</h2><p>{level.description}</p></div>
                <div className="level-rank"><span>{passed ? "VALIDÉ" : unlocked ? level.rank : "VERROUILLÉ"}</span><b>{level.modules.reduce((sum, item) => sum + item.lessons.length, 0)} leçons</b></div>
              </header>
              <div className="module-grid">
                {level.modules.map((courseModule) => {
                  const moduleComplete = isModuleComplete(courseModule.id, progress);
                  const moduleUnlocked = isModuleUnlocked(courseModule.id, progress);
                  const lessonDone = courseModule.lessons.filter((lesson) => progress.completedLessons.includes(lesson.id)).length;
                  const firstAvailable = courseModule.lessons.find((lesson) => isLessonUnlocked(lesson.id, progress) && !progress.completedLessons.includes(lesson.id)) ?? courseModule.lessons[0];
                  return (
                    <article className={`module-card ${moduleComplete ? "module-complete" : ""} ${!moduleUnlocked ? "module-locked" : ""}`} key={courseModule.id}>
                      <div className="module-top"><span className="module-icon">{moduleUnlocked ? courseModule.icon : "⌁"}</span><span>{moduleComplete ? "TERMINÉ" : moduleUnlocked ? `${lessonDone}/${courseModule.lessons.length}` : "BLOQUÉ"}</span></div>
                      <h3>{courseModule.title}</h3><p>{courseModule.subtitle}</p>
                      <div className="module-skills">{courseModule.skills.slice(0, 3).map((skill) => <code key={skill}>{skill}</code>)}</div>
                      <div className="mini-progress"><span style={{ width: `${(lessonDone / courseModule.lessons.length) * 100}%` }} /></div>
                      <button className="card-link" disabled={!moduleUnlocked} onClick={() => onLesson(firstAvailable)}>{moduleComplete ? "Réviser" : moduleUnlocked ? "Commencer" : "Termine l'étape précédente"} <span>→</span></button>
                    </article>
                  );
                })}
              </div>
              <div className={`exam-row ${complete ? "exam-ready" : ""}`}>
                <span className="exam-mark">{passed ? "✓" : "A"}</span>
                <div><strong>Examen du niveau {level.id}</strong><span>{passed && progress.passedPracticalExams.includes(level.id) ? "Réussi · théorie + pratique" : complete ? "5 questions · 1 mission terminal · score requis 80 %" : "Termine tous les modules pour le débloquer"}</span></div>
                <button className={`button ${complete ? "button-primary" : "button-ghost"}`} disabled={!complete} onClick={() => onExam(level)}>{passed ? "Repasser" : "Passer l'examen"}</button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LessonView({
  lesson,
  courseModule,
  progress,
  simState,
  onSimState,
  onExecute,
  onHint,
  onBack,
  onNext,
}: {
  lesson: Lesson;
  courseModule: CourseModule;
  progress: LearnerProgress;
  simState: SimState;
  onSimState: (state: SimState) => void;
  onExecute: (command: string, result: ExecutionResult) => void;
  onHint: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const hintsUsed = progress.hintsByLesson[lesson.id] ?? 0;
  const completed = progress.completedLessons.includes(lesson.id);
  const checks = lesson.exercise.checks.map((check) => ({ ...check, done: evaluateCheck(simState, check) || completed }));
  const award = lessonAward(lesson.exercise.xp, hintsUsed);

  return (
    <div className="lesson-view">
      <header className="lesson-nav">
        <button className="back-button" onClick={onBack}>← <span>Parcours</span></button>
        <div className="lesson-step"><span>{courseModule.title}</span><div><i style={{ width: `${((courseModule.lessons.findIndex((item) => item.id === lesson.id) + (completed ? 1 : 0)) / courseModule.lessons.length) * 100}%` }} /></div><b>{courseModule.lessons.findIndex((item) => item.id === lesson.id) + 1}/{courseModule.lessons.length}</b></div>
        <span className="xp-chip">+{award} XP</span>
      </header>

      <div className="lesson-grid">
        <main className="lesson-content">
          <LevelPill level={courseModule.level} />
          <p className="eyebrow">{lesson.eyebrow}</p>
          <h1>{lesson.title}</h1>
          <p className="lesson-intro">{lesson.intro}</p>
          <ul className="learning-points">{lesson.points.map((point) => <li key={point}><span>✓</span>{point}</li>)}</ul>

          {lesson.command && (
            <section className="command-focus panel">
              <p className="eyebrow">COMMANDE À RETENIR</p>
              <div className="command-title"><code>{lesson.command}</code><button type="button" onClick={() => navigator.clipboard?.writeText(lesson.example ?? lesson.command ?? "")} aria-label="Copier l'exemple">Copier</button></div>
              {lesson.commandBreakdown?.length ? <div className="command-breakdown">{lesson.commandBreakdown.map((part) => <div key={`${part.token}-${part.meaning}`}><code>{part.token}</code><span>{part.meaning}</span></div>)}</div> : null}
              {lesson.example && <div className="command-example"><span>Exemple</span><code>$ {lesson.example}</code></div>}
            </section>
          )}

          <section className={`exercise-card ${completed ? "exercise-complete" : ""}`}>
            <div className="exercise-heading"><div><p className="eyebrow">EXERCICE PRATIQUE</p><h2>{lesson.exercise.prompt}</h2></div><span className="difficulty-chip">GUIDÉ</span></div>
            <div className="check-list">
              {checks.map((check, index) => <div className={check.done ? "check-done" : ""} key={`${check.label}-${index}`}><span>{check.done ? "✓" : index + 1}</span><p>{check.label}</p></div>)}
            </div>
            {completed ? (
              <div className="success-box"><span>✓</span><div><strong>Objectif atteint</strong><p>{lesson.exercise.success}</p></div><button className="button button-primary" onClick={onNext}>Étape suivante →</button></div>
            ) : (
              <div className="hint-zone">
                {hintsUsed > 0 && <div className="visible-hints">{lesson.exercise.hints.slice(0, hintsUsed).map((hint, index) => <p key={hint}><b>Indice {index + 1}</b>{hint}</p>)}</div>}
                <button className="hint-button" disabled={hintsUsed >= lesson.exercise.hints.length} onClick={onHint}>💡 {hintsUsed ? "Indice suivant" : "Besoin d'un indice ?"} <small>XP restant : {award}</small></button>
              </div>
            )}
          </section>
        </main>

        <aside className="lesson-terminal">
          <TerminalPanel state={simState} onStateChange={onSimState} onExecute={onExecute} compact quickCommands={["pwd", "ls", "clear"]} title={`Lab · ${courseModule.title}`} />
          <div className="terminal-safety"><span>◉</span><div><strong>Système simulé</strong><p>Aucun accès à ton appareil</p></div><i>ISOLÉ</i></div>
        </aside>
      </div>
    </div>
  );
}

function FreeTerminalView({ state, onState, onExecute, onReset }: { state: SimState; onState: (state: SimState) => void; onExecute: (command: string, result: ExecutionResult) => void; onReset: () => void }) {
  return (
    <div className="view-stack">
      <div className="terminal-page-head">
        <SectionHeading eyebrow="MODE LIBRE" title="Ton laboratoire Linux" description="Teste les commandes apprises. Tout se déroule dans une machine virtuelle simulée et isolée." />
        <button className="button button-ghost" onClick={onReset}>↻ Réinitialiser le lab</button>
      </div>
      <TerminalPanel state={state} onStateChange={onState} onExecute={onExecute} quickCommands={["pwd", "ls -la", "cat notes.txt", "ps aux", "df -h", "help ls", "clear"]} />
      <div className="terminal-info-grid">
        <article><span>01</span><div><strong>Expérimente librement</strong><p>Crée, déplace ou supprime des fichiers virtuels sans conséquence réelle.</p></div></article>
        <article><span>02</span><div><strong>Reste dans le lab</strong><p>{"Pas de réseau réel, pas de processus système, pas d'accès au stockage de l'appareil."}</p></div></article>
        <article><span>03</span><div><strong>Repars à zéro</strong><p>{"Le bouton de réinitialisation restaure instantanément l'environnement pédagogique."}</p></div></article>
      </div>
    </div>
  );
}

function LibraryView({ progress, onToggleFavorite }: { progress: LearnerProgress; onToggleFavorite: (name: string) => void }) {
  const [tab, setTab] = useState<"commands" | "glossary">("commands");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(COMMAND_DOCS[0]?.name ?? "");
  const commands = COMMAND_DOCS.filter((item) => `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  const terms = GLOSSARY.filter((item) => `${item.term} ${item.definition}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  const activeCommand = COMMAND_DOCS.find((item) => item.name === selected) ?? commands[0];

  return (
    <div className="view-stack">
      <SectionHeading eyebrow="BASE DE CONNAISSANCES" title="Commandes & glossaire" description="Retrouve les commandes apprises avec une explication adaptée à ton niveau." />
      <div className="library-toolbar">
        <div className="segmented-control"><button className={tab === "commands" ? "active" : ""} onClick={() => setTab("commands")}>Commandes <span>{COMMAND_DOCS.length}</span></button><button className={tab === "glossary" ? "active" : ""} onClick={() => setTab("glossary")}>Glossaire <span>{GLOSSARY.length}</span></button></div>
        <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "commands" ? "Rechercher une commande…" : "Rechercher un terme…"} /></label>
      </div>

      {tab === "commands" ? (
        <div className="command-library">
          <div className="command-list panel">
            {commands.map((item) => {
              const learned = progress.completedLessons.some((lessonId) => getLesson(lessonId)?.command === item.name);
              return <button key={item.name} className={activeCommand?.name === item.name ? "active" : ""} onClick={() => setSelected(item.name)}><code>{item.name}</code><span>{item.category}</span>{learned && <i>✓</i>}</button>;
            })}
            {!commands.length && <div className="empty-state compact"><p>Aucune commande trouvée.</p></div>}
          </div>
          {activeCommand && (
            <article className="command-detail panel">
              <header><div><LevelPill level={activeCommand.level} /><h2><code>{activeCommand.name}</code></h2></div><button className={`favorite-button ${progress.favoriteCommands.includes(activeCommand.name) ? "active" : ""}`} onClick={() => onToggleFavorite(activeCommand.name)} aria-label="Ajouter aux favoris">☆</button></header>
              <p>{activeCommand.description}</p>
              {activeCommand.danger && <div className="warning-callout"><span>!</span><p>Commande pouvant modifier le système sur un vrai Linux. Observe la cible avant de valider.</p></div>}
              <div className="doc-block"><span>SYNTAXE</span><code>{activeCommand.syntax}</code></div>
              <div className="doc-block"><span>EXEMPLE</span><code>$ {activeCommand.example}</code></div>
              {activeCommand.note && <p className="doc-note">{activeCommand.note}</p>}
              <div className="explanation-levels"><p className="eyebrow">EXPLICATION PROGRESSIVE</p><details open><summary>Débutant</summary><p>{activeCommand.description}{" Copie l'exemple dans le laboratoire pour observer son résultat sans risque."}</p></details><details><summary>Technique</summary><p>Syntaxe : <code>{activeCommand.syntax}</code>{". Lis toujours le code de retour et la sortie d'erreur pour confirmer le résultat."}</p></details></div>
            </article>
          )}
        </div>
      ) : (
        <div className="glossary-grid">{terms.map((item) => <article className="glossary-card" key={item.term}><span>N{item.level}</span><h3>{item.term}</h3><p>{item.definition}</p></article>)}</div>
      )}
    </div>
  );
}

function ProfileView({ progress, onImport, onReset }: { progress: LearnerProgress; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onReset: () => void }) {
  const currentRank = rankForXp(progress.xp);
  const nextRank = nextRankForXp(progress.xp);
  const skills = Object.entries(progress.skillMastery).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const graduated = progress.achievements.includes("graduate");

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "creatix-linux-v2-progression.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view-stack">
      <SectionHeading eyebrow="PROFIL LOCAL · SANS COMPTE" title={progress.displayName || "Learner"} description="Ta progression reste privée dans le stockage de ce navigateur. Aucun profil en ligne n'est créé." />
      <section className="profile-hero panel">
        <div className="profile-avatar">{(progress.displayName || "L").slice(0, 2).toUpperCase()}</div>
        <div className="profile-rank"><span>RANG ACTUEL</span><h2>{currentRank.name}</h2><p>{progress.xp.toLocaleString("fr-FR")} XP {nextRank ? `· encore ${nextRank.min - progress.xp} pour ${nextRank.name}` : "· rang maximal"}</p><div className="mini-progress"><i style={{ width: `${nextRank ? ((progress.xp - currentRank.min) / (nextRank.min - currentRank.min)) * 100 : 100}%` }} /></div></div>
        <div className="profile-score"><strong>{coursePercent(progress)}%</strong><span>du parcours</span></div>
      </section>
      <section className="profile-stats stat-grid"><article className="stat-card"><span className="stat-icon">◫</span><div><strong>{progress.completedLessons.length}</strong><span>leçons</span></div></article><article className="stat-card"><span className="stat-icon">↻</span><div><strong>{progress.completedPractices.filter((id) => !id.endsWith(":guided")).length}</strong><span>révisions</span></div></article><article className="stat-card"><span className="stat-icon">◇</span><div><strong>{progress.completedLabs.length}</strong><span>laboratoires</span></div></article><article className="stat-card"><span className="stat-icon">◷</span><div><strong>{formatDuration(progress.totalSeconds)}</strong><span>de pratique</span></div></article></section>

      <div className="profile-grid">
        <section className="panel mastery-panel"><div className="panel-head"><div><p className="eyebrow">MAÎTRISE</p><h2>Compétences suivies</h2></div></div>{skills.length ? <div className="skill-list">{skills.map(([skill, value]) => <div className="skill-row" key={skill}><span>{skill}</span><div><i style={{ width: `${value}%` }} /></div><b>{Math.round(value)}%</b></div>)}</div> : <div className="empty-state compact"><p>Les données apparaîtront après tes premiers exercices.</p></div>}</section>
        <section className="panel badge-panel"><div className="panel-head"><div><p className="eyebrow">SUCCÈS</p><h2>{progress.achievements.length}/{ACHIEVEMENTS.length} badges</h2></div></div><div className="badge-grid">{ACHIEVEMENTS.map((badge) => { const unlocked = progress.achievements.includes(badge.id); return <article className={unlocked ? "unlocked" : ""} key={badge.id}><span>{unlocked ? badge.icon : "?"}</span><div><strong>{badge.title}</strong><small>{badge.description}</small></div></article>; })}</div></section>
      </div>

      <section className="panel history-panel"><div className="panel-head"><div><p className="eyebrow">HISTORIQUE RÉCENT</p><h2>Commandes exécutées</h2></div><span>{progress.commandHistory.length} au total</span></div>{progress.commandHistory.length ? <div className="history-list">{progress.commandHistory.slice(-12).reverse().map((item, index) => <div key={`${item.at}-${index}`}><code>$ {item.command}</code><span className={item.exitCode === 0 ? "history-ok" : "history-error"}>{item.exitCode === 0 ? "OK" : `CODE ${item.exitCode}`}</span><time>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.at))}</time></div>)}</div> : <div className="empty-state compact"><p>Aucune commande exécutée pour le moment.</p></div>}</section>

      {graduated && <section className="certificate panel"><div className="certificate-mark">CR3@TIX</div><p>CERTIFICAT DE PARCOURS</p><h2>Linux Pro</h2><span>attribué à</span><h3>{progress.displayName}</h3><p>pour avoir terminé les 5 niveaux, les laboratoires et les examens du parcours CR3@TIX Learn Linux.</p><button className="button button-primary no-print" onClick={() => window.print()}>Imprimer le certificat</button></section>}

      <section className="data-panel panel"><div><p className="eyebrow">DONNÉES LOCALES & HORS LIGNE</p><h2>Aucun compte nécessaire</h2><p>{"Sauvegarde renforcée sur l'appareil avec migration V1 → V2. Exporte un fichier pour changer d'appareil."}</p></div><div className="data-actions"><button className="button button-ghost" onClick={exportProgress}>↓ Exporter</button><label className="button button-ghost">↑ Importer<input type="file" accept="application/json" onChange={onImport} hidden /></label><button className="button button-danger" onClick={onReset}>Réinitialiser</button></div></section>
    </div>
  );
}

export default function LearnLinuxApp() {
  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgress] = useState<LearnerProgress>(() => defaultProgress());
  const [view, setView] = useState<MainView>("home");
  const [activeLessonId, setActiveLessonId] = useState(ALL_LESSONS[0]?.id ?? "");
  const [activeExamLevel, setActiveExamLevel] = useState(1);
  const [simState, setSimState] = useState<SimState>(() => createInitialState());
  const [simModuleId, setSimModuleId] = useState("");
  const [simResetKey, setSimResetKey] = useState(0);
  const [activePractice, setActivePractice] = useState<PracticeExercise | null>(null);
  const [practiceState, setPracticeState] = useState<SimState>(() => createInitialState());
  const [practiceHints, setPracticeHints] = useState(0);
  const [practicePassed, setPracticePassed] = useState(false);
  const practiceStartedAt = useRef(0);
  const [activeLab, setActiveLab] = useState<LabScenario | null>(null);
  const [labState, setLabState] = useState<SimState>(() => createInitialState());
  const [labHints, setLabHints] = useState(0);
  const [labAttempts, setLabAttempts] = useState(0);
  const [labPassed, setLabPassed] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeLesson = getLesson(activeLessonId) ?? ALL_LESSONS[0];
  const activeModule = activeLesson ? moduleForLesson(activeLesson.id) : undefined;
  const activeExam = COURSE_LEVELS.find((item) => item.id === activeExamLevel) ?? COURSE_LEVELS[0];
  const rank = rankForXp(progress.xp);

  /* La restauration locale doit s'effectuer après l'hydratation du rendu statique. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    void loadLocalProgress().then((stored) => {
      if (cancelled) return;
      const loaded = refreshAchievements(touchToday(stored));
      setProgress(loaded);
      setActiveLessonId(loaded.currentLessonId || ALL_LESSONS[0]?.id || "");
      setHydrated(true);
    });
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    const resolved = storedTheme ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    setOnline(navigator.onLine);
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "terminal" || requestedView === "practice") setView(requestedView);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").then((registration) => {
        if (registration.waiting) setUpdateRegistration(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateRegistration(registration);
          });
        });
      }).catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    void saveLocalProgress(progress);
  }, [hydrated, progress]);

  useEffect(() => {
    if (!hydrated || !progress.onboardingComplete) return;
    const timer = window.setInterval(() => {
      setProgress((current) => ({ ...current, totalSeconds: current.totalSeconds + 30 }));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [hydrated, progress.onboardingComplete]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = (next: ToastState) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  const updateProgress = (updater: (current: LearnerProgress) => LearnerProgress) => {
    setProgress((current) => refreshAchievements(touchToday(updater(current))));
  };

  const openLesson = (lesson: Lesson) => {
    if (!isLessonUnlocked(lesson.id, progress) && !progress.completedLessons.includes(lesson.id)) return;
    const targetModule = moduleForLesson(lesson.id);
    if (targetModule && targetModule.id !== simModuleId) {
      setSimState(createInitialState());
      setSimResetKey((value) => value + 1);
      setSimModuleId(targetModule.id);
    }
    setActiveLessonId(lesson.id);
    updateProgress((current) => ({ ...current, currentLessonId: lesson.id }));
    setView("lesson");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openNextLesson = () => {
    const currentIndex = ALL_LESSONS.findIndex((item) => item.id === activeLessonId);
    const next = ALL_LESSONS[currentIndex + 1];
    if (next && isLessonUnlocked(next.id, progress)) openLesson(next);
    else setView("course");
  };

  const openPractice = (exercise: PracticeExercise) => {
    setActivePractice(exercise);
    setPracticeState(createInitialState());
    setPracticeHints(0);
    setPracticePassed(false);
    practiceStartedAt.current = Date.now();
    setView("practice-session");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openLab = (scenario: LabScenario) => {
    setActiveLab(scenario);
    setLabState(createScenarioState(scenario.setupCommands));
    setLabHints(0);
    setLabAttempts(0);
    setLabPassed(false);
    setView("lab-session");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const recordCommand = (command: string, result: ExecutionResult, evaluateLesson: boolean) => {
    updateProgress((current) => {
      const historyItem = {
        command,
        output: `${result.stdout}${result.stderr}`.slice(0, 3000),
        exitCode: result.exitCode,
        at: new Date().toISOString(),
      };
      let next: LearnerProgress = { ...current, commandHistory: [...current.commandHistory, historyItem].slice(-250) };
      if (!evaluateLesson || !activeLesson || !activeModule) return next;

      const lessonId = activeLesson.id;
      const passed = activeLesson.exercise.checks.every((check) => evaluateCheck(result.state, check));
      const attempts = (current.attemptsByLesson[lessonId] ?? 0) + 1;
      const mastery = { ...current.skillMastery };
      for (const skill of activeModule.skills) {
        const value = mastery[skill] ?? 30;
        mastery[skill] = Math.max(5, Math.min(100, value + (passed ? 18 : result.exitCode === 0 ? 1 : -3)));
      }
      const error = classifyLearningError(result, passed);
      const performance = updateLessonPerformance(current.performanceByLesson[lessonId], {
        passed,
        hintsUsed: passed ? (current.hintsByLesson[lessonId] ?? 0) : 0,
        elapsedSeconds: 60,
        error,
      });
      next = { ...next, attemptsByLesson: { ...current.attemptsByLesson, [lessonId]: attempts }, skillMastery: mastery, performanceByLesson: { ...current.performanceByLesson, [lessonId]: performance } };
      if (passed && !current.completedLessons.includes(lessonId)) {
        const award = lessonAward(activeLesson.exercise.xp, current.hintsByLesson[lessonId] ?? 0);
        const completedLessons = [...current.completedLessons, lessonId];
        const completedPractices = [...new Set([...current.completedPractices, practiceId(lessonId, "guided")])];
        const provisional = { ...next, completedLessons, completedPractices, xp: current.xp + award };
        const following = findNextLesson(provisional);
        next = { ...provisional, currentLessonId: following?.id ?? lessonId };
        queueMicrotask(() => showToast({ title: `+${award} XP · Leçon terminée`, detail: activeLesson.exercise.success, tone: "success" }));
      } else if (!passed && result.exitCode !== 0) {
        queueMicrotask(() => showToast({ title: "Pas encore", detail: "Lis le message du terminal : il indique souvent précisément ce qu'il faut corriger.", tone: "info" }));
      }
      return next;
    });
  };

  const recordPracticeCommand = (command: string, result: ExecutionResult) => {
    if (!activePractice || practicePassed) return;
    const passed = activePractice.checks.every((check) => evaluateCheck(result.state, check));
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - practiceStartedAt.current) / 1000));
    practiceStartedAt.current = Date.now();
    if (passed) setPracticePassed(true);
    updateProgress((current) => {
      const lesson = getLesson(activePractice.lessonId);
      const courseModule = lesson ? moduleForLesson(lesson.id) : undefined;
      const historyItem = { command, output: `${result.stdout}${result.stderr}`.slice(0, 3000), exitCode: result.exitCode, at: new Date().toISOString() };
      const alreadyComplete = current.completedPractices.includes(activePractice.id);
      const performance = updateLessonPerformance(current.performanceByLesson[activePractice.lessonId], {
        passed,
        hintsUsed: passed ? practiceHints : 0,
        elapsedSeconds,
        error: classifyLearningError(result, passed),
      });
      const mastery = { ...current.skillMastery };
      for (const skill of courseModule?.skills ?? []) {
        mastery[skill] = Math.max(5, Math.min(100, (mastery[skill] ?? 35) + (passed ? activePractice.mode === "autonomous" ? 14 : 9 : result.exitCode === 0 ? 1 : -2)));
      }
      const completedPractices = passed && !alreadyComplete ? [...current.completedPractices, activePractice.id] : current.completedPractices;
      const next = {
        ...current,
        commandHistory: [...current.commandHistory, historyItem].slice(-250),
        performanceByLesson: { ...current.performanceByLesson, [activePractice.lessonId]: performance },
        skillMastery: mastery,
        completedPractices,
        xp: current.xp + (passed && !alreadyComplete ? activePractice.xp : 0),
      };
      if (passed) queueMicrotask(() => showToast({ title: alreadyComplete ? "Révision réussie" : `+${activePractice.xp} XP · Compétence renforcée`, detail: activePractice.success, tone: "success" }));
      else if (result.exitCode !== 0) queueMicrotask(() => showToast({ title: "Erreur analysée", detail: "Le coach local utilisera cette difficulté pour ta prochaine séance.", tone: "info" }));
      return next;
    });
  };

  const recordLabCommand = (command: string, result: ExecutionResult) => {
    if (!activeLab || labPassed) return;
    const nextAttempts = labAttempts + 1;
    setLabAttempts(nextAttempts);
    const passed = activeLab.checks.every((check) => evaluateCheck(result.state, check));
    const score = Math.max(40, 100 - labHints * 12 - Math.max(0, nextAttempts - 1) * 4);
    if (passed) setLabPassed(true);
    updateProgress((current) => {
      const historyItem = { command, output: `${result.stdout}${result.stderr}`.slice(0, 3000), exitCode: result.exitCode, at: new Date().toISOString() };
      const alreadyComplete = current.completedLabs.includes(activeLab.id);
      const completedLabs = passed && !alreadyComplete ? [...current.completedLabs, activeLab.id] : current.completedLabs;
      const labScores = passed ? { ...current.labScores, [activeLab.id]: Math.max(current.labScores[activeLab.id] ?? 0, score) } : current.labScores;
      if (passed) queueMicrotask(() => showToast({ title: alreadyComplete ? `Mission résolue · ${score}%` : `+${activeLab.xp} XP · Mission résolue`, detail: activeLab.debrief, tone: "success" }));
      return { ...current, commandHistory: [...current.commandHistory, historyItem].slice(-250), completedLabs, labScores, xp: current.xp + (passed && !alreadyComplete ? activeLab.xp : 0) };
    });
  };

  const completeExam = (score: number) => {
    if (score < Math.ceil(activeExam.exam.length * 0.8)) return;
    const alreadyPassed = progress.passedExams.includes(activeExam.id);
    updateProgress((current) => ({
      ...current,
      passedExams: current.passedExams.includes(activeExam.id) ? current.passedExams : [...current.passedExams, activeExam.id],
      passedPracticalExams: current.passedPracticalExams.includes(activeExam.id) ? current.passedPracticalExams : [...current.passedPracticalExams, activeExam.id],
      xp: current.xp + (current.passedExams.includes(activeExam.id) ? 0 : 150),
    }));
    showToast({ title: alreadyPassed ? "Cas pratique validé" : "+150 XP · Niveau validé", detail: `${activeExam.rank} débloqué.`, tone: "success" });
  };

  const switchTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  const importProgress = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = sanitizeProgress(JSON.parse(await file.text()));
      setProgress(refreshAchievements(touchToday(imported)));
      await replaceLocalProgress(imported);
      setActiveLessonId(imported.currentLessonId);
      showToast({ title: "Progression importée", detail: "Ta sauvegarde est prête sur cet appareil.", tone: "success" });
    } catch {
      showToast({ title: "Fichier non reconnu", detail: "Choisis une sauvegarde JSON créée par CR3@TIX Learn Linux.", tone: "info" });
    }
    event.target.value = "";
  };

  const resetProgress = () => {
    if (!window.confirm("Réinitialiser toute ta progression locale ? Cette action est irréversible sans sauvegarde exportée.")) return;
    const fresh = defaultProgress();
    setProgress(fresh);
    setActiveLessonId(fresh.currentLessonId);
    setSimState(createInitialState());
    setView("home");
    void replaceLocalProgress(fresh);
  };

  const navView = view === "lesson" || view === "exam" ? "course" : view === "practice-session" ? "practice" : view === "lab-session" ? "labs" : view;
  const page = useMemo(() => {
    if (view === "home") return <HomeView progress={progress} onContinue={() => { const next = findNextLesson(progress); if (next) openLesson(next); }} onOpenTerminal={() => setView("terminal")} onOpenPractice={() => setView("practice")} onOpenLabs={() => setView("labs")} />;
    if (view === "course") return <CourseView progress={progress} onLesson={openLesson} onExam={(level) => { setActiveExamLevel(level.id); setView("exam"); window.scrollTo(0, 0); }} />;
    if (view === "lesson" && activeLesson && activeModule) return <LessonView key={`${activeLesson.id}-${simResetKey}`} lesson={activeLesson} courseModule={activeModule} progress={progress} simState={simState} onSimState={setSimState} onExecute={(command, result) => recordCommand(command, result, true)} onHint={() => updateProgress((current) => ({ ...current, hintsByLesson: { ...current.hintsByLesson, [activeLesson.id]: Math.min(3, (current.hintsByLesson[activeLesson.id] ?? 0) + 1) } }))} onBack={() => setView("course")} onNext={openNextLesson} />;
    if (view === "terminal") return <FreeTerminalView key={simResetKey} state={simState} onState={setSimState} onExecute={(command, result) => recordCommand(command, result, false)} onReset={() => { setSimState(createInitialState()); setSimResetKey((value) => value + 1); setSimModuleId(""); showToast({ title: "Laboratoire réinitialisé", detail: "Le système virtuel est revenu à son état initial.", tone: "success" }); }} />;
    if (view === "library") return <LibraryView progress={progress} onToggleFavorite={(name) => updateProgress((current) => ({ ...current, favoriteCommands: current.favoriteCommands.includes(name) ? current.favoriteCommands.filter((item) => item !== name) : [...current.favoriteCommands, name] }))} />;
    if (view === "profile") return <ProfileView progress={progress} onImport={importProgress} onReset={resetProgress} />;
    if (view === "practice") return <PracticeCenter progress={progress} onStart={openPractice} onCourse={() => setView("course")} />;
    if (view === "practice-session" && activePractice) return <PracticeSession exercise={activePractice} state={practiceState} hintsUsed={practiceHints} passed={practicePassed} onState={setPracticeState} onExecute={recordPracticeCommand} onHint={() => setPracticeHints((value) => Math.min(activePractice.hints.length, value + 1))} onBack={() => setView("practice")} onReset={() => { setPracticeState(createInitialState()); setPracticeHints(0); setPracticePassed(false); practiceStartedAt.current = Date.now(); }} />;
    if (view === "labs") return <LabCenter progress={progress} onStart={openLab} />;
    if (view === "lab-session" && activeLab) return <LabSession scenario={activeLab} state={labState} hintsUsed={labHints} attempts={labAttempts} passed={labPassed} onState={setLabState} onExecute={recordLabCommand} onHint={() => setLabHints((value) => Math.min(3, value + 1))} onBack={() => setView("labs")} onReset={() => { setLabState(createScenarioState(activeLab.setupCommands)); setLabHints(0); setLabAttempts(0); setLabPassed(false); }} />;
    if (view === "exam") return <ExamViewV2 key={`exam-${activeExam.id}`} level={activeExam} progress={progress} onComplete={completeExam} onBack={() => setView("course")} />;
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, progress, activeLessonId, activeExamLevel, simState, simResetKey, activePractice, practiceState, practiceHints, practicePassed, activeLab, labState, labHints, labAttempts, labPassed]);

  if (!hydrated) return <div className="app-loading"><div className="brand-mark"><span>&gt;_</span></div><p>Initialisation du laboratoire…</p></div>;
  if (!progress.onboardingComplete) return <Onboarding onStart={(displayName) => setProgress(refreshAchievements(touchToday({ ...defaultProgress(), displayName, onboardingComplete: true })))} />;

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand-lockup" onClick={() => setView("home")} aria-label="Accueil CR3@TIX Learn Linux"><div className="brand-mark"><span>&gt;_</span></div><div><strong>CR3@TIX <i className="version-badge">V2</i></strong><span>LEARN LINUX</span></div></button>
        <nav aria-label="Navigation principale">{NAV_ITEMS.map((item) => <button key={item.id} className={navView === item.id ? "active" : ""} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === "course" && <small>{coursePercent(progress)}%</small>}</button>)}</nav>
        <div className="side-progress"><div><span>PROGRESSION</span><b>{coursePercent(progress)}%</b></div><div className="mini-progress"><i style={{ width: `${coursePercent(progress)}%` }} /></div><p>{progress.completedLessons.length}/{ALL_LESSONS.length} leçons</p></div>
        <button className="side-profile" onClick={() => setView("profile")}><span>{(progress.displayName || "L").slice(0, 2).toUpperCase()}</span><div><strong>{progress.displayName}</strong><small>{rank.name}</small></div><i>›</i></button>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView("home")}><span>&gt;_</span><strong>CR3@TIX</strong></button>
          <div className={`connection-state ${online ? "online" : "offline"}`}><i />{online ? "EN LIGNE" : "HORS LIGNE"}</div>
          <div className="topbar-actions">
            {updateRegistration && <button className="install-button update-button" onClick={() => updateRegistration.waiting?.postMessage({ type: "SKIP_WAITING" })}>↻ Mettre à jour</button>}
            {installPrompt && <button className="install-button" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}>＋ Installer</button>}
            <span className="xp-total">⚡ {progress.xp.toLocaleString("fr-FR")} XP</span>
            <button className="theme-button mobile-only-action" onClick={() => setView("library")} aria-label="Ouvrir le mémo">⌕</button>
            <button className="profile-shortcut" onClick={() => setView("profile")} aria-label="Ouvrir le profil">{(progress.displayName || "L").slice(0, 2).toUpperCase()}</button>
            <button className="theme-button" onClick={switchTheme} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}>{theme === "dark" ? "☼" : "◐"}</button>
          </div>
        </header>
        <main className="main-content">{page}</main>
      </div>

      <nav className="bottom-nav" aria-label="Navigation mobile">{MOBILE_NAV_ITEMS.map((item) => <button key={item.id} className={navView === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
      {toast && <div className={`app-toast ${toast.tone ?? "info"}`} role="status"><span>{toast.tone === "success" ? "✓" : "i"}</span><div><strong>{toast.title}</strong><p>{toast.detail}</p></div><button onClick={() => setToast(null)} aria-label="Fermer">×</button></div>}
    </div>
  );
}
