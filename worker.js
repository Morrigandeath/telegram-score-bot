const SCORE_WORD = "I want wood";
const COOLDOWN = 120000; // 2 minutes

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Bot is running!");
    }

    // Set Telegram webhook
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

      return new Response(await response.text(), {
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

      // Leaderboard command
      if (text === "/leaderboard" || text === "/top") {
        const result = await env.DB.prepare(`
          SELECT name, score
          FROM scores
          ORDER BY score DESC, name ASC
          LIMIT 10
        `).all();

        if (!result.results.length) {
          await sendMessage(
            env.BOT_TOKEN,
            message.chat.id,
            "🏆 The leaderboard is empty."
          );

          return new Response("OK");
        }

        let leaderboard = "🏆 LEADERBOARD\n\n";

        result.results.forEach((player, index) => {
          leaderboard += `${index + 1}. ${player.name} — ${player.score}\n`;
        });

        await sendMessage(
          env.BOT_TOKEN,
          message.chat.id,
          leaderboard
        );

        return new Response("OK");
      }

      // Ignore other messages
      if (text !== SCORE_WORD) {
        return new Response("OK");
      }

      const user = message.from;
      const userId = String(user.id);
      const name = user.first_name || "Player";
      const now = Date.now();

      // Get current player
      const player = await env.DB.prepare(`
        SELECT score, last_score_at
        FROM scores
        WHERE user_id = ?
      `)
        .bind(userId)
        .first();

      // Check cooldown
      if (player && now - player.last_score_at < COOLDOWN) {
        const remaining = COOLDOWN - (now - player.last_score_at);

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.ceil((remaining % 60000) / 1000);

        await sendMessage(
          env.BOT_TOKEN,
          message.chat.id,
          `⏳ ${name}, wait ${minutes}m ${seconds}s before getting another point.`
        );

        return new Response("OK");
      }

      // Create player or increase score
      if (!player) {
        await env.DB.prepare(`
          INSERT INTO scores (user_id, name, score, last_score_at)
          VALUES (?, ?, 1, ?)
        `)
          .bind(userId, name, now)
          .run();

        await sendMessage(
          env.BOT_TOKEN,
          message.chat.id,
          `✅ ${name} got 1 point!\n🏆 Your score: 1`
        );
      } else {
        const newScore = player.score + 1;

        await env.DB.prepare(`
          UPDATE scores
          SET name = ?, score = ?, last_score_at = ?
          WHERE user_id = ?
        `)
          .bind(name, newScore, now, userId)
          .run();

        await sendMessage(
          env.BOT_TOKEN,
          message.chat.id,
          `✅ ${name} got 1 point!\n🏆 Your score: ${newScore}`
        );
      }

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
