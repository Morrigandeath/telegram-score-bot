import time

from telegram import Update
from telegram.ext import (
    Application,
    MessageHandler,
    ContextTypes,
    filters,
)

# =========================
# BOT SETTINGS
# =========================

TOKEN = "8889103466:AAHv8ti3civyOd8IhOSrM7Bd0lFaLtEa6Ro"

# Change this whenever you want
SCORE_WORD = "I want wood"

# 2 minutes = 120 seconds
COOLDOWN = 120


# =========================
# DATA
# =========================

scores = {}
last_score_time = {}


# =========================
# MESSAGE HANDLER
# =========================

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


# =========================
# START BOT
# =========================

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


if __name__ == "__main__":
    main()
