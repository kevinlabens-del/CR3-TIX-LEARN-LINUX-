export type ControlOperator = ";" | "&&" | "||";

export interface ShellClause {
  source: string;
  operatorBefore: ControlOperator | null;
}

/**
 * Découpe une ligne Bash sans casser les pipes, guillemets ni substitutions.
 * Le parseur reste volontairement pédagogique : il couvre les enchaînements
 * utiles aux cours sans exécuter de véritable shell.
 */
export function splitControlClauses(input: string): ShellClause[] {
  const clauses: ShellClause[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  let substitutionDepth = 0;
  let operatorBefore: ControlOperator | null = null;

  const push = (nextOperator: ControlOperator) => {
    const source = current.trim();
    if (source) clauses.push({ source, operatorBefore });
    current = "";
    operatorBefore = nextOperator;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      current += char;
      escaping = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "$" && next === "(") {
      substitutionDepth += 1;
      current += "$(";
      index += 1;
      continue;
    }
    if (char === ")" && substitutionDepth > 0) {
      substitutionDepth -= 1;
      current += char;
      continue;
    }
    if (substitutionDepth === 0 && char === ";") {
      push(";");
      continue;
    }
    if (substitutionDepth === 0 && char === "&" && next === "&") {
      push("&&");
      index += 1;
      continue;
    }
    if (substitutionDepth === 0 && char === "|" && next === "|") {
      push("||");
      index += 1;
      continue;
    }
    current += char;
  }

  const source = current.trim();
  if (source) clauses.push({ source, operatorBefore });
  return clauses;
}

export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  const push = () => {
    if (current) tokens.push(current);
    current = "";
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      continue;
    }
    if (char === ">") {
      push();
      if (input[index + 1] === ">") {
        tokens.push(">>");
        index += 1;
      } else tokens.push(">");
      continue;
    }
    if (char === "|" || char === "<") {
      push();
      tokens.push(char);
      continue;
    }
    current += char;
  }
  push();
  return tokens;
}
