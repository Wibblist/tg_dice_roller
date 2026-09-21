import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRoll, rollDice } from "./dice";

afterEach(() => {
  vi.restoreAllMocks();
});

// Math.random in [0,1) → die = floor(r * faces) + 1
function fixRandom(value: number): void {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

/** RNG that yields exactly `values` as die results for a die of `faces` faces. */
function diceRng(faces: number, ...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 1;
    index += 1;
    return (value - 0.5) / faces;
  };
}

const INVALID = "Invalid dice roll format. Use format like '2d20+5' or '2d20-5'";

describe("parseRoll", () => {
  it("parses a bare group with an implicit count", () => {
    expect(parseRoll("d20")).toEqual({
      ok: true,
      value: {
        terms: [{ sign: 1, term: { kind: "group", count: 1, faces: 20, echo: "1d20" } }],
        repeat: 1,
        verboseOverride: false,
      },
    });
  });

  it("parses a multi-group expression with modifiers and signs", () => {
    const parsed = parseRoll("2d6 + 1d4 - 3");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.terms.map((t) => t.sign)).toEqual([1, 1, -1]);
    expect(parsed.value.terms[2]?.term).toEqual({ kind: "modifier", value: 3 });
  });

  it("parses keep-highest and keep-lowest markers", () => {
    const parsed = parseRoll("4d6kh3");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.terms[0]?.term).toEqual({
      kind: "group",
      count: 4,
      faces: 6,
      marker: { kind: "kh", n: 3 },
      echo: "4d6kh3",
    });
    const low = parseRoll("4d6kl1");
    expect(low.ok && low.value.terms[0]?.term).toMatchObject({ marker: { kind: "kl", n: 1 } });
  });

  it("parses advantage/disadvantage and echoes them exactly as typed", () => {
    const adv = parseRoll("d20a");
    expect(adv.ok && adv.value.terms[0]?.term).toEqual({
      kind: "group",
      count: 1,
      faces: 20,
      marker: { kind: "adv" },
      echo: "d20a",
    });
    const dis = parseRoll("1d20d");
    expect(dis.ok && dis.value.terms[0]?.term).toMatchObject({
      marker: { kind: "dis" },
      echo: "1d20d",
    });
  });

  it("parses the repeat suffix and the full override", () => {
    const parsed = parseRoll("1d4+1 x3 full");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.repeat).toBe(3);
    expect(parsed.value.verboseOverride).toBe(true);
  });

  it("normalizes case and whitespace", () => {
    expect(parseRoll("  2D6KH1  X2  FULL  ")).toEqual(parseRoll("2d6kh1x2full"));
  });

  it("rejects an expression with no dice group", () => {
    expect(parseRoll("5")).toEqual({ ok: false, error: { kind: "format" } });
    expect(parseRoll("3+2")).toEqual({ ok: false, error: { kind: "format" } });
  });
});

describe("rollDice — basics and legacy byte-compat", () => {
  it("rolls a single die with implicit count", () => {
    fixRandom(0.5); // d20 → floor(0.5*20)+1 = 11
    expect(rollDice("d20", "@bob")).toBe("@bob rolled 1d20: [11] = 11");
  });

  it("rolls multiple dice and sums them", () => {
    fixRandom(0); // every die rolls 1
    expect(rollDice("3d6", "@bob")).toBe("@bob rolled 3d6: [1 + 1 + 1] = 3");
  });

  it("applies a positive modifier", () => {
    fixRandom(0.999); // d6 → 6
    expect(rollDice("2d6+3", "@bob")).toBe("@bob rolled 2d6+3: [6 + 6] + 3 = 15");
  });

  it("applies a negative modifier", () => {
    fixRandom(0.5); // d10 → 6
    expect(rollDice("d10-3", "@bob")).toBe("@bob rolled 1d10-3: [6] - 3 = 3");
  });

  it("stays within die bounds", () => {
    for (const r of [0, 0.2, 0.999999]) {
      fixRandom(r);
      const match = rollDice("d6", "@bob").match(/\[(\d+)\]/);
      const value = Number(match?.[1]);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});

describe("rollDice — multi-group expressions", () => {
  it("renders each group in its own brackets joined by signs", () => {
    const rng = diceRng(6, 4, 2, 3);
    expect(rollDice("2d6+1d6+3", "@bob", rng)).toBe("@bob rolled 2d6+1d6+3: [4 + 2] + [3] + 3 = 12");
  });

  it("subtracts a negated group", () => {
    const rng = diceRng(4, 3, 1);
    expect(rollDice("1d4-1d4", "@bob", rng)).toBe("@bob rolled 1d4-1d4: [3] - [1] = 2");
  });
});

describe("rollDice — keep highest/lowest", () => {
  it("strikes dropped dice for khN and sums only the kept ones", () => {
    const rng = diceRng(6, 5, 3, 1, 6);
    expect(rollDice("4d6kh3", "@bob", rng)).toBe(
      "@bob rolled 4d6kh3: [5 + 3 + <s>1</s> + 6] = 14",
    );
  });

  it("strikes dropped dice for klN", () => {
    const rng = diceRng(6, 5, 3, 1, 6);
    expect(rollDice("4d6kl2", "@bob", rng)).toBe(
      "@bob rolled 4d6kl2: [<s>5</s> + 3 + 1 + <s>6</s>] = 4",
    );
  });

  it("rejects keeping more dice than were rolled", () => {
    expect(rollDice("2d6kh3", "@bob")).toBe("@bob tried to keep more dice than were rolled.");
    expect(rollDice("2d6kh0", "@bob")).toBe("@bob tried to keep more dice than were rolled.");
  });
});

describe("rollDice — advantage/disadvantage", () => {
  it("expands advantage to two dice keeping the highest, echoing in words", () => {
    const rng = diceRng(20, 7, 15);
    expect(rollDice("d20a", "@bob", rng)).toBe(
      "@bob rolled d20 with advantage: [<s>7</s> + 15] = 15",
    );
  });

  it("expands disadvantage to two dice keeping the lowest", () => {
    const rng = diceRng(20, 7, 15);
    expect(rollDice("1d20d", "@bob", rng)).toBe(
      "@bob rolled d20 with disadvantage: [7 + <s>15</s>] = 7",
    );
  });

  it("spaces out the echo when advantage is chained with other terms", () => {
    const rng = diceRng(20, 7, 15);
    expect(rollDice("d20a+7", "@bob", rng)).toBe(
      "@bob rolled d20 with advantage + 7: [<s>7</s> + 15] + 7 = 22",
    );
  });

  it("rejects advantage on a multi-die group", () => {
    expect(rollDice("3d6a", "@bob")).toBe(
      "Advantage/disadvantage only applies to a single die (e.g. d20a or d20d).",
    );
  });
});

describe("rollDice — repeats", () => {
  it("renders a header plus one line per iteration", () => {
    const rng = diceRng(4, 3, 1, 2);
    expect(rollDice("1d4+1x3", "@bob", rng)).toBe(
      "@bob rolled 1d4+1 3 times:\n[3] + 1 = 4\n[1] + 1 = 2\n[2] + 1 = 3\n<b>Total: 9</b>",
    );
  });

  it("rejects out-of-range repeat counts", () => {
    expect(rollDice("1d4x11", "@bob")).toBe("Too many repeats. Keep it to 10 or fewer.");
    expect(rollDice("1d4x0", "@bob")).toBe("Too many repeats. Keep it to 10 or fewer.");
  });
});

describe("rollDice — verbose/compact boundary", () => {
  it("stays verbose at 20 dice", () => {
    fixRandom(0);
    expect(rollDice("20d6", "@bob")).toBe(`@bob rolled 20d6: [${"1 + ".repeat(19)}1] = 20`);
  });

  it("goes compact at 21 dice", () => {
    fixRandom(0);
    expect(rollDice("21d6", "@bob")).toBe("@bob rolled 21d6: 21");
  });

  it("full forces verbose past the cap", () => {
    fixRandom(0);
    expect(rollDice("21d6 full", "@bob")).toBe(`@bob rolled 21d6: [${"1 + ".repeat(20)}1] = 21`);
  });

  it("goes compact per iteration when repeating", () => {
    fixRandom(0);
    expect(rollDice("21d6x2", "@bob")).toBe("@bob rolled 21d6 2 times:\n21\n21\n<b>Total: 42</b>");
  });
});

describe("rollDice — errors", () => {
  it("rejects zero dice", () => {
    expect(rollDice("0d6", "@bob")).toBe(
      "@bob rolled an invalid number of dice. You can't roll negative dice.",
    );
  });

  it("rejects zero-sided dice", () => {
    expect(rollDice("d0", "@bob")).toBe(
      "@bob rolled an invalid number of sides on the dice. The dice gotta have at least 1 side.",
    );
  });

  it("rejects too many dice in one group", () => {
    expect(rollDice("101d6", "@bob")).toBe(
      "@bob tried to roll too many dice at once. Keep it to 100 dice and 10000 faces.",
    );
  });

  it("rejects too many faces", () => {
    expect(rollDice("d10001", "@bob")).toBe(
      "@bob tried to roll too many dice at once. Keep it to 100 dice and 10000 faces.",
    );
  });

  it("rejects too many dice across the whole expression", () => {
    expect(rollDice("60d6+60d6", "@bob")).toBe(
      "@bob tried to roll too many dice at once. Keep it to 100 dice and 10000 faces.",
    );
  });

  it("rejects malformed input, including empty", () => {
    expect(rollDice("", "@bob")).toBe(INVALID);
    expect(rollDice("banana", "@bob")).toBe(INVALID);
    expect(rollDice("2d", "@bob")).toBe(INVALID);
    expect(rollDice("2d6kh", "@bob")).toBe(INVALID);
    expect(rollDice("2d6+", "@bob")).toBe(INVALID);
  });
});

describe("rollDice — labels", () => {
  it("appends trailing text as a quoted label", () => {
    const rng = diceRng(20, 19);
    expect(rollDice("d20+2 attack roll", "@bob", rng)).toBe(
      '@bob rolled 1d20+2 for "attack roll": [19] + 2 = 21',
    );
  });

  it("preserves label case and escapes HTML", () => {
    const rng = diceRng(6, 4);
    expect(rollDice("d6 Fire <b>&</b> Ice", "@bob", rng)).toBe(
      '@bob rolled 1d6 for "Fire &lt;b&gt;&amp;&lt;/b&gt; Ice": [4] = 4',
    );
  });

  it("does not mistake label words starting with x or full for grammar", () => {
    const rng = diceRng(6, 4);
    expect(rollDice("d6 xylophone", "@bob", rng)).toBe('@bob rolled 1d6 for "xylophone": [4] = 4');
    expect(rollDice("d6 fullness", "@bob", rng)).toBe('@bob rolled 1d6 for "fullness": [4] = 4');
    expect(rollDice("d6 x", "@bob", rng)).toBe('@bob rolled 1d6 for "x": [4] = 4');
  });

  it("puts the label after the repeat count and collapses whitespace", () => {
    const rng = diceRng(4, 3, 1);
    expect(rollDice("1d4+1 x2  magic\n  missile ", "@bob", rng)).toBe(
      '@bob rolled 1d4+1 2 times for "magic missile":\n[3] + 1 = 4\n[1] + 1 = 2\n<b>Total: 6</b>',
    );
  });

  it("allows a 100-char label but rejects 101", () => {
    const rng = diceRng(6, 4);
    const label100 = "a".repeat(100);
    expect(rollDice(`d6 ${label100}`, "@bob", rng)).toBe(`@bob rolled 1d6 for "${label100}": [4] = 4`);
    expect(rollDice(`d6 ${label100}b`, "@bob", rng)).toBe(
      "That comment is too long. Keep it to 100 characters.",
    );
  });
});
