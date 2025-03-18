# TG Dice Roller Bot

A simple Telegram bot for rolling dice intended to be used for tabletop RPG games. 

## Commands

- `/start` - Start the bot
- `/help` - Display available commands
- `/r <format>` - Roll dice using the specified format (e.g. `/r 3d6+2`)

## Dice Rolling Format

The bot supports the standard RPG dice notation:

`XdY+Z` where:
  - `X` is the number of dice to roll (optional, defaults to 1)
  - `Y` is the number of faces on each die (required)
  - `Z` is an optional modifier to add to the total. This can be positive or negative.

Examples:
- `d20` - Roll one 20-sided die
- `2d6` - Roll two 6-sided dice
- `3d8+5` - Roll three 8-sided dice and add 5 to the result
- `d10-3` - Roll one 10-sided die and subtract 3 from the result

## Environment Variables

The bot requires the following environment variables:
- `TELOXIDE_TOKEN` - Your Telegram Bot API token
- `PORT` - Port for the webhook server
- `HOST` - Host address for the webhook server
- `WEBHOOK_URL` - Public URL where Telegram can reach your webhook

## Running Locally

1. Clone the repository
2. Set the required environment variables
3. Install dependencies with Cargo: `cargo build`
4. Run the bot with Cargo: `cargo run`


## Deployment

This bot is designed to run with webhook integration, using a service like [Railway](https://railway.com/). You can also run it locally using [ngrok](https://ngrok.com/) to expose your local server to the internet.


## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.