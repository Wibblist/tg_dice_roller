# TG Dice Roller Bot

A simple Telegram bot for rolling dice, intended for tabletop RPG games.

This repo contains two implementations:

- **`worker/`** — TypeScript on Cloudflare Workers. **This is the used implementation** and where new features land.
- **`rust/`** — the original Rust implementation (teloxide + axum), frozen as a reference. It runs as a long-lived webhook server and is not deployed.

See `CONTEXT.md` for the canonical dice-notation glossary.

## Commands

- `/start` - Start the bot
- `/help` - Display available commands
- `/r <expression>` - Roll dice (e.g. `/r 3d6+2`)

## Dice Notation

See `CONTEXT.md` for the formal glossary. In short:

- `XdY±Z` — `X` dice (optional, defaults to 1) of `Y` faces, plus/minus a flat modifier
- `2d6+1d4+3` — chain multiple dice groups and modifiers
- `4d6kh3` / `4d6kl1` — keep the highest / lowest N dice
- `d20a` / `d20d` — advantage / disadvantage (single die only)
- `1d4+1 x3` — roll the whole expression 3 separate times (e.g. magic missile)
- `30d6 full` — force the full dice breakdown on rolls big enough to auto-compact (>20 dice)
- `d20+5 attack roll` — any trailing text (after `xN`/`full`) is echoed as a comment: `rolled 1d20+5 for "attack roll": …`

Individual die results are shown by default, with dropped dice struck through. Limits: 100 dice and 10000 faces per roll, 10 repeats, 100-character comments.

Examples:

- `d20` - Roll one 20-sided die
- `3d8+5` - Roll three 8-sided dice and add 5 to the result
- `2d20kh1+7` - Advantage attack roll with +7 (same as `d20a+7`)
- `8d6 x2` - Two separate 8d6 rolls

## Deployment (`worker/`)

Deployed to Cloudflare Workers via push-to-deploy (Workers Builds, root directory `worker/`). Manual deploys: `wrangler deploy` from `worker/`.

Secrets (set via `wrangler secret put`):

- `TELEGRAM_TOKEN` - Telegram Bot API token
- `WEBHOOK_SECRET` - value passed as `secret_token` to `setWebhook`; validated on every request

## Running the Rust version locally (`rust/`)

Requires env vars `TELOXIDE_TOKEN`, `PORT`, `HOST`, `WEBHOOK_URL`, and a public HTTPS tunnel (e.g. ngrok). Then `cargo run` from `rust/`.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
