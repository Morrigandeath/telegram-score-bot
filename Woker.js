const SCORE_WORD = "کیر میخوام";
const SCORE_WORD_5 = "کیر گنده میخوام";
const BOMB_WORD = "بمب کیر";
const MY_SCORE_WORD = "چقدر کیر دارم";
const LEADERBOARD_WORD = "رتبه بندی خواهان کیر";

const ADMIN_ID = "6364019242";

const COOLDOWN = 120000; // 2 minutes
const BOMB_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // =========================
      // HEALTH CHECK
      // =========================

      if (request.method === "GET" && url.pathname === "/") {
        return new Response("Bot is running!");
      }

      // =========================
      // SET WEBHOOK
      // =========================

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

      // =========================
      // TELEGRAM WEBHOOK
      // =========================

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

        // =========================
        // CREATE SETTINGS TABLE
        // =========================

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            vip INTEGER NOT NULL DEFAULT 0,
            half INTEGER NOT NULL DEFAULT 0,
            muted_until INTEGER NOT NULL DEFAULT 0
          )
        `).run();

        // =========================
        // CREATE BOMB TABLE
        // =========================

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS bomb_claims (
            user_id TEXT PRIMARY KEY,
            claimed_at INTEGER NOT NULL
          )
        `).run();

        // =========================
        // START
        // =========================

        if (text === "/start") {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `👋 خوش آمدی ${name}!\n\n` +
            `کیر میخوام → ۱ امتیاز\n` +
            `کیر گنده میخوام → ۵ امتیاز\n\n` +
            `🏆 رتبه بندی خواهان کیر\n` +
            `📊 چقدر کیر دارم`
          );

          return new Response("OK");
        }

        // =========================
        // ADMIN CHECK
        // =========================

        const isAdmin = userId === ADMIN_ID;

        // =========================
        // ADMIN HELP
        // =========================

        if (text === "/admin") {
          if (!isAdmin) {
            return new Response("OK");
          }

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `👑 کامندهای ادمین:\n\n` +
            `/vip — روی پیام شخص ریپلای کن\n` +
            `/unvip — حذف VIP\n` +
            `/mute — میوت کردن تا زمان /unmute\n` +
            `/unmute — فعال کردن دوباره\n` +
            `/half — نصف شدن امتیازها\n` +
            `/unhalf — حذف حالت نصف\n` +
            `/status — نمایش وضعیت شخص`
          );

          return new Response("OK");
        }

        // =========================
        // REPLIED USER
        // =========================

        const repliedUser =
          message.reply_to_message &&
          message.reply_to_message.from;

        // =========================
        // ADMIN COMMANDS
        // =========================

        if (
          text === "/vip" ||
          text === "/unvip" ||
          text === "/mute" ||
          text === "/unmute" ||
          text === "/half" ||
          text === "/unhalf" ||
          text === "/status"
        ) {
          if (!isAdmin) {
            return new Response("OK");
          }

          if (!repliedUser) {
            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              "⚠️ باید روی پیام شخص ریپلای کنی."
            );

            return new Response("OK");
          }

          const targetId = String(repliedUser.id);

          const targetName =
            repliedUser.first_name || "بازیکن";

          // =========================
          // CREATE SETTINGS ROW
          // =========================

          await env.DB.prepare(`
            INSERT OR IGNORE INTO user_settings
            (user_id, vip, half, muted_until)
            VALUES (?, 0, 0, 0)
          `)
            .bind(targetId)
            .run();

          // =========================
          // VIP
          // =========================

          if (text === "/vip") {
            await env.DB.prepare(`
              UPDATE user_settings
              SET vip = 1
              WHERE user_id = ?
            `)
              .bind(targetId)
              .run();

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `👑 ${targetName} الان VIP شد!\n\n` +
              `امتیازها ×۲\n` +
              `زمان انتظار ÷۲`
            );

            return new Response("OK");
          }

          // =========================
          // UNVIP
          // =========================

          if (text === "/unvip") {
            await env.DB.prepare(`
              UPDATE user_settings
              SET vip = 0
              WHERE user_id = ?
            `)
              .bind(targetId)
              .run();

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `❌ VIP برای ${targetName} حذف شد.`
            );

            return new Response("OK");
          }

          // =========================
          // MUTE
          // =========================

          if (text === "/mute") {
            await env.DB.prepare(`
              UPDATE user_settings
              SET muted_until = -1
              WHERE user_id = ?
            `)
              .bind(targetId)
              .run();

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `🔇 ${targetName} میوت شد.\n` +
              `تا وقتی ادمین /unmute نکند، امکان امتیازگیری ندارد.`
            );

            return new Response("OK");
          }

          // =========================
          // UNMUTE
          // =========================

          if (text === "/unmute") {
            await env.DB.prepare(`
              UPDATE user_settings
              SET muted_until = 0
              WHERE user_id = ?
            `)
              .bind(targetId)
              .run();

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `🔊 امتیازگیری ${targetName} دوباره فعال شد.`
            );

            return new Response("OK");
          }

          // =========================
          // HALF
          // =========================

          if (text === "/half") {
            await env.DB.prepare(`
              UPDATE user_settings
              SET half = 1
              WHERE user_id = ?
            `)
              .bind(targetId)
              .run();

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `⬇️ از این به بعد امتیازهای ${targetName} نصف حساب می‌شود.`
            );

            return new Response("OK");
          }

          // =========================
          // UNHALF
          // =========================

          if (text === "/unhalf") {
            await env.DB.prepare(`
              UPDATE user_settings
              SET half = 0
              WHERE user_id = ?
            `)
              .bind(targetId)
              .run();

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              `⬆️ حالت نصف برای ${targetName} حذف شد.`
            );

            return new Response("OK");
          }

          // =========================
          // STATUS
          // =========================

          if (text === "/status") {
            const settings = await env.DB.prepare(`
              SELECT vip, half, muted_until
              FROM user_settings
              WHERE user_id = ?
            `)
              .bind(targetId)
              .first();

            let status =
              `👤 وضعیت ${targetName}\n\n`;

            status += settings && settings.vip
              ? "👑 VIP: فعال\n"
              : "👑 VIP: خاموش\n";

            status += settings && settings.half
              ? "⬇️ نصف امتیاز: فعال\n"
              : "⬆️ نصف امتیاز: خاموش\n";

            if (settings && settings.muted_until === -1) {
              status += "🔇 Mute: فعال تا /unmute\n";
            } else {
              status += "🔊 Mute: خاموش\n";
            }

            await sendMessage(
              env.BOT_TOKEN,
              chatId,
              status
            );

            return new Response("OK");
          }
        }

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

          let leaderboard =
            "🏆 رتبه بندی خواهان کیر\n\n";

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
        // BOMB — ONCE PER DAY
        // =========================

        if (text === BOMB_WORD) {
          const now = Date.now();

          const bombClaim =
            await env.DB.prepare(`
              SELECT claimed_at
              FROM bomb_claims
              WHERE user_id = ?
            `)
              .bind(userId)
              .first();

          if (bombClaim) {
            const elapsed =
              now - bombClaim.claimed_at;

            if (elapsed < BOMB_COOLDOWN) {
              const remaining =
                BOMB_COOLDOWN - elapsed;

              const hours = Math.floor(
                remaining / (60 * 60 * 1000)
              );

              const minutes = Math.ceil(
                (remaining % (60 * 60 * 1000)) / 60000
              );

              let waitText = "";

              if (hours > 0) {
                waitText += `${hours} ساعت`;
              }

              if (minutes > 0) {
                if (waitText) {
                  waitText += " و ";
                }

                waitText += `${minutes} دقیقه`;
              }

              await sendMessage(
                env.BOT_TOKEN,
                chatId,
                `💣 ${name}، امروز بمب کیر را استفاده کرده‌ای!\n` +
                `⏳ ${waitText} دیگر می‌توانی دوباره استفاده کنی.`
              );

              return new Response("OK");
            }

            await env.DB.prepare(`
              UPDATE bomb_claims
              SET claimed_at = ?
              WHERE user_id = ?
            `)
              .bind(now, userId)
              .run();
          } else {
            await env.DB.prepare(`
              INSERT INTO bomb_claims
              (user_id, claimed_at)
              VALUES (?, ?)
            `)
              .bind(userId, now)
              .run();
          }

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
            const newScore =
              player.score + 100;

            await env.DB.prepare(`
              UPDATE scores
              SET name = ?, score = ?, last_score_at = ?
              WHERE user_id = ?
            `)
              .bind(name, newScore, now, userId)
              .run();
          }

          const updatedPlayer =
            await env.DB.prepare(`
              SELECT score
              FROM scores
              WHERE user_id = ?
            `)
              .bind(userId)
              .first();

          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `💣 ${name}، ۱۰۰ امتیاز گرفتی!\n` +
            `📊 امتیازات: ${updatedPlayer.score}\n` +
            `⏳ بمب کیر دوباره ۲۴ ساعت دیگر قابل استفاده است.`
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

        // =========================
        // USER SETTINGS
        // =========================

        const settings = await env.DB.prepare(`
          SELECT vip, half, muted_until
          FROM user_settings
          WHERE user_id = ?
        `)
          .bind(userId)
          .first();

        const isVip =
          settings && settings.vip === 1;

        const isHalf =
          settings && settings.half === 1;

        const mutedUntil =
          settings ? settings.muted_until : 0;

        // =========================
        // MUTE CHECK
        // =========================

        if (mutedUntil === -1) {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            `🔇 ${name}، فعلاً امکان گرفتن امتیاز نداری.\n` +
            `این میوت تا زمانی که ادمین /unmute نکند فعال است.`
          );

          return new Response("OK");
        }

        // =========================
        // VIP / HALF POINTS
        // =========================

        if (isVip) {
          points *= 2;
        }

        if (isHalf) {
          points /= 2;
        }

        // =========================
        // PLAYER
        // =========================

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

        let effectiveCooldown = COOLDOWN;

        if (isVip) {
          effectiveCooldown = COOLDOWN / 2;
        }

        if (player) {
          const elapsed =
            now - player.last_score_at;

          if (elapsed < effectiveCooldown) {
            const remaining =
              effectiveCooldown - elapsed;

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

        const newScore =
          player.score + points;

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

// =========================
// SEND MESSAGE
// =========================

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
