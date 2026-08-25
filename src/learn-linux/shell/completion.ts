import { resolvePath, SHELL_COMMANDS, type SimState } from "../sim-shell.ts";

export interface CompletionResult {
  input: string;
  suggestions: string[];
  completed: boolean;
}

function basename(path: string): string {
  return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
}

function commonPrefix(values: string[]): string {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function completeShellInput(state: SimState, input: string): CompletionResult {
  const tokenMatch = input.match(/(?:^|\s)([^\s]*)$/);
  const token = tokenMatch?.[1] ?? "";
  const tokenStart = input.length - token.length;
  const before = input.slice(0, tokenStart);
  const firstToken = !before.trim();

  let suggestions: string[];
  if (firstToken && !token.includes("/")) {
    suggestions = [...SHELL_COMMANDS, ...Object.keys(state.functions)]
      .filter((command) => command.startsWith(token))
      .sort();
  } else {
    const slash = token.lastIndexOf("/");
    const directoryToken = slash >= 0 ? token.slice(0, slash) || "/" : ".";
    const namePrefix = slash >= 0 ? token.slice(slash + 1) : token;
    const directory = resolvePath(state, directoryToken);
    const pathPrefix = directory === "/" ? "/" : `${directory}/`;
    const visible = Object.keys(state.fs)
      .filter((path) => path.startsWith(pathPrefix) && path !== directory)
      .filter((path) => !path.slice(pathPrefix.length).includes("/"))
      .map((path) => ({ path, name: basename(path) }))
      .filter(({ name }) => name.startsWith(namePrefix) && (namePrefix.startsWith(".") || !name.startsWith(".")))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    suggestions = visible.map(({ path, name }) => {
      const suffix = state.fs[path].type === "dir" ? "/" : "";
      if (slash < 0) return `${name}${suffix}`;
      const rawPrefix = token.slice(0, slash);
      return `${rawPrefix === "/" ? "" : rawPrefix}/${name}${suffix}`;
    });
  }

  if (!suggestions.length) return { input, suggestions: [], completed: false };
  if (suggestions.length === 1) {
    const separator = suggestions[0].endsWith("/") ? "" : " ";
    return { input: `${before}${suggestions[0]}${separator}`, suggestions, completed: true };
  }
  const prefix = commonPrefix(suggestions);
  return {
    input: prefix.length > token.length ? `${before}${prefix}` : input,
    suggestions,
    completed: prefix.length > token.length,
  };
}
