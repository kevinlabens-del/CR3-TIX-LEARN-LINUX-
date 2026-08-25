import { useEffect, useRef, useState } from "react";
import {
  executeCommandLine,
  formatPrompt,
  type ExecutionResult,
  type SimState,
  WELCOME_LINES,
} from "./sim-shell";
import { completeShellInput } from "./shell/completion";

interface TerminalLine {
  id: number;
  prompt?: string;
  command?: string;
  output: string;
  error?: boolean;
}

interface TerminalPanelProps {
  state: SimState;
  onStateChange: (state: SimState) => void;
  onExecute?: (command: string, result: ExecutionResult) => void;
  compact?: boolean;
  quickCommands?: string[];
  title?: string;
}

export function TerminalPanel({
  state,
  onStateChange,
  onExecute,
  compact = false,
  quickCommands = ["pwd", "ls", "help ls", "clear"],
  title = "SimShell — bac à sable",
}: TerminalPanelProps) {
  const [input, setInput] = useState("");
  const [historyCursor, setHistoryCursor] = useState(-1);
  const [undoStack, setUndoStack] = useState<SimState[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>(() =>
    WELCOME_LINES.map((output, index) => ({ id: index, output, error: false })),
  );
  const terminalEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lineId = useRef(WELCOME_LINES.length);

  useEffect(() => {
    terminalEnd.current?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  const run = (raw: string) => {
    const command = raw.trim();
    if (!command) return;
    const prompt = formatPrompt(state);
    const result = executeCommandLine(state, command);
    setUndoStack((current) => [...current, state].slice(-20));
    if (result.clear) {
      setLines([]);
    } else {
      setLines((current) => [
        ...current,
        {
          id: lineId.current++,
          prompt,
          command,
          output: `${result.stdout}${result.stderr}`,
          error: result.exitCode !== 0,
        },
      ].slice(-120));
    }
    onStateChange(result.state);
    onExecute?.(command, result);
    setInput("");
    setHistoryCursor(-1);
  };

  const appendSystemLine = (output: string) => {
    setLines((current) => [...current, { id: lineId.current++, output }].slice(-120));
  };

  const completeInput = () => {
    const completion = completeShellInput(state, input);
    setInput(completion.input);
    if (completion.suggestions.length > 1 && !completion.completed) {
      appendSystemLine(completion.suggestions.join("  "));
    }
  };

  const cancelInput = () => {
    if (input) appendSystemLine(`^C  ${input}`);
    setInput("");
    setHistoryCursor(-1);
  };

  const undoLastCommand = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    onStateChange(previous);
    setUndoStack((current) => current.slice(0, -1));
    appendSystemLine("↶ État du laboratoire restauré avant la dernière commande.");
  };

  const navigateHistory = (direction: -1 | 1) => {
    if (!state.history.length) return;
    const next = direction === -1
      ? Math.min(state.history.length - 1, historyCursor + 1)
      : Math.max(-1, historyCursor - 1);
    setHistoryCursor(next);
    setInput(next < 0 ? "" : state.history[state.history.length - 1 - next]);
  };

  const insertKey = (value: string) => {
    const element = inputRef.current;
    if (!element) {
      setInput((current) => `${current}${value}`);
      return;
    }
    const start = element.selectionStart ?? input.length;
    const end = element.selectionEnd ?? start;
    const next = `${input.slice(0, start)}${value}${input.slice(end)}`;
    setInput(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + value.length, start + value.length);
    });
  };

  return (
    <section className={`terminal-shell ${compact ? "terminal-compact" : ""}`} aria-label="Terminal Linux simulé">
      <header className="terminal-header">
        <div className="terminal-lights" aria-hidden="true"><span /><span /><span /></div>
        <div className="terminal-title">
          <span className="status-dot" />
          {title}
        </div>
        <button
          className="terminal-clear"
          type="button"
          onClick={() => setLines([])}
          title="Effacer l'affichage du terminal"
        >
          Effacer
        </button>
      </header>

      <div className="terminal-screen" onClick={() => inputRef.current?.focus()}>
        <div className="terminal-output" role="log" aria-live="polite" aria-relevant="additions">
          {lines.map((line) => (
            <div className="terminal-entry" key={line.id}>
              {line.command && (
                <div className="terminal-command">
                  <span className="terminal-prompt">{line.prompt}</span> {line.command}
                </div>
              )}
              {line.output && <pre className={line.error ? "terminal-error" : ""}>{line.output}</pre>}
            </div>
          ))}
        </div>

        <form
          className="terminal-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            run(input);
          }}
        >
          <label className="sr-only" htmlFor="terminal-command-input">Saisis une commande Linux</label>
          <span className="terminal-prompt" aria-hidden="true">{formatPrompt(state)}</span>
          <input
            id="terminal-command-input"
            ref={inputRef}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                navigateHistory(-1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                navigateHistory(1);
              }
              if (event.key === "Tab") {
                event.preventDefault();
                completeInput();
              }
              if (event.key === "c" && event.ctrlKey) {
                event.preventDefault();
                cancelInput();
              }
              if (event.key === "r" && event.ctrlKey) {
                event.preventDefault();
                const found = [...state.history].reverse().find((command) => command.includes(input));
                if (found) setInput(found);
              }
              if (event.key === "l" && event.ctrlKey) {
                event.preventDefault();
                setLines([]);
              }
            }}
            placeholder="Tape ta commande…"
          />
          <button className="terminal-run" type="submit">Exécuter <span aria-hidden="true">↵</span></button>
        </form>
        <div ref={terminalEnd} />
      </div>

      {inspectorOpen && (
        <div className="terminal-inspector" aria-label="Arborescence du dossier courant">
          <strong>Arborescence · {state.cwd}</strong>
          <div>
            {Object.entries(state.fs)
              .filter(([path]) => path.startsWith(state.cwd === "/" ? "/" : `${state.cwd}/`) && path !== state.cwd)
              .filter(([path]) => !path.slice((state.cwd === "/" ? "/" : `${state.cwd}/`).length).includes("/"))
              .map(([path, node]) => <span key={path}>{node.type === "dir" ? "▸" : "·"} {path.slice(path.lastIndexOf("/") + 1)}{node.type === "dir" ? "/" : ""}</span>)}
          </div>
        </div>
      )}

      <footer className="terminal-toolbar" aria-label="Raccourcis du terminal">
        <div className="terminal-keys">
          {[
            ["Tab", "autocomplete"],
            ["^C", "cancel"],
            ["/", "/"],
            ["~", "~"],
            ["|", " | "],
            ["&&", " && "],
            ["-", "-"],
            ["↑", "history-up"],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => value === "history-up" ? navigateHistory(-1) : value === "autocomplete" ? completeInput() : value === "cancel" ? cancelInput() : value && insertKey(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="quick-commands" aria-label="Commandes rapides">
          <button type="button" disabled={!undoStack.length} onClick={undoLastCommand}>↶ Annuler</button>
          <button type="button" onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? "Fermer arbre" : "Arbre"}</button>
          {quickCommands.map((command) => (
            <button type="button" key={command} onClick={() => run(command)}>{command}</button>
          ))}
        </div>
      </footer>
    </section>
  );
}
