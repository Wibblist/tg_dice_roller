interface Env {
  TELEGRAM_TOKEN: string;
  WEBHOOK_SECRET: string;
}

interface TelegramUser {
  first_name: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
  };
  from?: TelegramUser;
  text?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

type Command =
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "roll"; roll: string };

interface SendMessageBody {
  chat_id: number;
  text: string;
  parse_mode?: "HTML";
  reply_parameters?: {
    message_id: number;
  };
}

const START_TEXT = "🎲 Ayyyy, I'm rollin here! >:D\nUse /help to see available commands.";
const HELP_TEXT =
  "These commands are currently supported:\n\n/start — Start the bot.\n/help — Display this text.\n/r — Roll dice when given the right format (e.g. 2d20+5).";
const ROLL_PATTERN = /^(\d*)d(\d+)(?:[+-](\d+))?$/;

export function parseCommand(text: string): Command | undefined {
  const match = text.match(/^\/(start|help|r)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!match) {
    return undefined;
  }

  const command = match[1];
  if (command === "start") {
    return { kind: "start" };
  }
  if (command === "help") {
    return { kind: "help" };
  }
  return { kind: "roll", roll: (match[2] ?? "").trim() };
}

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function rollDice(rollString: string, username: string): string {
  const match = rollString.match(ROLL_PATTERN);
  if (!match) {
    return "Invalid dice roll format. Use format like '2d20+5' or '2d20-5'";
  }

  const numDiceString = match[1] ?? "";
  const numDice = numDiceString === "" ? 1 : Number.parseInt(numDiceString, 10);
  if (!Number.isSafeInteger(numDice) || numDice <= 0) {
    return `${username} rolled an invalid number of dice. You can't roll negative dice.`;
  }

  const faces = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isSafeInteger(faces) || faces <= 0) {
    return `${username} rolled an invalid number of sides on the dice. The dice gotta have at least 1 side.`;
  }

  const modifierValue = match[3] === undefined ? 0 : Number.parseInt(match[3], 10);
  const modifier = rollString.includes("-") ? -modifierValue : modifierValue;
  const rolls: number[] = [];
  for (let index = 0; index < numDice; index += 1) {
    rolls.push(Math.floor(Math.random() * faces) + 1);
  }

  const diceTotal = rolls.reduce((sum, value) => sum + value, 0);
  const total = diceTotal + modifier;
  const rollsString = rolls.join(" + ");

  if (modifier !== 0) {
    const sign = modifier < 0 ? "-" : "+";
    return `${username} rolled ${numDice}d${faces}${sign}${Math.abs(modifier)}: [${rollsString}] ${sign} ${Math.abs(modifier)} = ${total}`;
  }
  return `${username} rolled ${numDice}d${faces}: [${rollsString}] = ${total}`;
}

async function sendMessage(env: Env, body: SendMessageBody): Promise<void> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error("Telegram API error:", await response.text());
    }
  } catch (error) {
    console.error("Telegram API request failed:", error);
  }
}

function ok(): Response {
  return new Response("ok", { status: 200 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const message = update.message;
    if (!message || typeof message.text !== "string") {
      return ok();
    }

    const command = parseCommand(message.text);
    if (!command) {
      return ok();
    }

    if (command.kind === "start") {
      await sendMessage(env, { chat_id: message.chat.id, text: START_TEXT });
    } else if (command.kind === "help") {
      await sendMessage(env, { chat_id: message.chat.id, text: HELP_TEXT });
    } else {
      const user = message.from;
      const username = user?.username !== undefined
        ? `@${user.username}`
        : escapeHtml(user?.first_name ?? "");
      await sendMessage(env, {
        chat_id: message.chat.id,
        text: rollDice(command.roll, username),
        parse_mode: "HTML",
        reply_parameters: { message_id: message.message_id },
      });
    }

    return ok();
  },
};
