import time

from telegram import Update
from telegram.ext import (
Application,
MessageHandler,
ContextTypes,
filters,
)

=========================

BOT SETTINGS

=========================

TOKEN = "YOUR_BOT_TOKEN_HERE"

Change this whenever you want

SCORE_WORD = "I want wood"

2 minutes = 120 seconds

COOLDOWN = 120

=========================

DATA

=========================

scores = {}
last_score_time = {}

=========================

MESSAGE HANDLER

=========================

async def handle_message(
update: Update,
context: ContextTypes.DEFAULT_TYPE
):
if not update.message or not update.message.text:
return

text = update.message.text.strip()  

# Ignore messages that are not the score word  
if text != SCORE_WORD:  
    return  

user = update.effective_user  
user_id = user.id  
now = time.time()  

# Check the 2-minute cooldown  
if user_id in last_score_time:  

    elapsed = now - last_score_time[user_id]  

    if elapsed < COOLDOWN:  

        remaining = int(COOLDOWN - elapsed)  

        minutes = remaining // 60  
        seconds = remaining % 60  

        await update.message.reply_text(  
            f"⏳ {user.first_name}, "  
            f"you need to wait "  
            f"{minutes}m {seconds}s "  
            f"before getting another point."  
        )  

        return  

# Give the user one point  
scores[user_id] = scores.get(user_id, 0) + 1  

last_score_time[user_id] = now  

await update.message.reply_text(  
    f"✅ {user.first_name} got 1 point!\n"  
    f"🏆 Your score: {scores[user_id]}"  
)

=========================

START BOT

=========================

def main():

app = Application.builder().token(TOKEN).build()  

app.add_handler(  
    MessageHandler(  
        filters.TEXT & ~filters.COMMAND,  
        handle_message  
    )  
)  

print("Bot is running...")  

app.run_polling()

if name == "main":
main()

    const userId = String(user.id);  
    const name = user.first_name || "Player";  
    const now = Date.now();  

    // Get player  
    const player = await env.DB.prepare(  
      SELECT score, last_score_at  
      FROM scores  
      WHERE user_id = ?  
    )  
      .bind(userId)  
      .first();  

    // Cooldown  
    if (player && now - player.last_score_at < COOLDOWN) {  
      const remaining = COOLDOWN - (now - player.last_score_at);  

      const minutes = Math.floor(remaining / 60000);  
      const seconds = Math.ceil((remaining % 60000) / 1000);  

      await sendMessage(  
        env.BOT_TOKEN,  
        message.chat.id,  
        ⏳ ${name}, wait ${minutes}m ${seconds}s before getting another point.  
      );  

      return new Response("OK");  
    }  

    // New player  
    if (!player) {  
      await env.DB.prepare(  
        INSERT INTO scores (user_id, name, score, last_score_at)  
        VALUES (?, ?, 1, ?)  
      )  
        .bind(userId, name, now)  
        .run();  

      await sendMessage(  
        env.BOT_TOKEN,  
        message.chat.id,  
        ✅ ${name} got 1 point!\n🏆 Your score: 1  
      );  
    }  

    // Existing player  
    else {  
      const newScore = player.score + 1;  

      await env.DB.prepare(  
        UPDATE scores  
        SET name = ?, score = ?, last_score_at = ?  
        WHERE user_id = ?  
      )  
        .bind(name, newScore, now, userId)  
        .run();  

      await sendMessage(  
        env.BOT_TOKEN,  
        message.chat.id,  
        ✅ ${name} got 1 point!\n🏆 Your score: ${newScore}  
      );  
    }  

    return new Response("OK");  
  }  

  return new Response("Not found", { status: 404 });  

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
