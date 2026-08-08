const SCORE_WORD = "کیر میخوام";
const SCORE_WORD_5 = "کیر گنده میخوام";

const COOLDOWN = 120000; // 2 minutes

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
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
        const chatId = message.chat.id;

        // /start
        if (text === "/start") {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `👋 Welcome!\n\n` +
            `"${SCORE_WORD}" → 1 point\n` +
            `"${SCORE_WORD_5}" → 5 points\n\n` +
            `⏳ هر دو دقیقه یکبار میتونی کیر بگیری.\n\n` +
            `🏆 Use /leaderboard to see the top players.`
          );

          return new Response("OK");
        }

        // Leaderboard
        if (text === "/رتبه کیر خواهان" || text === "/top") {
          const result = await env.DB.prepare(`
            SELECT name, score
            FROM scores
            ORDER BY score DESC, name ASC
            LIMIT 10
          `).all();

          if (!result.results.length) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "🏆 خواهان کیر نداریم."
            );

            return new Response("OK");
          }

          let leaderboard = "🏆 LEADERBOARD\n\n";

          result.results.forEach((player, index) => {
            leaderboard += `${index + 1}. ${player.name} — ${player.score}\n`;
          });

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            leaderboard
          );

          return new Response("OK");
        }

        // Determine points
        let points = 0;

        if (text === SCORE_WORD) {
          points = 1;
        } else if (text === SCORE_WORD_5) {
          points = 5;
        } else {
          return new Response("OK");
        }

        // Telegram user
        const user = message.from;

        if (!user) {
          return new Response("OK");
        }

        const userId = String(user.id);
        const name = user.first_name || "Player";
        const now = Date.now();

        // Get player
        const player = await env.DB.prepare(`
          SELECT user_id, name, score, last_score_at
          FROM scores
          WHERE user_id = ?
        `)
          .bind(userId)
          .first();

        // Check cooldown
        if (player) {
          const elapsed = now - player.last_score_at;

          if (elapsed < COOLDOWN) {
            const remaining = COOLDOWN - elapsed;

            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.ceil(
              (remaining % 60000) / 1000
            );

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `⏳ ${name}, صبر کن  ` +
              `${minutes}m ${seconds}s before scoring again.`
            );

            return new Response("OK");
          }
        }

        // New player
        if (!player) {
          await env.DB.prepare(`
            INSERT INTO scores
            (user_id, name, score, last_score_at)
            VALUES (?, ?, ?, ?)
          `)
            .bind(userId, name, points, now)
            .run();

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `✅ ${name} got ${points} point${points === 1 ? "" : "s"}!\n` +
            `🏆 امتیازت: ${points}`
          );

          return new Response("OK");
        }

        // Existing player
        const newScore = player.score + points;

        await env.DB.prepare(`
          UPDATE scores
          SET name = ?, score = ?, last_score_at = ?
          WHERE user_id = ?
        `)
          .bind(name, newScore, now, userId)
          .run();

        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          `✅ ${name} got ${points} point${points === 1 ? "" : "s"}!\n` +
          `🏆 امتیازت: ${newScore}`
        );

        return new Response("OK");
      }

      return new Response("Not found", {
        status: 404
      });

    } catch (error) {
      console.error("Webhook error:", error);

      return new Response(
        "ERROR: " + String(error),
        {
          status: 500,
          headers: {
            "Content-Type": "text/plain"
          }
        }
      );
    }
  }
};


async function sendMessage(token, chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    }
  );

  if (!response.ok) {
    console.error(
      "Telegram sendMessage failed:",
      await response.text()
    );
  }
}
