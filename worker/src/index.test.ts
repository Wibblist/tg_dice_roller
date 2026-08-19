import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { escapeHtml, parseCommand, rollDice } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

// Math.random in [0,1) → die = floor(r * faces) + 1
function fixRandom(value: number): void {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("parseCommand", () => {
  it("parses bare commands", () => {
    expect(parseCommand("/start")).toEqual({ kind: "start" });
    expect(parseCommand("/help")).toEqual({ kind: "help" });
  });

  it("parses /r with an argument", () => {
    expect(parseCommand("/r 2d6+1")).toEqual({ kind: "roll", roll: "2d6+1" });
  });

  it("treats missing /r argument as an empty roll string", () => {
    expect(parseCommand("/r")).toEqual({ kind: "roll", roll: "" });
  });

  it("accepts the @BotName suffix form", () => {
    expect(parseCommand("/r@Some_Bot 2d6")).toEqual({ kind: "roll", roll: "2d6" });
    expect(parseCommand("/help@Some_Bot")).toEqual({ kind: "help" });
  });

  it("rejects non-commands and unknown commands", () => {
    expect(parseCommand("hello")).toBeUndefined();
    expect(parseCommand("/roll 2d6")).toBeUndefined();
    expect(parseCommand("r 2d6")).toBeUndefined();
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, >", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("rollDice", () => {
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

  it("rejects malformed input, including empty", () => {
    const invalid = "Invalid dice roll format. Use format like '2d20+5' or '2d20-5'";
    expect(rollDice("", "@bob")).toBe(invalid);
    expect(rollDice("banana", "@bob")).toBe(invalid);
    expect(rollDice("2d", "@bob")).toBe(invalid);
    expect(rollDice("2d6+3+4", "@bob")).toBe(invalid);
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

describe("fetch handler", () => {
  const env = { TELEGRAM_TOKEN: "TESTTOKEN", WEBHOOK_SECRET: "s3cret" };

  function webhookRequest(body: unknown, secret = "s3cret"): Request {
    return new Request("https://bot.example/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
      body: JSON.stringify(body),
    });
  }

  function update(text: string, from?: { first_name: string; username?: string }) {
    return {
      message: {
        message_id: 42,
        chat: { id: 7 },
        from: from ?? { first_name: "Bob", username: "bob" },
        text,
      },
    };
  }

  it("404s on non-webhook paths and non-POST", async () => {
    const get = new Request("https://bot.example/webhook");
    expect((await worker.fetch(get, env)).status).toBe(404);
    const other = new Request("https://bot.example/other", { method: "POST" });
    expect((await worker.fetch(other, env)).status).toBe(404);
  });

  it("401s on a wrong secret token", async () => {
    const response = await worker.fetch(webhookRequest(update("/start"), "wrong"), env);
    expect(response.status).toBe(401);
  });

  it("sends the roll reply via the Telegram API", async () => {
    fixRandom(0); // all dice roll 1
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await worker.fetch(webhookRequest(update("/r 2d6")), env);
    expect(response.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botTESTTOKEN/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: 7,
      text: "@bob rolled 2d6: [1 + 1] = 2",
      parse_mode: "HTML",
      reply_parameters: { message_id: 42 },
    });
  });

  it("escapes the first-name fallback in HTML mode", async () => {
    fixRandom(0);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await worker.fetch(webhookRequest(update("/r d6", { first_name: "<Bob&Co>" })), env);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { text: string };
    expect(body.text.startsWith("&lt;Bob&amp;Co&gt; rolled")).toBe(true);
  });

  it("ignores non-command messages and non-message updates without calling Telegram", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await worker.fetch(webhookRequest(update("just chatting")), env)).status).toBe(200);
    expect((await worker.fetch(webhookRequest({ edited_message: {} }), env)).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400s on a non-JSON body", async () => {
    const request = new Request("https://bot.example/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "s3cret" },
      body: "not json",
    });
    expect((await worker.fetch(request, env)).status).toBe(400);
  });
});
