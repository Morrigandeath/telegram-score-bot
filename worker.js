const SCORE_WORD = "I want wood";
const COOLDOWN = 120000;

// Temporary storage for testing.
// Later we'll move scores/cooldowns to Cloudflare KV or D1
const scores = new Map();
const lastScoreTime = new Map();

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Bot is running!", { status: 200 });
    }

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
    const userId = String(user.id);
    const now = Date.now();

    const lastTime = lastScoreTime.get(userId) || 0;
    const elapsed = now - lastTime;

    if (elapsed < COOLDOWN) {
      const remaining = Math.ceil((COOLDOWN - elapsed) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;

      await sendMessage(
        env.BOT_TOKEN,
        message.chat.id,
        `⏳ ${user.first_name}, wait ${minutes}m ${seconds}s before getting another point.`
      );

      return new Response("OK");
    }

    const newScore = (scores.get(userId) || 0) + 1;

    scores.set(userId, newScore);
    lastScoreTime.set(userId, now);

    await sendMessage(
      env.BOT_TOKEN,
      message.chat.id,
      `✅ ${user.first_name} got 1 point!\n🏆 Your score: ${newScore}`
    );

    return new Response("OK");
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
      text: text
    })
  });
      }
