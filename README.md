# TG Dice Roller Bot

A simple Telegram bot for rolling dice, intended for tabletop RPG games.

This repo contains two implementations:

- **`worker/`** — TypeScript on Cloudflare Workers. **This is the deployed implementation** and where new features land.
- **`rust/`** — the original Rust implementation (teloxide + axum), frozen as a reference. It runs as a long-lived webhook server and is not deployed.

See `CONTEXT.md` for the canonical dice-notation glossary.

## Commands

- `/start` - Start the bot
- `/help` - Display available commands
- `/r <expression>` - Roll dice (e.g. `/r 3d6+2`)

## Dice Notation

`XdY+Z` where:
  - `X` is the number of dice to roll (optional, defaults to 1)
  - `Y` is the number of faces on each die (required)
  - `Z` is an optional modifier to add to the total. This can be positive or negative.

Examples:
- `d20` - Roll one 20-sided die
- `2d6` - Roll two 6-sided dice
- `3d8+5` - Roll three 8-sided dice and add 5 to the result
- `d10-3` - Roll one 10-sided die and subtract 3 from the result

## Deployment (`worker/`)

Deployed to Cloudflare Workers via push-to-deploy (Workers Builds, root directory `worker/`). Manual deploys: `wrangler deploy` from `worker/`.

Secrets (set via `wrangler secret put`):
- `TELEGRAM_TOKEN` - Telegram Bot API token
- `WEBHOOK_SECRET` - value passed as `secret_token` to `setWebhook`; validated on every request

## Running the Rust version locally (`rust/`)

Requires env vars `TELOXIDE_TOKEN`, `PORT`, `HOST`, `WEBHOOK_URL`, and a public HTTPS tunnel (e.g. ngrok). Then `cargo run` from `rust/`.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
