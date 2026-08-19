/**
 * Dice grammar (see ../../CONTEXT.md for the canonical glossary):
 *
 *   roll   := expr repeat? verbose?
 *   repeat := 'x' INT                    (1..10, applies to the whole expr)
 *   verbose:= 'full'
 *   expr   := term (('+'|'-') term)*
 *   term   := group | INT
 *   group  := INT? 'd' INT marker?
 *   marker := 'kh' INT | 'kl' INT | 'a' | 'd'
 */

export const MAX_DICE_PER_GROUP = 100;
export const MAX_TOTAL_DICE = 100;
export const MAX_FACES = 10000;
export const MAX_REPEATS = 10;
/** Above this many dice per iteration, output falls back to compact unless `full` is given. */
export const VERBOSE_DICE_CAP = 20;

export type Marker =
  | { kind: "kh"; n: number }
  | { kind: "kl"; n: number }
  | { kind: "adv" }
  | { kind: "dis" };

export type Term =
  | { kind: "group"; count: number; faces: number; marker?: Marker; echo: string }
  | { kind: "modifier"; value: number };

export interface SignedTerm {
  sign: 1 | -1;
  term: Term;
}

export interface RollExpression {
  terms: SignedTerm[];
  repeat: number;
  verboseOverride: boolean;
}

export type ParseError =
  | { kind: "format" }
  | { kind: "dice-count" }
  | { kind: "faces" }
  | { kind: "too-many" }
  | { kind: "keep-count" }
  | { kind: "adv-multi" }
  | { kind: "repeat-range" };

export type ParseResult =
  | { ok: true; value: RollExpression }
  | { ok: false; error: ParseError };

export type Rng = () => number;

function fail(kind: ParseError["kind"]): ParseResult {
  return { ok: false, error: { kind } };
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

/** Pure parser: normalized text in, typed AST (or a typed error) out. */
export function parseRoll(input: string): ParseResult {
  const source = input.trim().toLowerCase();
  let index = 0;

  const skipSpace = (): void => {
    while (index < source.length && /\s/.test(source[index] as string)) {
      index += 1;
    }
  };
  const readInt = (): number | undefined => {
    const start = index;
    while (isDigit(source[index])) {
      index += 1;
    }
    return index === start ? undefined : Number.parseInt(source.slice(start, index), 10);
  };

  const terms: SignedTerm[] = [];
  let sign: 1 | -1 = 1;

  for (;;) {
    skipSpace();
    const termStart = index;
    const leading = readInt();

    if (source[index] === "d" && isDigit(source[index + 1])) {
      index += 1;
      const faces = readInt() as number;
      let marker: Marker | undefined;
      const twoChars = source.slice(index, index + 2);
      if (twoChars === "kh" || twoChars === "kl") {
        index += 2;
        const keep = readInt();
        if (keep === undefined) {
          return fail("format");
        }
        marker = { kind: twoChars, n: keep };
      } else if (source[index] === "a") {
        index += 1;
        marker = { kind: "adv" };
      } else if (source[index] === "d") {
        index += 1;
        marker = { kind: "dis" };
      }

      const count = leading ?? 1;
      const echo =
        marker?.kind === "adv" || marker?.kind === "dis"
          ? source.slice(termStart, index)
          : `${count}d${faces}${marker ? `${marker.kind}${marker.n}` : ""}`;
      terms.push({ sign, term: { kind: "group", count, faces, marker, echo } });
    } else if (leading !== undefined) {
      terms.push({ sign, term: { kind: "modifier", value: leading } });
    } else {
      return fail("format");
    }

    skipSpace();
    if (source[index] === "+" || source[index] === "-") {
      sign = source[index] === "+" ? 1 : -1;
      index += 1;
      continue;
    }
    break;
  }

  skipSpace();
  let repeat = 1;
  let repeatGiven = false;
  if (source[index] === "x") {
    index += 1;
    const count = readInt();
    if (count === undefined) {
      return fail("format");
    }
    repeat = count;
    repeatGiven = true;
  }

  skipSpace();
  let verboseOverride = false;
  if (source.slice(index, index + 4) === "full") {
    index += 4;
    verboseOverride = true;
  }

  skipSpace();
  if (index !== source.length) {
    return fail("format");
  }

  if (!terms.some(({ term }) => term.kind === "group")) {
    return fail("format");
  }

  let totalDice = 0;
  for (const { term } of terms) {
    if (term.kind !== "group") {
      continue;
    }
    if (term.count <= 0) {
      return fail("dice-count");
    }
    if (term.faces <= 0) {
      return fail("faces");
    }
    if (term.count > MAX_DICE_PER_GROUP || term.faces > MAX_FACES) {
      return fail("too-many");
    }
    const marker = term.marker;
    if (marker?.kind === "adv" || marker?.kind === "dis") {
      if (term.count !== 1) {
        return fail("adv-multi");
      }
      totalDice += 2;
    } else {
      if (marker && (marker.n < 1 || marker.n > term.count)) {
        return fail("keep-count");
      }
      totalDice += term.count;
    }
  }
  if (totalDice > MAX_TOTAL_DICE) {
    return fail("too-many");
  }
  if (repeatGiven && (repeat < 1 || repeat > MAX_REPEATS)) {
    return fail("repeat-range");
  }

  return { ok: true, value: { terms, repeat, verboseOverride } };
}

export function errorMessage(error: ParseError, username: string): string {
  switch (error.kind) {
    case "dice-count":
      return `${username} rolled an invalid number of dice. You can't roll negative dice.`;
    case "faces":
      return `${username} rolled an invalid number of sides on the dice. The dice gotta have at least 1 side.`;
    case "too-many":
      return `${username} tried to roll too many dice at once. Keep it to ${MAX_TOTAL_DICE} dice and ${MAX_FACES} faces.`;
    case "keep-count":
      return `${username} tried to keep more dice than were rolled.`;
    case "adv-multi":
      return "Advantage/disadvantage only applies to a single die (e.g. d20a or d20d).";
    case "repeat-range":
      return `Too many repeats. Keep it to ${MAX_REPEATS} or fewer.`;
    default:
      return "Invalid dice roll format. Use format like '2d20+5' or '2d20-5'";
  }
}

interface RolledDie {
  value: number;
  kept: boolean;
}

interface RolledTerm {
  sign: 1 | -1;
  dice?: RolledDie[];
  value: number;
}

export interface RolledIteration {
  terms: RolledTerm[];
  total: number;
}

/** Dice actually rolled for one iteration, counting a/d expansion. */
export function diceCount(expression: RollExpression): number {
  let total = 0;
  for (const { term } of expression.terms) {
    if (term.kind !== "group") {
      continue;
    }
    const marker = term.marker;
    total += marker?.kind === "adv" || marker?.kind === "dis" ? 2 : term.count;
  }
  return total;
}

function rollGroup(count: number, faces: number, marker: Marker | undefined, rng: Rng): RolledDie[] {
  let rolled = count;
  let keepKind: "kh" | "kl" | undefined;
  let keepN = count;
  if (marker?.kind === "adv") {
    rolled = 2;
    keepKind = "kh";
    keepN = 1;
  } else if (marker?.kind === "dis") {
    rolled = 2;
    keepKind = "kl";
    keepN = 1;
  } else if (marker?.kind === "kh" || marker?.kind === "kl") {
    keepKind = marker.kind;
    keepN = marker.n;
  }

  const dice: RolledDie[] = [];
  for (let i = 0; i < rolled; i += 1) {
    dice.push({ value: Math.floor(rng() * faces) + 1, kept: keepKind === undefined });
  }
  if (keepKind !== undefined) {
    const order = dice
      .map((die, i) => ({ die, i }))
      .sort((a, b) => (keepKind === "kh" ? b.die.value - a.die.value : a.die.value - b.die.value));
    for (const entry of order.slice(0, keepN)) {
      entry.die.kept = true;
    }
  }
  return dice;
}

export function rollExpression(expression: RollExpression, rng: Rng): RolledIteration {
  const terms: RolledTerm[] = [];
  let total = 0;
  for (const { sign, term } of expression.terms) {
    if (term.kind === "modifier") {
      terms.push({ sign, value: term.value });
      total += sign * term.value;
      continue;
    }
    const dice = rollGroup(term.count, term.faces, term.marker, rng);
    const value = dice.reduce((sum, die) => (die.kept ? sum + die.value : sum), 0);
    terms.push({ sign, dice, value });
    total += sign * value;
  }
  return { terms, total };
}

/** Renders one iteration as HTML; dropped dice are struck through. */
export function renderIteration(iteration: RolledIteration): string {
  let out = "";
  iteration.terms.forEach(({ sign, dice, value }, i) => {
    const rendered =
      dice === undefined
        ? String(value)
        : `[${dice.map((die) => (die.kept ? String(die.value) : `<s>${die.value}</s>`)).join(" + ")}]`;
    out += i === 0 ? rendered : ` ${sign === 1 ? "+" : "-"} ${rendered}`;
  });
  return out;
}

export function renderExpressionEcho(expression: RollExpression): string {
  // Advantage/disadvantage groups echo in words ("d20 with advantage"); an
  // expression containing one gets spaced signs so the words don't run together.
  const wordy = expression.terms.some(
    ({ term }) =>
      term.kind === "group" && (term.marker?.kind === "adv" || term.marker?.kind === "dis"),
  );
  return expression.terms
    .map(({ sign, term }, i) => {
      let body: string;
      if (term.kind === "group" && term.marker?.kind === "adv") {
        body = `d${term.faces} with advantage`;
      } else if (term.kind === "group" && term.marker?.kind === "dis") {
        body = `d${term.faces} with disadvantage`;
      } else {
        body = term.kind === "group" ? term.echo : String(term.value);
      }
      const signText = sign === 1 ? "+" : "-";
      if (i === 0) {
        return body;
      }
      return wordy ? ` ${signText} ${body}` : `${signText}${body}`;
    })
    .join("");
}

/**
 * Parses, rolls and renders a roll expression. Returns the reply text, which is
 * either an error message or HTML-safe result output (only `<s>` tags are emitted).
 */
export function rollDice(rollString: string, username: string, rng: Rng = Math.random): string {
  const parsed = parseRoll(rollString);
  if (!parsed.ok) {
    return errorMessage(parsed.error, username);
  }

  const expression = parsed.value;
  const echo = renderExpressionEcho(expression);
  const verbose = expression.verboseOverride || diceCount(expression) <= VERBOSE_DICE_CAP;

  const iterations: RolledIteration[] = [];
  for (let i = 0; i < expression.repeat; i += 1) {
    iterations.push(rollExpression(expression, rng));
  }

  const line = (iteration: RolledIteration): string =>
    verbose ? `${renderIteration(iteration)} = ${iteration.total}` : String(iteration.total);

  if (expression.repeat === 1) {
    return `${username} rolled ${echo}: ${line(iterations[0] as RolledIteration)}`;
  }
  const header = `${username} rolled ${echo} ${expression.repeat} times:`;
  return [header, ...iterations.map(line)].join("\n");
}
