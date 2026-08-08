const SCORE_WORD = "I want wood";
const COOLDOWN = 120000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Bot is running!");
    }

    // Temporary webhook setup endpoint
    if (request.method === "GET" && url.pathname === "/setup") {
      const webhookUrl = `${url.origin}/telegram`;

      const response = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: webhookUrl
          })
        }
      );

      const result = await response.json();

      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    // Telegram webhook
    if (request.method === "POST" && url.pathname === "/telegram") {
      const update = await request.json();

      if (!update.message || !update.message.text) {
        return new Response("OK");
      }

      const message = update.message;
      const text = message.text.trim();

      if (text !== SCORE_WORD) {
        return new Response("OK");
      }

      const user = message.from;

      await sendMessage(
        env.BOT_TOKEN,
        message.chat.id,
        `✅ ${user.first_name} got 1 point!`
      );

      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  }
};

async function sendMessage(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
  }
