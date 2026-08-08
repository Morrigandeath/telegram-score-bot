const SCORE_WORD = "کیر";
const SCORE_WORD_5 = "کیر گنده";
const BOMB_WORD = "بمب کیر";
const MY_SCORE_WORD = "چقدر کیر دارم";
const LEADERBOARD_WORD = "رتبه بندی خواهان کیر";

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
        const user = message.from;

        if (!user) {
          return new Response("OK");
        }

        const userId = String(user.id);
        const name = user.first_name || "بازیکن";

        // /start
        if (text === "/start") {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `👋 خوش آمدی ${name}!\n\n` +
            `کیر → ۱ امتیاز\n` +
            `کیر گنده → ۵ امتیاز\n` +
            `بمب کیر → ۱۰۰ امتیاز (فقط یک‌بار)\n\n` +
            `🏆 رتبه بندی خواهان کیر\n` +
            `📊 چقدر کیر دارم`
          );

          return new Response("OK");
        }

        // Make sure bomb table exists
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS bomb_claims (
            user_id TEXT PRIMARY KEY,
            claimed_at INTEGER NOT NULL
          )
        `).run();

        // =========================
        // MY SCORE
        // =========================

        if (text === MY_SCORE_WORD) {
          const player = await env.DB.prepare(`
            SELECT score
            FROM scores
            WHERE user_id = ?
          `)
            .bind(userId)
            .first();

          const score = player ? player.score : 0;

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `📊 امتیازات: ${score}`
          );

          return new Response("OK");
        }

        // =========================
        // LEADERBOARD
        // =========================

        if (
          text === LEADERBOARD_WORD ||
          text === "/leaderboard" ||
          text === "/top"
        ) {
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
              "🏆 رتبه بندی خواهان کیر خالی است."
            );

            return new Response("OK");
          }

          let leaderboard = "🏆 رتبه بندی خواهان کیر\n\n";

          result.results.forEach((player, index) => {
            leaderboard +=
              `${index + 1}. ${player.name} — ${player.score}\n`;
          });

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            leaderboard
          );

          return new Response("OK");
        }

        // =========================
        // BOMB — ONE TIME ONLY
        // =========================

        if (text === BOMB_WORD) {
          const alreadyClaimed = await env.DB.prepare(`
            SELECT user_id
            FROM bomb_claims
            WHERE user_id = ?
          `)
            .bind(userId)
            .first();

          if (alreadyClaimed) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `💣 ${name}، بمب کیر را قبلاً استفاده کرده‌ای!\n` +
              `این جایزه فقط یک‌بار قابل دریافت است.`
            );

            return new Response("OK");
          }

          const now = Date.now();

          // Create player if needed
          const player = await env.DB.prepare(`
            SELECT user_id, name, score
            FROM scores
            WHERE user_id = ?
          `)
            .bind(userId)
            .first();

          if (!player) {
            await env.DB.prepare(`
              INSERT INTO scores
              (user_id, name, score, last_score_at)
              VALUES (?, ?, ?, ?)
            `)
              .bind(userId, name, 100, now)
              .run();
          } else {
            const newScore = player.score + 100;

            await env.DB.prepare(`
              UPDATE scores
              SET name = ?, score = ?, last_score_at = ?
              WHERE user_id = ?
            `)
              .bind(name, newScore, now, userId)
              .run();
          }

          // Mark bomb as used
          await env.DB.prepare(`
            INSERT INTO bomb_claims
            (user_id, claimed_at)
            VALUES (?, ?)
          `)
            .bind(userId, now)
            .run();

          const updatedPlayer = await env.DB.prepare(`
            SELECT score
            FROM scores
            WHERE user_id = ?
          `)
            .bind(userId)
            .first();

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `💣 ${name}، ۱۰۰ امتیاز یکبار مصرف گرفتی!\n` +
            `📊 امتیازات: ${updatedPlayer.score}`
          );

          return new Response("OK");
        }

        // =========================
        // NORMAL SCORE WORDS
        // =========================

        let points = 0;

        if (text === SCORE_WORD_5) {
          points = 5;
        } else if (text === SCORE_WORD) {
          points = 1;
        } else {
          return new Response("OK");
        }

        const now = Date.now();

        // Get player
        const player = await env.DB.prepare(`
          SELECT user_id, name, score, last_score_at
          FROM scores
          WHERE user_id = ?
        `)
          .bind(userId)
          .first();

        // =========================
        // COOLDOWN
        // =========================

        if (player) {
          const elapsed = now - player.last_score_at;

          if (elapsed < COOLDOWN) {
            const remaining = COOLDOWN - elapsed;

            const minutes = Math.floor(
              remaining / 60000
            );

            const seconds = Math.ceil(
              (remaining % 60000) / 1000
            );

            let waitText = "";

            if (minutes > 0) {
              waitText += `${minutes} دقیقه`;
            }

            if (seconds > 0) {
              if (waitText) {
                waitText += " و ";
              }

              waitText += `${seconds} ثانیه`;
            }

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `⏳ ${name}، فعلاً کیر در کار نیست!\n` +
              `باید ${waitText} صبر کنی.`
            );

            return new Response("OK");
          }
        }

        // =========================
        // NEW PLAYER
        // =========================

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
            `✅ ${points} امتیاز گرفتی!\n` +
            `📊 امتیازات: ${points}`
          );

          return new Response("OK");
        }

        // =========================
        // EXISTING PLAYER
        // =========================

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
          `✅ ${points} امتیاز گرفتی!\n` +
          `📊 امتیازات: ${newScore}`
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
