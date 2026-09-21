# Context — tg_dice_roller

Glossary of domain terms for the Telegram dice-rolling bot. Terms here are canonical; use them in code, docs, and messages.

## Terms

**Roll expression** — the full string a user submits after `/r`. Consists of one *expression body* plus optional trailing *repeat suffix*, optional trailing *verbose override*, and optional trailing *label*.

**Dice group** — one `XdY` term: X dice (default 1) of Y faces each, optionally carrying a *keep/drop* or an *advantage/disadvantage* marker. An expression body may chain multiple groups and flat modifiers with `+`/`-` (e.g. `2d6+1d4+3`).

**Modifier** — a flat integer added or subtracted in the expression body (the `+3` in `2d6+3`).

**Keep/drop** — group marker `khN` (keep highest N) or `klN` (keep lowest N), e.g. `4d6kh3`. These are the only keep/drop spellings; `dN`-style drop notation is deliberately not part of the grammar (the letter `d` after a group means disadvantage).

**Advantage / Disadvantage** — group suffix `a` / `d`. Sugar for `2dYkh1` / `2dYkl1`. Valid only on single-die groups (`d20a`); applying it to a multi-die group (`3d6a`) is an error, not a guess.

**Repeat suffix** — trailing `xN` that resolves the entire expression body N independent times, reporting each result separately (e.g. `1d4+1x3` for magic missile). Distinct from `3d4+3`, which sums into one total. `x` has no other meaning in the grammar (no multiplication).

**Verbose output** — the default result display: individual die faces shown (dropped dice visibly marked) plus the total.

**Compact output** — total-only display, automatically used when a roll exceeds the verbose cap (a size threshold on dice shown).

**Verbose override** — trailing keyword `full` forcing verbose output past the cap.

**Label** — free text after everything else in the roll expression (`d20+2 attack roll`), echoed back quoted: `rolled 1d20+2 for "attack roll": …`. Always last; case preserved; whitespace collapsed; capped at 100 characters (longer is an error, not a truncation). A trailing `x` or `full` that is not a well-formed repeat suffix / whole-word override is part of the label.
