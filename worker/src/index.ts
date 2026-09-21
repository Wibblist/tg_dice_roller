import { escapeHtml, rollDice } from "./dice";

export { escapeHtml, rollDice };

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
// Sent with parse_mode HTML.
const HELP_TEXT = [
  "<b>Commands</b>",
  "/start — start the bot",
  "/help — this text",
  "/r — roll dice",
  "",
  "<b>Dice syntax</b>",
  "<code>2d20+5</code> — dice ± flat modifier",
  "<code>2d6+1d4+3</code> — chain groups",
  "<code>4d6kh3</code> — keep the 3 highest (<code>kl</code>: lowest)",
  "<code>d20a</code> / <code>d20d</code> — advantage / disadvantage",
  "<code>1d4+1 x3</code> — roll it 3 separate times",
  "<code>30d6 full</code> — full breakdown on big rolls",
  "<code>d20+5 attack roll</code> — trailing text becomes a comment on the roll",
].join("\n");

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
      await sendMessage(env, { chat_id: message.chat.id, text: HELP_TEXT, parse_mode: "HTML" });
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
