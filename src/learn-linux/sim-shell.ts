import type { Check } from "./types";
import { splitControlClauses, tokenizeShell } from "./shell/syntax.ts";

export interface FileNode {
  type: "file" | "dir";
  content: string;
  mode: string;
  owner: string;
  updatedAt: number;
}

export type ContainerStatus = "running" | "stopped" | "unhealthy";

export interface SimState {
  cwd: string;
  fs: Record<string, FileNode>;
  env: Record<string, string>;
  history: string[];
  lastExitCode: number;
  lastCommand: string;
  lastOutput: string;
  installedPackages: string[];
  killedPids: number[];
  services: Record<string, "active" | "inactive">;
  sshHosts: string[];
  containers: Record<string, ContainerStatus>;
  aptUpdated: boolean;
  commandCount: number;
  functions: Record<string, string>;
}

export interface ExecutionResult {
  state: SimState;
  stdout: string;
  stderr: string;
  exitCode: number;
  clear?: boolean;
}

interface CommandResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  clear?: boolean;
}

export const SHELL_COMMANDS = [
  "apt", "apt-get", "bash", "cat", "cd", "chmod", "clear", "cp", "crontab", "curl",
  "cut", "date", "df", "dig", "docker", "du", "echo", "env", "export", "file", "find",
  "git", "grep", "groups", "head", "help", "history", "hostname", "id", "ip", "journalctl",
  "kill", "less", "ls", "man", "mkdir", "mv", "ping", "ps", "pwd", "rm", "rmdir", "scp",
  "sha256sum", "sort", "ss", "ssh", "stat", "sudo", "systemctl", "tail", "tar", "touch",
  "tr", "ufw", "uname", "uniq", "wc", "whoami",
] as const;

const now = Date.now();

const dir = (mode = "755"): FileNode => ({ type: "dir", content: "", mode, owner: "learner", updatedAt: now });
const file = (content = "", mode = "644"): FileNode => ({ type: "file", content, mode, owner: "learner", updatedAt: now });

export function createInitialState(): SimState {
  return {
    cwd: "/home/learner",
    fs: {
      "/": dir(),
      "/home": dir(),
      "/home/learner": dir(),
      "/home/learner/Documents": dir(),
      "/home/learner/Documents/guide.txt": file("Bienvenue dans ton dossier Documents.\nChaque commande te rapproche du niveau pro.\n"),
      "/home/learner/Projets": dir(),
      "/home/learner/Projets/creatix": dir(),
      "/home/learner/Projets/creatix/app.txt": file("CR3@TIX Learn Linux\nVersion pédagogique locale\n"),
      "/home/learner/logs": dir(),
      "/home/learner/logs/app.log": file(
        "2026-08-25 08:00:01 INFO démarrage\n2026-08-25 08:00:03 ERROR connexion base refusée\n2026-08-25 08:00:04 INFO nouvelle tentative\n2026-08-25 08:00:06 ERROR configuration invalide\n",
      ),
      "/home/learner/scripts": dir(),
      "/home/learner/scripts/backup.sh": file("#!/usr/bin/env bash\nmkdir -p backups\ntar -czf backups/projets.tar.gz Projets\n", "755"),
      "/home/learner/scripts/healthcheck.sh": file("#!/usr/bin/env bash\nsystemctl status webapp\ndocker ps\n", "755"),
      "/home/learner/.ssh": dir("700"),
      "/home/learner/.ssh/id_ed25519": file("-----BEGIN OPENSSH PRIVATE KEY-----\nLABORATOIRE-SANS-SECRET\n-----END OPENSSH PRIVATE KEY-----\n", "644"),
      "/home/learner/notes.txt": file("Une commande Linux suit souvent la forme : commande options arguments.\nToujours observer avant de modifier.\n"),
      "/home/learner/journal.txt": file("Linux en pratique\n"),
      "/home/learner/secrets.txt": file("mot-de-passe-fictif=jamais-un-vrai-secret\n", "644"),
      "/home/learner/temp.txt": file("fichier temporaire\n"),
      "/home/learner/users.txt": file("alice\nbob\nalice\ncharlie\nbob\n"),
      "/etc": dir(),
      "/etc/hostname": file("creatix-lab\n"),
      "/tmp": dir("777"),
      "/var": dir(),
      "/var/log": dir(),
    },
    env: {
      HOME: "/home/learner",
      USER: "learner",
      SHELL: "/bin/bash",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      LANG: "fr_FR.UTF-8",
      PROJECT: "CR3ATIX",
    },
    history: [],
    lastExitCode: 0,
    lastCommand: "",
    lastOutput: "",
    installedPackages: ["bash", "coreutils", "grep", "findutils"],
    killedPids: [],
    services: { webapp: "inactive", ssh: "active", cron: "active" },
    sshHosts: [],
    containers: { api: "unhealthy", database: "running" },
    aptUpdated: false,
    commandCount: 0,
    functions: {},
  };
}

function cloneState(source: SimState): SimState {
  return {
    ...source,
    fs: { ...source.fs },
    env: { ...source.env },
    history: [...source.history],
    installedPackages: [...source.installedPackages],
    killedPids: [...source.killedPids],
    services: { ...source.services },
    sshHosts: [...source.sshHosts],
    containers: { ...source.containers },
    functions: { ...source.functions },
  };
}

function cleanPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}` || "/";
}

export function resolvePath(state: SimState, input = "."): string {
  let value = input || ".";
  if (value === "~") value = state.env.HOME;
  else if (value.startsWith("~/")) value = `${state.env.HOME}/${value.slice(2)}`;
  return cleanPath(value.startsWith("/") ? value : `${state.cwd}/${value}`);
}

function parentPath(path: string): string {
  if (path === "/") return "/";
  const parent = path.slice(0, path.lastIndexOf("/"));
  return parent || "/";
}

function baseName(path: string): string {
  return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
}

function directChildren(state: SimState, path: string): string[] {
  const prefix = path === "/" ? "/" : `${path}/`;
  return Object.keys(state.fs)
    .filter((candidate) => candidate.startsWith(prefix) && candidate !== path)
    .filter((candidate) => !candidate.slice(prefix.length).includes("/"))
    .sort((a, b) => baseName(a).localeCompare(baseName(b), "fr"));
}

function symbolicMode(node: FileNode): string {
  const triplet = (digit: string) => {
    const n = Number(digit);
    return `${n & 4 ? "r" : "-"}${n & 2 ? "w" : "-"}${n & 1 ? "x" : "-"}`;
  };
  const mode = node.mode.padStart(3, "0").slice(-3);
  return `${node.type === "dir" ? "d" : "-"}${mode.split("").map(triplet).join("")}`;
}

function expandToken(state: SimState, token: string): string {
  return token.replace(/\$\{([^}]+)\}|\$(\?|[A-Za-z_][A-Za-z0-9_]*)/g, (_, braced: string | undefined, plain: string | undefined) => {
    const name = braced ?? plain ?? "";
    return name === "?" ? String(state.lastExitCode) : (state.env[name] ?? "");
  });
}

function readInput(state: SimState, args: string[], stdin: string): { content?: string; error?: string } {
  if (!args.length) return { content: stdin };
  const chunks: string[] = [];
  for (const arg of args) {
    const path = resolvePath(state, arg);
    const node = state.fs[path];
    if (!node) return { error: `${arg}: fichier ou dossier introuvable` };
    if (node.type === "dir") return { error: `${arg}: est un dossier` };
    chunks.push(node.content);
  }
  return { content: chunks.join("") };
}

function writeFile(state: SimState, rawPath: string, content: string, append = false): string | null {
  const path = resolvePath(state, rawPath);
  const parent = state.fs[parentPath(path)];
  if (!parent || parent.type !== "dir") return `${rawPath}: dossier parent introuvable`;
  const existing = state.fs[path];
  if (existing?.type === "dir") return `${rawPath}: est un dossier`;
  state.fs[path] = file(append && existing ? `${existing.content}${content}` : content, existing?.mode ?? "644");
  return null;
}

function removePath(state: SimState, path: string): void {
  const prefix = `${path}/`;
  for (const candidate of Object.keys(state.fs)) {
    if (candidate === path || candidate.startsWith(prefix)) delete state.fs[candidate];
  }
}

function copyPath(state: SimState, source: string, destination: string): void {
  const sourceNode = state.fs[source];
  if (!sourceNode) return;
  state.fs[destination] = { ...sourceNode, updatedAt: Date.now() };
  if (sourceNode.type === "dir") {
    for (const candidate of Object.keys(state.fs)) {
      if (candidate.startsWith(`${source}/`)) {
        const suffix = candidate.slice(source.length);
        state.fs[`${destination}${suffix}`] = { ...state.fs[candidate], updatedAt: Date.now() };
      }
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function expandGlobArgument(state: SimState, raw: string): string[] {
  const value = expandToken(state, raw);
  if (!/[?*]/.test(value)) return [value];
  const slash = value.lastIndexOf("/");
  const directoryPart = slash >= 0 ? value.slice(0, slash) || "/" : ".";
  const namePattern = slash >= 0 ? value.slice(slash + 1) : value;
  const directory = resolvePath(state, directoryPart);
  if (state.fs[directory]?.type !== "dir") return [value];
  const matcher = globToRegExp(namePattern);
  const matches = directChildren(state, directory)
    .map((path) => baseName(path))
    .filter((name) => (namePattern.startsWith(".") || !name.startsWith(".")) && matcher.test(name));
  if (!matches.length) return [value];
  if (slash < 0) return matches;
  const prefix = value.slice(0, slash);
  return matches.map((name) => prefix === "/" ? `/${name}` : `${prefix}/${name}`);
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const seed = (hash >>> 0).toString(16).padStart(8, "0");
  return `${seed}${seed.split("").reverse().join("")}${seed}${seed.split("").reverse().join("")}`;
}

function runSimpleCommand(state: SimState, command: string, rawArgs: string[], stdin: string): CommandResult {
  const args = rawArgs.flatMap((arg) => expandGlobArgument(state, arg));

  const assignment = command.match(/^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/);
  if (assignment && rawArgs.length === 0) {
    state.env[assignment[1]] = expandToken(state, assignment[2]);
    return {};
  }

  if (state.functions[command]) return executeScriptInState(state, state.functions[command]);

  switch (command) {
    case "true":
      return {};
    case "false":
      return { exitCode: 1 };
    case "pwd":
      return { stdout: `${state.cwd}\n` };
    case "whoami":
      return { stdout: `${state.env.USER}\n` };
    case "uname":
      return { stdout: args.includes("-a") ? "Linux creatix-lab 6.8.0-cr3atix #1 SMP aarch64 GNU/Linux\n" : "Linux\n" };
    case "hostname":
      return { stdout: "creatix-lab\n" };
    case "date":
      return { stdout: `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "medium" }).format(new Date())}\n` };
    case "echo":
      return { stdout: `${args.join(" ")}\n` };
    case "clear":
      return { stdout: "", clear: true };
    case "cd": {
      const path = resolvePath(state, args[0] ?? state.env.HOME);
      const node = state.fs[path];
      if (!node) return { stderr: `cd: ${args[0] ?? ""}: dossier introuvable\n`, exitCode: 1 };
      if (node.type !== "dir") return { stderr: `cd: ${args[0]}: n'est pas un dossier\n`, exitCode: 1 };
      state.cwd = path;
      return {};
    }
    case "ls": {
      const showAll = args.some((arg) => arg.startsWith("-") && arg.includes("a"));
      const long = args.some((arg) => arg.startsWith("-") && arg.includes("l"));
      const targets = args.filter((arg) => !arg.startsWith("-"));
      const path = resolvePath(state, targets[0] ?? ".");
      const node = state.fs[path];
      if (!node) return { stderr: `ls: ${targets[0] ?? path}: introuvable\n`, exitCode: 2 };
      const items = node.type === "dir" ? directChildren(state, path) : [path];
      const visible = items.filter((item) => showAll || !baseName(item).startsWith("."));
      if (long) {
        const lines = visible.map((item) => {
          const child = state.fs[item];
          const size = child.type === "dir" ? 4096 : new TextEncoder().encode(child.content).length;
          return `${symbolicMode(child)} 1 ${child.owner} ${child.owner} ${String(size).padStart(5, " ")} ${baseName(item)}${child.type === "dir" ? "/" : ""}`;
        });
        return { stdout: `${lines.join("\n")}${lines.length ? "\n" : ""}` };
      }
      return { stdout: `${visible.map((item) => `${baseName(item)}${state.fs[item].type === "dir" ? "/" : ""}`).join("  ")}${visible.length ? "\n" : ""}` };
    }
    case "mkdir": {
      const recursive = args.includes("-p");
      const targets = args.filter((arg) => !arg.startsWith("-"));
      if (!targets.length) return { stderr: "mkdir: opérande manquant\n", exitCode: 1 };
      for (const target of targets) {
        const path = resolvePath(state, target);
        if (state.fs[path]) return { stderr: `mkdir: ${target}: existe déjà\n`, exitCode: 1 };
        if (recursive) {
          const segments = path.split("/").filter(Boolean);
          let cursor = "";
          for (const segment of segments) {
            cursor += `/${segment}`;
            state.fs[cursor] ??= dir();
          }
        } else {
          const parent = state.fs[parentPath(path)];
          if (!parent || parent.type !== "dir") return { stderr: `mkdir: ${target}: dossier parent introuvable\n`, exitCode: 1 };
          state.fs[path] = dir();
        }
      }
      return {};
    }
    case "touch": {
      if (!args.length) return { stderr: "touch: opérande manquant\n", exitCode: 1 };
      for (const target of args) {
        const path = resolvePath(state, target);
        const parent = state.fs[parentPath(path)];
        if (!parent || parent.type !== "dir") return { stderr: `touch: ${target}: dossier parent introuvable\n`, exitCode: 1 };
        const existing = state.fs[path];
        if (existing?.type === "dir") return { stderr: `touch: ${target}: est un dossier\n`, exitCode: 1 };
        state.fs[path] = existing ? { ...existing, updatedAt: Date.now() } : file();
      }
      return {};
    }
    case "cat":
    case "less": {
      const read = readInput(state, args, stdin);
      return read.error ? { stderr: `${command}: ${read.error}\n`, exitCode: 1 } : { stdout: read.content };
    }
    case "head":
    case "tail": {
      let count = 10;
      const fileArgs: string[] = [];
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] === "-n" && args[index + 1]) {
          count = Number(args[index + 1]) || 10;
          index += 1;
        } else fileArgs.push(args[index]);
      }
      const read = readInput(state, fileArgs, stdin);
      if (read.error) return { stderr: `${command}: ${read.error}\n`, exitCode: 1 };
      const lines = (read.content ?? "").replace(/\n$/, "").split("\n");
      const selected = command === "head" ? lines.slice(0, count) : lines.slice(-count);
      return { stdout: `${selected.join("\n")}${selected.length ? "\n" : ""}` };
    }
    case "wc": {
      const flags = args.filter((arg) => arg.startsWith("-"));
      const files = args.filter((arg) => !arg.startsWith("-"));
      const read = readInput(state, files, stdin);
      if (read.error) return { stderr: `wc: ${read.error}\n`, exitCode: 1 };
      const content = read.content ?? "";
      const lines = content ? content.replace(/\n$/, "").split("\n").length : 0;
      const words = content.trim() ? content.trim().split(/\s+/).length : 0;
      const bytes = new TextEncoder().encode(content).length;
      if (flags.includes("-l")) return { stdout: `${lines}\n` };
      if (flags.includes("-w")) return { stdout: `${words}\n` };
      if (flags.includes("-c")) return { stdout: `${bytes}\n` };
      return { stdout: `${lines} ${words} ${bytes}${files[0] ? ` ${files[0]}` : ""}\n` };
    }
    case "cp":
    case "mv": {
      const recursive = args.includes("-r") || args.includes("-R");
      const operands = args.filter((arg) => !arg.startsWith("-"));
      if (operands.length < 2) return { stderr: `${command}: source et destination nécessaires\n`, exitCode: 1 };
      const source = resolvePath(state, operands[0]);
      let destination = resolvePath(state, operands[1]);
      const sourceNode = state.fs[source];
      if (!sourceNode) return { stderr: `${command}: ${operands[0]}: introuvable\n`, exitCode: 1 };
      if (sourceNode.type === "dir" && !recursive && command === "cp") return { stderr: "cp: utilisez -r pour copier un dossier\n", exitCode: 1 };
      if (state.fs[destination]?.type === "dir") destination = `${destination}/${baseName(source)}`;
      const parent = state.fs[parentPath(destination)];
      if (!parent || parent.type !== "dir") return { stderr: `${command}: destination invalide\n`, exitCode: 1 };
      copyPath(state, source, destination);
      if (command === "mv") removePath(state, source);
      return {};
    }
    case "rm": {
      const recursive = args.some((arg) => /^-[a-z]*r/i.test(arg));
      const targets = args.filter((arg) => !arg.startsWith("-"));
      if (!targets.length) return { stderr: "rm: opérande manquant\n", exitCode: 1 };
      for (const target of targets) {
        const path = resolvePath(state, target);
        const node = state.fs[path];
        if (!node) return { stderr: `rm: ${target}: introuvable\n`, exitCode: 1 };
        if (path === "/" || path === "/home" || path === "/home/learner") {
          return { stderr: "rm: protection pédagogique — cible système refusée. Le vrai appareil reste inaccessible.\n", exitCode: 1 };
        }
        if (node.type === "dir" && !recursive) return { stderr: `rm: ${target}: est un dossier, utilisez -r\n`, exitCode: 1 };
        removePath(state, path);
      }
      return {};
    }
    case "rmdir": {
      const path = resolvePath(state, args[0] ?? "");
      const node = state.fs[path];
      if (!node || node.type !== "dir") return { stderr: "rmdir: dossier introuvable\n", exitCode: 1 };
      if (directChildren(state, path).length) return { stderr: "rmdir: le dossier n'est pas vide\n", exitCode: 1 };
      delete state.fs[path];
      return {};
    }
    case "file": {
      const path = resolvePath(state, args[0] ?? "");
      const node = state.fs[path];
      if (!node) return { stderr: `file: ${args[0] ?? ""}: introuvable\n`, exitCode: 1 };
      return { stdout: `${args[0]}: ${node.type === "dir" ? "directory" : "UTF-8 Unicode text"}\n` };
    }
    case "chmod": {
      const [mode, target] = args;
      if (!/^[0-7]{3,4}$/.test(mode ?? "") || !target) return { stderr: "chmod: syntaxe attendue chmod MODE FICHIER\n", exitCode: 1 };
      const path = resolvePath(state, target);
      const node = state.fs[path];
      if (!node) return { stderr: `chmod: ${target}: introuvable\n`, exitCode: 1 };
      state.fs[path] = { ...node, mode: mode.slice(-3), updatedAt: Date.now() };
      return {};
    }
    case "stat": {
      const path = resolvePath(state, args[0] ?? "");
      const node = state.fs[path];
      if (!node) return { stderr: `stat: ${args[0] ?? ""}: introuvable\n`, exitCode: 1 };
      const size = node.type === "dir" ? 4096 : new TextEncoder().encode(node.content).length;
      return { stdout: `  Fichier : ${args[0]}\n  Type : ${node.type === "dir" ? "dossier" : "fichier régulier"}\n  Taille : ${size}\n  Accès : (${node.mode}/${symbolicMode(node)})  UID : (1000/${node.owner})  GID : (1000/${node.owner})\n` };
    }
    case "id":
      return { stdout: "uid=1000(learner) gid=1000(learner) groupes=1000(learner),1001(developers)\n" };
    case "groups":
      return { stdout: "learner developers\n" };
    case "env":
      return { stdout: `${Object.entries(state.env).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n")}\n` };
    case "export": {
      if (!args.length) return { stdout: `${Object.entries(state.env).map(([key, value]) => `declare -x ${key}=\"${value}\"`).join("\n")}\n` };
      for (const item of args) {
        const equals = item.indexOf("=");
        if (equals <= 0) return { stderr: `export: ${item}: identifiant invalide\n`, exitCode: 1 };
        state.env[item.slice(0, equals)] = item.slice(equals + 1);
      }
      return {};
    }
    case "grep": {
      const insensitive = args.includes("-i");
      const numbered = args.includes("-n");
      const operands = args.filter((arg) => !arg.startsWith("-"));
      const pattern = operands.shift();
      if (!pattern) return { stderr: "grep: motif manquant\n", exitCode: 2 };
      const read = readInput(state, operands, stdin);
      if (read.error) return { stderr: `grep: ${read.error}\n`, exitCode: 2 };
      const regex = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&"), insensitive ? "i" : "");
      const matches = (read.content ?? "").replace(/\n$/, "").split("\n").map((line, index) => ({ line, index: index + 1 })).filter(({ line }) => regex.test(line));
      return { stdout: `${matches.map(({ line, index }) => `${numbered ? `${index}:` : ""}${line}`).join("\n")}${matches.length ? "\n" : ""}`, exitCode: matches.length ? 0 : 1 };
    }
    case "find": {
      const start = resolvePath(state, args[0] && !args[0].startsWith("-") ? args[0] : ".");
      if (!state.fs[start]) return { stderr: `find: ${args[0]}: introuvable\n`, exitCode: 1 };
      const nameIndex = args.indexOf("-name");
      const pattern = nameIndex >= 0 ? args[nameIndex + 1] : "*";
      const regex = globToRegExp(pattern ?? "*");
      const paths = Object.keys(state.fs).filter((path) => path === start || path.startsWith(`${start}/`)).filter((path) => regex.test(baseName(path)));
      const rendered = paths.map((path) => (start === state.cwd ? `.${path.slice(start.length)}` || "." : path));
      return { stdout: `${rendered.join("\n")}${rendered.length ? "\n" : ""}` };
    }
    case "sort": {
      const files = args.filter((arg) => !arg.startsWith("-"));
      const read = readInput(state, files, stdin);
      if (read.error) return { stderr: `sort: ${read.error}\n`, exitCode: 1 };
      const lines = (read.content ?? "").replace(/\n$/, "").split("\n").filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
      return { stdout: `${lines.join("\n")}${lines.length ? "\n" : ""}` };
    }
    case "uniq": {
      const read = readInput(state, args.filter((arg) => !arg.startsWith("-")), stdin);
      if (read.error) return { stderr: `uniq: ${read.error}\n`, exitCode: 1 };
      const lines = (read.content ?? "").replace(/\n$/, "").split("\n").filter(Boolean);
      const unique = lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
      return { stdout: `${unique.join("\n")}${unique.length ? "\n" : ""}` };
    }
    case "cut": {
      const delimiterIndex = args.indexOf("-d");
      const fieldIndex = args.indexOf("-f");
      const delimiter = delimiterIndex >= 0 ? args[delimiterIndex + 1] : "\t";
      const field = fieldIndex >= 0 ? Number(args[fieldIndex + 1]) : 1;
      const files = args.filter((arg, index) => !arg.startsWith("-") && index !== delimiterIndex + 1 && index !== fieldIndex + 1);
      const read = readInput(state, files, stdin);
      if (read.error) return { stderr: `cut: ${read.error}\n`, exitCode: 1 };
      return { stdout: `${(read.content ?? "").replace(/\n$/, "").split("\n").map((line) => line.split(delimiter)[field - 1] ?? "").join("\n")}\n` };
    }
    case "tr": {
      const [from, to] = args;
      if (!from || to === undefined) return { stderr: "tr: deux ensembles sont nécessaires\n", exitCode: 1 };
      const map: Record<string, string> = {};
      [...from].forEach((char, index) => { map[char] = [...to][index] ?? [...to].at(-1) ?? ""; });
      return { stdout: [...stdin].map((char) => map[char] ?? char).join("") };
    }
    case "apt":
    case "apt-get": {
      const action = args[0];
      if (action === "update") {
        state.aptUpdated = true;
        return { stdout: "Atteint :1 https://packages.creatix.lab stable InRelease\nLecture des listes de paquets... Fait\n" };
      }
      if (action === "install") {
        const packages = args.slice(1).filter((arg) => !arg.startsWith("-"));
        if (!packages.length) return { stderr: "apt: paquet manquant\n", exitCode: 1 };
        for (const packageName of packages) if (!state.installedPackages.includes(packageName)) state.installedPackages.push(packageName);
        return { stdout: `Les NOUVEAUX paquets suivants seront installés : ${packages.join(" ")}\nInstallation terminée dans le laboratoire.\n` };
      }
      if (action === "upgrade") return { stdout: "0 mis à jour, 0 nouvellement installés, 0 à enlever.\n" };
      return { stderr: `apt: action ${action ?? "manquante"} non prise en charge dans ce laboratoire\n`, exitCode: 1 };
    }
    case "ps": {
      const lines = [
        "USER       PID %CPU %MEM COMMAND",
        "root         1  0.0  0.1 /sbin/init",
        "learner   1337  0.1  0.4 bash",
        ...(state.killedPids.includes(4242) ? [] : ["learner   4242 97.0 12.5 worker-bloque"]),
        "learner   5100  0.0  0.2 ps aux",
      ];
      return { stdout: `${lines.join("\n")}\n` };
    }
    case "kill": {
      const pid = Number(args.at(-1));
      if (!pid) return { stderr: "kill: PID nécessaire\n", exitCode: 1 };
      if (pid !== 4242 || state.killedPids.includes(pid)) return { stderr: `kill: (${pid}) aucun processus de ce type\n`, exitCode: 1 };
      state.killedPids.push(pid);
      return {};
    }
    case "history":
      return { stdout: `${state.history.map((item, index) => `${String(index + 1).padStart(4, " ")}  ${item}`).join("\n")}\n` };
    case "help":
    case "man": {
      const target = args[0] ?? "";
      const manuals: Record<string, string> = {
        ls: "ls — liste le contenu d'un dossier\nUsage : ls [options] [chemin]\n  -a  inclut les fichiers cachés\n  -l  format détaillé\n",
        cd: "cd — change le dossier courant\nUsage : cd [chemin]\n",
        grep: "grep — sélectionne les lignes correspondant à un motif\nUsage : grep [options] MOTIF [FICHIER]\n",
        chmod: "chmod — modifie les permissions\nUsage : chmod MODE FICHIER\n",
      };
      return { stdout: manuals[target] ?? `Aide : ${target || "commandes disponibles"}\nUtilise help ls, help cd, help grep ou consulte la bibliothèque de l'application.\n` };
    }
    case "tar": {
      const create = args.some((arg) => arg.includes("c"));
      const fIndex = args.findIndex((arg) => arg === "-f");
      let archive = fIndex >= 0 ? args[fIndex + 1] : "";
      if (!archive) {
        const combined = args.findIndex((arg) => /^-[a-z]*f[a-z]*$/i.test(arg));
        archive = combined >= 0 ? args[combined + 1] : "";
      }
      if (!create || !archive) return { stderr: "tar: utilisez tar -czf ARCHIVE SOURCE\n", exitCode: 1 };
      const error = writeFile(state, archive, "ARCHIVE CR3@TIX SIMULÉE\n");
      return error ? { stderr: `tar: ${error}\n`, exitCode: 1 } : { stdout: "Archive créée dans le laboratoire.\n" };
    }
    case "sha256sum": {
      const path = resolvePath(state, args[0] ?? "");
      const node = state.fs[path];
      if (!node || node.type !== "file") return { stderr: `sha256sum: ${args[0] ?? ""}: introuvable\n`, exitCode: 1 };
      return { stdout: `${simpleHash(node.content)}  ${args[0]}\n` };
    }
    case "df":
      return { stdout: args.includes("-h") ? "Sys. de fichiers Taille Utilisé Dispo Uti% Monté sur\n/dev/vda1            20G     15G  4.4G  78% /\ntmpfs               512M    1.2M  511M   1% /tmp\n" : "/dev/vda1 20971520 15728640 4613734 78% /\n" };
    case "du": {
      const target = args.filter((arg) => !arg.startsWith("-"))[0] ?? ".";
      const path = resolvePath(state, target);
      if (!state.fs[path]) return { stderr: `du: ${target}: introuvable\n`, exitCode: 1 };
      return { stdout: `${args.some((arg) => arg.includes("h")) ? "36K" : "36"}\t${target}\n` };
    }
    case "bash": {
      const script = args[0] ?? "";
      const path = resolvePath(state, script);
      if (!state.fs[path] || state.fs[path].type !== "file") return { stderr: `bash: ${script}: introuvable\n`, exitCode: 127 };
      if (path.endsWith("backup.sh")) {
        state.fs["/home/learner/backups"] ??= dir();
        state.fs["/home/learner/backups/projets.tar.gz"] = file("ARCHIVE CR3@TIX SIMULÉE\n");
        return { stdout: "[OK] sauvegarde créée : backups/projets.tar.gz\n" };
      }
      if (path.endsWith("healthcheck.sh")) {
        const alerts = [
          state.services.webapp !== "active" ? "ALERTE service webapp inactif" : "OK service webapp actif",
          state.containers.api !== "running" ? "ALERTE conteneur api unhealthy" : "OK conteneur api actif",
        ];
        return { stdout: `${alerts.join("\n")}\n`, exitCode: alerts.some((line) => line.startsWith("ALERTE")) ? 1 : 0 };
      }
      return { stdout: `Script ${script} exécuté.\n` };
    }
    case "ssh": {
      const destination = args.find((arg) => arg.includes("@"));
      if (!destination) return { stderr: "ssh: destination attendue sous la forme utilisateur@serveur\n", exitCode: 1 };
      const host = destination.split("@")[1];
      if (!state.sshHosts.includes(host)) state.sshHosts.push(host);
      return { stdout: `Connexion sécurisée simulée vers ${destination}.\nBienvenue sur ${host}.\n` };
    }
    case "scp": {
      if (args.length < 2 || !args[1].includes(":")) return { stderr: "scp: source et destination distante nécessaires\n", exitCode: 1 };
      const source = resolvePath(state, args[0]);
      if (!state.fs[source] || state.fs[source].type !== "file") return { stderr: `scp: ${args[0]}: introuvable\n`, exitCode: 1 };
      return { stdout: `${args[0]}  100%  ${new TextEncoder().encode(state.fs[source].content).length}B  transféré vers ${args[1]}\n` };
    }
    case "ip":
      return { stdout: args[0] === "route" ? "default via 10.20.0.1 dev eth0\n10.20.0.0/24 dev eth0 proto kernel\n" : "1: lo: <LOOPBACK,UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500\n    inet 10.20.0.15/24 brd 10.20.0.255 scope global eth0\n" };
    case "ss":
      return { stdout: "Netid State  Local Address:Port  Peer Address:Port\ntcp   LISTEN 0.0.0.0:22          0.0.0.0:*\ntcp   LISTEN 127.0.0.1:8080      0.0.0.0:*\n" };
    case "ping":
      return { stdout: `PING ${args[0] ?? "server-lab"} (10.20.0.20): 56 data bytes\n64 bytes from 10.20.0.20: icmp_seq=1 ttl=64 time=0.42 ms\n--- statistiques ---\n1 paquets transmis, 1 reçus, 0% packet loss\n` };
    case "dig":
      return { stdout: `;; ANSWER SECTION:\n${args[0] ?? "web.lab"}. 60 IN A 10.20.0.30\n` };
    case "curl": {
      const target = args.find((arg) => /^https?:\/\//.test(arg));
      if (!target) return { stderr: "curl: URL manquante\n", exitCode: 2 };
      const healthy = state.services.webapp === "active" && state.containers.api === "running";
      return healthy
        ? { stdout: "HTTP/1.1 200 OK\ncontent-type: application/json\n\n{\"status\":\"ok\",\"service\":\"webapp\"}\n" }
        : { stdout: "HTTP/1.1 503 Service Unavailable\ncontent-type: application/json\n\n{\"status\":\"degraded\"}\n", exitCode: 22 };
    }
    case "journalctl": {
      const unitIndex = args.indexOf("-u");
      const unit = unitIndex >= 0 ? args[unitIndex + 1] : "system";
      if (unit === "webapp") {
        return { stdout: state.services.webapp === "active" ? "août 25 08:42:01 creatix-lab webapp[2210]: service démarré\naoût 25 08:42:02 creatix-lab webapp[2210]: écoute sur :8080\n" : "août 25 08:15:04 creatix-lab webapp[1902]: ERROR configuration invalide: upstream api indisponible\naoût 25 08:15:04 creatix-lab systemd[1]: webapp.service: Failed with result 'exit-code'\n" };
      }
      return { stdout: "août 25 08:00:01 creatix-lab systemd[1]: Système démarré.\n" };
    }
    case "systemctl": {
      const [action, serviceName] = args;
      if (!serviceName || !state.services[serviceName]) return { stderr: `systemctl: unité ${serviceName ?? "manquante"} introuvable\n`, exitCode: 5 };
      if (action === "status") {
        const status = state.services[serviceName];
        return { stdout: `● ${serviceName}.service - Service ${serviceName}\n   Loaded: loaded\n   Active: ${status} ${status === "active" ? "(running)" : "(dead)"}\n`, exitCode: status === "active" ? 0 : 3 };
      }
      if (["start", "restart"].includes(action)) {
        state.services[serviceName] = "active";
        return { stdout: `${serviceName}.service redémarré avec succès.\n` };
      }
      if (action === "stop") {
        state.services[serviceName] = "inactive";
        return {};
      }
      return { stderr: `systemctl: action ${action ?? "manquante"} inconnue\n`, exitCode: 1 };
    }
    case "crontab":
      return args.includes("-l") ? { stdout: "# Sauvegarde quotidienne à 02:30\n30 2 * * * /home/learner/scripts/backup.sh\n" } : { stdout: "Dans ce laboratoire, utilise crontab -l pour consulter la planification.\n" };
    case "git": {
      const action = args[0];
      if (action === "status") return { stdout: "Sur la branche main\nModifications qui ne seront pas validées :\n  modified: config.yml\naucune modification ajoutée à la validation\n" };
      if (action === "log") return { stdout: "8a7c21f fix: sécurise la configuration SSH\n5d920ce feat: ajoute le healthcheck\n1a002fd initial commit\n" };
      if (action === "diff") return { stdout: "-debug: true\n+debug: false\n" };
      return { stdout: `git ${action ?? "help"} simulé dans le dépôt d'entraînement.\n` };
    }
    case "docker": {
      if (args[0] === "ps") {
        const api = state.containers.api;
        return { stdout: `CONTAINER ID  IMAGE               STATUS                 NAMES\na11ce001      creatix/api:1.4     ${api === "running" ? "Up 2 minutes (healthy)" : api === "unhealthy" ? "Up 12 minutes (unhealthy)" : "Exited (1)"}  api\ndb001         postgres:17         Up 2 hours (healthy)   database\n` };
      }
      if (args[0] === "compose" && args[1] === "ps") {
        const api = state.containers.api;
        return { stdout: `NAME       SERVICE    STATUS\napi        api        ${api === "running" ? "running (healthy)" : api}\ndatabase   database   running (healthy)\n` };
      }
      if (args[0] === "restart" && args[1]) {
        const name = args[1];
        if (!(name in state.containers)) return { stderr: `docker: conteneur ${name} introuvable\n`, exitCode: 1 };
        state.containers[name] = "running";
        return { stdout: `${name}\n` };
      }
      if (args[0] === "logs") return { stdout: "api | ERROR dépendance webapp indisponible\napi | healthcheck failed\n" };
      return { stderr: "docker: action simulée disponible : ps, compose ps, logs, restart\n", exitCode: 1 };
    }
    case "ufw":
      return args[0] === "status" ? { stdout: "Status: active\n\nTo                         Action      From\n22/tcp                     ALLOW       10.20.0.0/24\n80/tcp                     ALLOW       Anywhere\n" } : { stdout: "Règle de pare-feu simulée.\n" };
    case "sudo":
      return runSimpleCommand(state, args[0] ?? "", args.slice(1), stdin);
    default:
      if (command.endsWith("--help")) return { stdout: `Aide de ${command.replace("--help", "")}\n` };
      return { stderr: `${command}: commande introuvable\nConseil : vérifie l'orthographe ou utilise help ${command}.\n`, exitCode: 127 };
  }
}

function executePipelineInState(state: SimState, line: string): CommandResult {
  const tokens = tokenizeShell(line);
  const segments: string[][] = [[]];
  for (const token of tokens) {
    if (token === "|") segments.push([]);
    else segments[segments.length - 1].push(token);
  }

  let stdin = "";
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let clear = false;

  for (const segment of segments) {
    if (!segment.length) {
      stderr += "bash: erreur de syntaxe près du symbole |\n";
      exitCode = 2;
      break;
    }
    let redirect: ">" | ">>" | null = null;
    let redirectTarget = "";
    const redirectIndex = segment.findIndex((token) => token === ">" || token === ">>");
    let commandTokens = segment;
    if (redirectIndex >= 0) {
      redirect = segment[redirectIndex] as ">" | ">>";
      redirectTarget = segment[redirectIndex + 1] ?? "";
      commandTokens = segment.slice(0, redirectIndex);
      if (!redirectTarget) {
        stderr += "bash: cible de redirection manquante\n";
        exitCode = 2;
        break;
      }
    }

    const commandName = expandToken(state, commandTokens[0] ?? "");
    const result = runSimpleCommand(state, commandName, commandTokens.slice(1), stdin);
    stdout = result.stdout ?? "";
    stderr += result.stderr ?? "";
    exitCode = result.exitCode ?? 0;
    clear ||= Boolean(result.clear);
    if (redirect && exitCode === 0) {
      const error = writeFile(state, redirectTarget, stdout, redirect === ">>");
      if (error) {
        stderr += `bash: ${error}\n`;
        exitCode = 1;
      }
      stdout = "";
    }
    stdin = stdout;
    if (exitCode !== 0 && segments.length > 1) break;
  }

  return { stdout, stderr, exitCode, clear };
}

function testCondition(state: SimState, flag: string, operand: string): boolean {
  const path = resolvePath(state, expandToken(state, operand));
  const node = state.fs[path];
  if (flag === "-e") return Boolean(node);
  if (flag === "-f") return node?.type === "file";
  if (flag === "-d") return node?.type === "dir";
  if (flag === "-n") return Boolean(expandToken(state, operand));
  if (flag === "-z") return !expandToken(state, operand);
  return false;
}

function substituteCommands(state: SimState, source: string): { source: string; stderr: string; exitCode: number } {
  let expanded = source;
  let stderr = "";
  let exitCode = 0;
  for (let pass = 0; pass < 8; pass += 1) {
    const match = expanded.match(/\$\(([^()]*)\)/);
    if (!match) break;
    const isolated = cloneState(state);
    const result = executeScriptInState(isolated, match[1]);
    stderr += result.stderr ?? "";
    exitCode = result.exitCode ?? 0;
    if (exitCode !== 0) return { source: expanded, stderr, exitCode };
    expanded = `${expanded.slice(0, match.index)}${(result.stdout ?? "").trim().replace(/\s*\n\s*/g, " ")}${expanded.slice((match.index ?? 0) + match[0].length)}`;
  }
  return { source: expanded, stderr, exitCode };
}

function executeScriptInState(state: SimState, source: string): CommandResult {
  const line = source.trim();
  if (!line) return {};

  const functionDefinition = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{\s*([\s\S]*?)\s*;?\s*\}$/);
  if (functionDefinition) {
    state.functions[functionDefinition[1]] = functionDefinition[2].replace(/;\s*$/, "").trim();
    return {};
  }

  const loop = line.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([\s\S]+?)\s*;\s*do\s+([\s\S]+?)\s*;\s*done$/);
  if (loop) {
    const [, variable, rawValues, body] = loop;
    const values = tokenizeShell(rawValues).flatMap((value) => expandGlobArgument(state, value));
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    for (const value of values) {
      state.env[variable] = value;
      const result = executeScriptInState(state, body);
      stdout += result.stdout ?? "";
      stderr += result.stderr ?? "";
      exitCode = result.exitCode ?? 0;
    }
    return { stdout, stderr, exitCode };
  }

  const conditional = line.match(/^if\s+\[\s+(-[efdnz])\s+(.+?)\s*\]\s*;\s*then\s+([\s\S]+?)(?:\s*;\s*else\s+([\s\S]+?))?\s*;\s*fi$/);
  if (conditional) {
    const [, flag, operand, successBranch, failureBranch] = conditional;
    const branch = testCondition(state, flag, operand) ? successBranch : failureBranch;
    return branch ? executeScriptInState(state, branch) : {};
  }

  if (/(?:&&|\|\||;)\s*$/.test(line)) {
    return { stderr: "bash: erreur de syntaxe après l'opérateur de contrôle\n", exitCode: 2 };
  }

  const substitution = substituteCommands(state, line);
  if (substitution.exitCode !== 0) return { stderr: substitution.stderr, exitCode: substitution.exitCode };
  const clauses = splitControlClauses(substitution.source);
  let stdout = "";
  let stderr = substitution.stderr;
  let exitCode = 0;
  let clear = false;

  for (const clause of clauses) {
    if (clause.operatorBefore === "&&" && exitCode !== 0) continue;
    if (clause.operatorBefore === "||" && exitCode === 0) continue;
    const result = executePipelineInState(state, clause.source);
    stdout += result.stdout ?? "";
    stderr += result.stderr ?? "";
    exitCode = result.exitCode ?? 0;
    clear ||= Boolean(result.clear);
    state.lastExitCode = exitCode;
  }
  return { stdout, stderr, exitCode, clear };
}

export function executeCommandLine(current: SimState, input: string): ExecutionResult {
  const line = input.trim();
  const state = cloneState(current);
  if (!line) return { state, stdout: "", stderr: "", exitCode: 0 };

  state.history.push(line);
  state.commandCount += 1;
  const result = executeScriptInState(state, line);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.exitCode ?? 0;
  state.lastExitCode = exitCode;
  state.lastCommand = line;
  state.lastOutput = `${stdout}${stderr}`;
  return { state, stdout, stderr, exitCode, clear: result.clear };
}

export function evaluateCheck(state: SimState, check: Check): boolean {
  switch (check.type) {
    case "command":
      return new RegExp(check.pattern, "i").test(state.lastCommand.trim());
    case "cwd":
      return state.cwd === check.path;
    case "output":
      return state.lastOutput.toLocaleLowerCase("fr").includes(check.includes.toLocaleLowerCase("fr"));
    case "fileExists":
      return Boolean(state.fs[resolvePath(state, check.path)]);
    case "fileMissing":
      return !state.fs[resolvePath(state, check.path)];
    case "fileContent": {
      const node = state.fs[resolvePath(state, check.path)];
      return node?.type === "file" && node.content.includes(check.includes);
    }
    case "permission":
      return state.fs[resolvePath(state, check.path)]?.mode === check.mode;
    case "env":
      return state.env[check.name] === check.value;
    case "package":
      return state.installedPackages.includes(check.name);
    case "processKilled":
      return state.killedPids.includes(check.pid);
    case "service":
      return state.services[check.name] === check.status;
    case "ssh":
      return state.sshHosts.includes(check.host);
    case "docker":
      return state.containers[check.container] === check.status;
    default:
      return false;
  }
}

export function formatPrompt(state: SimState): string {
  const displayPath = state.cwd === state.env.HOME ? "~" : state.cwd.startsWith(`${state.env.HOME}/`) ? `~${state.cwd.slice(state.env.HOME.length)}` : state.cwd;
  return `learner@creatix:${displayPath}$`;
}

export const WELCOME_LINES = [
  "CR3@TIX SimShell 2.0 — laboratoire Linux sécurisé",
  "Aucune commande ne peut accéder à ton véritable appareil.",
  "Tab complète · ↑ rappelle · Ctrl+C annule · Ctrl+L efface.",
];
