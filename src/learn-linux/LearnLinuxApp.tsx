"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ALL_LESSONS, ALL_MODULES, COMMAND_DOCS, COURSE_LEVELS, GLOSSARY, totalCourseXp } from "./content";
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
  loadProgress,
  nextRankForXp,
  rankForXp,
  refreshAchievements,
  sanitizeProgress,
  saveProgress,
  THEME_STORAGE_KEY,
  touchToday,
  type LearnerProgress,
} from "./progress";
import { createInitialState, evaluateCheck, type ExecutionResult, type SimState } from "./sim-shell";
import { TerminalPanel } from "./TerminalPanel";
import type { CourseLevel, CourseModule, Lesson } from "./types";

type MainView = "home" | "course" | "lesson" | "terminal" | "library" | "profile" | "exam";
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
  { id: "terminal", label: "Terminal", icon: ">_" },
  { id: "library", label: "Mémo", icon: "⌕" },
  { id: "profile", label: "Profil", icon: "◎" },
];

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
          <div><strong>CR3@TIX</strong><span>LEARN LINUX</span></div>
        </div>
        <p className="onboarding-kicker"><span /> Bienvenue dans ton laboratoire</p>
        <h1>Apprends Linux.<br /><em>Commande après commande.</em></h1>
        <p className="onboarding-copy">Aucune connaissance requise. Tu vas comprendre, pratiquer et progresser dans un terminal entièrement sécurisé.</p>
        <div className="onboarding-benefits">
          <span><b>01</b> Parcours adaptatif</span>
          <span><b>02</b> Terminal sans danger</span>
          <span><b>03</b> {"5 niveaux jusqu'au pro"}</span>
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
        <small>Progression enregistrée sur cet appareil · Aucun compte requis</small>
      </section>
    </div>
  );
}

function HomeView({
  progress,
  onContinue,
  onOpenCourse,
  onOpenTerminal,
}: {
  progress: LearnerProgress;
  onContinue: () => void;
  onOpenCourse: () => void;
  onOpenTerminal: () => void;
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
        <article className="stat-card"><span className="stat-icon">⚡</span><div><strong>{progress.xp.toLocaleString("fr-FR")}</strong><span>XP total</span></div><small>sur {totalCourseXp.toLocaleString("fr-FR")}</small></article>
        <article className="stat-card"><span className="stat-icon">◫</span><div><strong>{progress.completedLessons.length}</strong><span>leçons finies</span></div><small>sur {ALL_LESSONS.length}</small></article>
        <article className="stat-card"><span className="stat-icon">◇</span><div><strong>{progress.passedExams.length}/5</strong><span>niveaux validés</span></div><small>{rankForXp(progress.xp).short}</small></article>
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
          <button className="button button-ghost button-wide" onClick={onOpenCourse}>Voir tout le parcours</button>
        </section>
      </div>

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
                <div><strong>Examen du niveau {level.id}</strong><span>{passed ? "Réussi · niveau suivant débloqué" : complete ? "5 questions · score requis 80 %" : "Termine tous les modules pour le débloquer"}</span></div>
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
  const streak = currentStreak(progress.activeDays);
  const skills = Object.entries(progress.skillMastery).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const graduated = progress.achievements.includes("graduate");

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "creatix-linux-progression.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view-stack">
      <SectionHeading eyebrow="PROFIL APPRENANT" title={progress.displayName || "Learner"} description="Ta progression reste privée et sauvegardée localement sur cet appareil." />
      <section className="profile-hero panel">
        <div className="profile-avatar">{(progress.displayName || "L").slice(0, 2).toUpperCase()}</div>
        <div className="profile-rank"><span>RANG ACTUEL</span><h2>{currentRank.name}</h2><p>{progress.xp.toLocaleString("fr-FR")} XP {nextRank ? `· encore ${nextRank.min - progress.xp} pour ${nextRank.name}` : "· rang maximal"}</p><div className="mini-progress"><i style={{ width: `${nextRank ? ((progress.xp - currentRank.min) / (nextRank.min - currentRank.min)) * 100 : 100}%` }} /></div></div>
        <div className="profile-score"><strong>{coursePercent(progress)}%</strong><span>du parcours</span></div>
      </section>
      <section className="profile-stats stat-grid"><article className="stat-card"><span className="stat-icon">◫</span><div><strong>{progress.completedLessons.length}</strong><span>leçons</span></div></article><article className="stat-card"><span className="stat-icon">⌁</span><div><strong>{progress.commandHistory.length}</strong><span>commandes</span></div></article><article className="stat-card"><span className="stat-icon">↗</span><div><strong>{streak}</strong><span>jours de série</span></div></article><article className="stat-card"><span className="stat-icon">◷</span><div><strong>{formatDuration(progress.totalSeconds)}</strong><span>de pratique</span></div></article></section>

      <div className="profile-grid">
        <section className="panel mastery-panel"><div className="panel-head"><div><p className="eyebrow">MAÎTRISE</p><h2>Compétences suivies</h2></div></div>{skills.length ? <div className="skill-list">{skills.map(([skill, value]) => <div className="skill-row" key={skill}><span>{skill}</span><div><i style={{ width: `${value}%` }} /></div><b>{Math.round(value)}%</b></div>)}</div> : <div className="empty-state compact"><p>Les données apparaîtront après tes premiers exercices.</p></div>}</section>
        <section className="panel badge-panel"><div className="panel-head"><div><p className="eyebrow">SUCCÈS</p><h2>{progress.achievements.length}/{ACHIEVEMENTS.length} badges</h2></div></div><div className="badge-grid">{ACHIEVEMENTS.map((badge) => { const unlocked = progress.achievements.includes(badge.id); return <article className={unlocked ? "unlocked" : ""} key={badge.id}><span>{unlocked ? badge.icon : "?"}</span><div><strong>{badge.title}</strong><small>{badge.description}</small></div></article>; })}</div></section>
      </div>

      <section className="panel history-panel"><div className="panel-head"><div><p className="eyebrow">HISTORIQUE RÉCENT</p><h2>Commandes exécutées</h2></div><span>{progress.commandHistory.length} au total</span></div>{progress.commandHistory.length ? <div className="history-list">{progress.commandHistory.slice(-12).reverse().map((item, index) => <div key={`${item.at}-${index}`}><code>$ {item.command}</code><span className={item.exitCode === 0 ? "history-ok" : "history-error"}>{item.exitCode === 0 ? "OK" : `CODE ${item.exitCode}`}</span><time>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.at))}</time></div>)}</div> : <div className="empty-state compact"><p>Aucune commande exécutée pour le moment.</p></div>}</section>

      {graduated && <section className="certificate panel"><div className="certificate-mark">CR3@TIX</div><p>CERTIFICAT DE PARCOURS</p><h2>Linux Pro</h2><span>attribué à</span><h3>{progress.displayName}</h3><p>pour avoir terminé les 5 niveaux, les laboratoires et les examens du parcours CR3@TIX Learn Linux.</p><button className="button button-primary no-print" onClick={() => window.print()}>Imprimer le certificat</button></section>}

      <section className="data-panel panel"><div><p className="eyebrow">DONNÉES & HORS LIGNE</p><h2>Garder le contrôle</h2><p>Exporte une sauvegarde, puis importe-la sur un autre appareil.</p></div><div className="data-actions"><button className="button button-ghost" onClick={exportProgress}>↓ Exporter</button><label className="button button-ghost">↑ Importer<input type="file" accept="application/json" onChange={onImport} hidden /></label><button className="button button-danger" onClick={onReset}>Réinitialiser</button></div></section>
    </div>
  );
}

function ExamView({ level, progress, onComplete, onBack }: { level: CourseLevel; progress: LearnerProgress; onComplete: (score: number) => void; onBack: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<number | null>(null);
  const score = level.exam.filter((question, index) => answers[index] === question.answer).length;
  const passing = Math.ceil(level.exam.length * 0.8);
  const submit = () => {
    setResult(score);
    if (score >= passing) onComplete(score);
  };
  return (
    <div className="exam-view view-stack">
      <button className="back-button" onClick={onBack}>← <span>Retour au parcours</span></button>
      <header className="exam-hero"><span>EXAMEN · NIVEAU {level.id}</span><h1>{level.title}</h1><p>Réponds à {level.exam.length} questions. Il faut au moins {passing}/{level.exam.length} pour valider le niveau.</p><div><b>+150 XP</b><i />Une seule réponse par question</div></header>
      <form className="question-list" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {level.exam.map((question, questionIndex) => (
          <fieldset className="question-card panel" key={question.question}>
            <legend><span>{String(questionIndex + 1).padStart(2, "0")}</span>{question.question}</legend>
            <div className="choice-list">{question.choices.map((choice, choiceIndex) => { const selected = answers[questionIndex] === choiceIndex; const reveal = result !== null; const correct = choiceIndex === question.answer; return <label className={`${selected ? "selected" : ""} ${reveal && correct ? "correct" : ""} ${reveal && selected && !correct ? "wrong" : ""}`} key={choice}><input type="radio" name={`question-${questionIndex}`} checked={selected} disabled={reveal} onChange={() => setAnswers((current) => ({ ...current, [questionIndex]: choiceIndex }))} /><span>{String.fromCharCode(65 + choiceIndex)}</span><p>{choice}</p></label>; })}</div>
            {result !== null && <p className="answer-explanation">{question.explanation}</p>}
          </fieldset>
        ))}
        {result === null ? <button className="button button-primary exam-submit" disabled={Object.keys(answers).length < level.exam.length}>Valider mes réponses</button> : <div className={`exam-result ${result >= passing ? "exam-pass" : "exam-fail"}`}><span>{result >= passing ? "✓" : "↻"}</span><div><h2>{result >= passing ? "Niveau validé !" : "Pas encore, mais tu progresses."}</h2><p>Score : {result}/{level.exam.length}. {result >= passing ? "Le niveau suivant est débloqué." : "Relis les explications puis réessaie."}</p></div><button className="button button-primary" type="button" onClick={result >= passing ? onBack : () => { setResult(null); setAnswers({}); }}>{result >= passing ? "Continuer" : "Réessayer"}</button></div>}
      </form>
      {progress.passedExams.includes(level.id) && <p className="already-passed">{"✓ Cet examen a déjà été validé. Le repasser n'ajoute pas de nouvel XP."}</p>}
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
  const [theme, setTheme] = useState<Theme>("dark");
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeLesson = getLesson(activeLessonId) ?? ALL_LESSONS[0];
  const activeModule = activeLesson ? moduleForLesson(activeLesson.id) : undefined;
  const activeExam = COURSE_LEVELS.find((item) => item.id === activeExamLevel) ?? COURSE_LEVELS[0];
  const rank = rankForXp(progress.xp);

  /* La restauration locale doit s'effectuer après l'hydratation du rendu statique. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const loaded = refreshAchievements(touchToday(loadProgress()));
    setProgress(loaded);
    setActiveLessonId(loaded.currentLessonId || ALL_LESSONS[0]?.id || "");
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    const resolved = storedTheme ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    setOnline(navigator.onLine);
    setHydrated(true);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    saveProgress(progress);
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
      next = { ...next, attemptsByLesson: { ...current.attemptsByLesson, [lessonId]: attempts }, skillMastery: mastery };
      if (passed && !current.completedLessons.includes(lessonId)) {
        const award = lessonAward(activeLesson.exercise.xp, current.hintsByLesson[lessonId] ?? 0);
        const completedLessons = [...current.completedLessons, lessonId];
        const provisional = { ...next, completedLessons, xp: current.xp + award };
        const following = findNextLesson(provisional);
        next = { ...provisional, currentLessonId: following?.id ?? lessonId };
        queueMicrotask(() => showToast({ title: `+${award} XP · Leçon terminée`, detail: activeLesson.exercise.success, tone: "success" }));
      } else if (!passed && result.exitCode !== 0) {
        queueMicrotask(() => showToast({ title: "Pas encore", detail: "Lis le message du terminal : il indique souvent précisément ce qu'il faut corriger.", tone: "info" }));
      }
      return next;
    });
  };

  const completeExam = (score: number) => {
    const alreadyPassed = progress.passedExams.includes(activeExam.id);
    if (score < Math.ceil(activeExam.exam.length * 0.8) || alreadyPassed) return;
    updateProgress((current) => ({ ...current, passedExams: [...current.passedExams, activeExam.id], xp: current.xp + 150 }));
    showToast({ title: "+150 XP · Niveau validé", detail: `${activeExam.rank} débloqué.`, tone: "success" });
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
  };

  const navView = view === "lesson" || view === "exam" ? "course" : view;
  const page = useMemo(() => {
    if (view === "home") return <HomeView progress={progress} onContinue={() => { const next = findNextLesson(progress); if (next) openLesson(next); }} onOpenCourse={() => setView("course")} onOpenTerminal={() => setView("terminal")} />;
    if (view === "course") return <CourseView progress={progress} onLesson={openLesson} onExam={(level) => { setActiveExamLevel(level.id); setView("exam"); window.scrollTo(0, 0); }} />;
    if (view === "lesson" && activeLesson && activeModule) return <LessonView key={`${activeLesson.id}-${simResetKey}`} lesson={activeLesson} courseModule={activeModule} progress={progress} simState={simState} onSimState={setSimState} onExecute={(command, result) => recordCommand(command, result, true)} onHint={() => updateProgress((current) => ({ ...current, hintsByLesson: { ...current.hintsByLesson, [activeLesson.id]: Math.min(3, (current.hintsByLesson[activeLesson.id] ?? 0) + 1) } }))} onBack={() => setView("course")} onNext={openNextLesson} />;
    if (view === "terminal") return <FreeTerminalView key={simResetKey} state={simState} onState={setSimState} onExecute={(command, result) => recordCommand(command, result, false)} onReset={() => { setSimState(createInitialState()); setSimResetKey((value) => value + 1); setSimModuleId(""); showToast({ title: "Laboratoire réinitialisé", detail: "Le système virtuel est revenu à son état initial.", tone: "success" }); }} />;
    if (view === "library") return <LibraryView progress={progress} onToggleFavorite={(name) => updateProgress((current) => ({ ...current, favoriteCommands: current.favoriteCommands.includes(name) ? current.favoriteCommands.filter((item) => item !== name) : [...current.favoriteCommands, name] }))} />;
    if (view === "profile") return <ProfileView progress={progress} onImport={importProgress} onReset={resetProgress} />;
    if (view === "exam") return <ExamView level={activeExam} progress={progress} onComplete={completeExam} onBack={() => setView("course")} />;
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, progress, activeLessonId, activeExamLevel, simState, simResetKey]);

  if (!hydrated) return <div className="app-loading"><div className="brand-mark"><span>&gt;_</span></div><p>Initialisation du laboratoire…</p></div>;
  if (!progress.onboardingComplete) return <Onboarding onStart={(displayName) => setProgress(refreshAchievements(touchToday({ ...defaultProgress(), displayName, onboardingComplete: true })))} />;

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand-lockup" onClick={() => setView("home")} aria-label="Accueil CR3@TIX Learn Linux"><div className="brand-mark"><span>&gt;_</span></div><div><strong>CR3@TIX</strong><span>LEARN LINUX</span></div></button>
        <nav aria-label="Navigation principale">{NAV_ITEMS.map((item) => <button key={item.id} className={navView === item.id ? "active" : ""} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === "course" && <small>{coursePercent(progress)}%</small>}</button>)}</nav>
        <div className="side-progress"><div><span>PROGRESSION</span><b>{coursePercent(progress)}%</b></div><div className="mini-progress"><i style={{ width: `${coursePercent(progress)}%` }} /></div><p>{progress.completedLessons.length}/{ALL_LESSONS.length} leçons</p></div>
        <button className="side-profile" onClick={() => setView("profile")}><span>{(progress.displayName || "L").slice(0, 2).toUpperCase()}</span><div><strong>{progress.displayName}</strong><small>{rank.name}</small></div><i>›</i></button>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView("home")}><span>&gt;_</span><strong>CR3@TIX</strong></button>
          <div className={`connection-state ${online ? "online" : "offline"}`}><i />{online ? "EN LIGNE" : "HORS LIGNE"}</div>
          <div className="topbar-actions">
            {installPrompt && <button className="install-button" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}>＋ Installer</button>}
            <span className="xp-total">⚡ {progress.xp.toLocaleString("fr-FR")} XP</span>
            <button className="theme-button" onClick={switchTheme} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}>{theme === "dark" ? "☼" : "◐"}</button>
          </div>
        </header>
        <main className="main-content">{page}</main>
      </div>

      <nav className="bottom-nav" aria-label="Navigation mobile">{NAV_ITEMS.map((item) => <button key={item.id} className={navView === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
      {toast && <div className={`app-toast ${toast.tone ?? "info"}`} role="status"><span>{toast.tone === "success" ? "✓" : "i"}</span><div><strong>{toast.title}</strong><p>{toast.detail}</p></div><button onClick={() => setToast(null)} aria-label="Fermer">×</button></div>}
    </div>
  );
}
