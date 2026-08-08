import os
import time
import sqlite3

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# =========================
# BOT SETTINGS
# =========================

TOKEN = os.environ.get("BOT_TOKEN", "")

SCORE_WORD = "I want wood"
COOLDOWN = 120  # 2 minutes

DATABASE = "scores.db"


# =========================
# DATABASE
# =========================

def init_database():
    conn = sqlite3.connect(DATABASE)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            user_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            last_score_at REAL NOT NULL DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()


def get_player(user_id):
    conn = sqlite3.connect(DATABASE)

    row = conn.execute("""
        SELECT user_id, name, score, last_score_at
        FROM scores
        WHERE user_id = ?
    """, (user_id,)).fetchone()

    conn.close()
    return row


def add_point(user_id, name):
    conn = sqlite3.connect(DATABASE)

    row = conn.execute("""
        SELECT score
        FROM scores
        WHERE user_id = ?
    """, (user_id,)).fetchone()

    now = time.time()

    if row is None:
        score = 1

        conn.execute("""
            INSERT INTO scores
            (user_id, name, score, last_score_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, name, score, now))

    else:
        score = row[0] + 1

        conn.execute("""
            UPDATE scores
            SET name = ?, score = ?, last_score_at = ?
            WHERE user_id = ?
        """, (name, score, now, user_id))

    conn.commit()
    conn.close()

    return score


# =========================
# SCORE MESSAGE
# =========================

async def handle_message(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):
    if not update.message or not update.message.text:
        return

    text = update.message.text.strip()

    if text != SCORE_WORD:
        return

    user = update.effective_user

    if not user:
        return

    user_id = user.id
    name = user.first_name or "Player"

    now = time.time()
    player = get_player(user_id)

    # 2-minute cooldown
    if player:
        last_score_at = player[3]
        elapsed = now - last_score_at

        if elapsed < COOLDOWN:
            remaining = int(COOLDOWN - elapsed)

            minutes = remaining // 60
            seconds = remaining % 60

            await update.message.reply_text(
                f"⏳ {name}, you need to wait "
                f"{minutes}m {seconds}s "
                f"before getting another point."
            )

            return

    score = add_point(user_id, name)

    await update.message.reply_text(
        f"✅ {name} got 1 point!\n"
        f"🏆 Your score: {score}"
    )


# =========================
# LEADERBOARD
# =========================

async def leaderboard(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):
    conn = sqlite3.connect(DATABASE)

    players = conn.execute("""
        SELECT name, score
        FROM scores
        ORDER BY score DESC, name ASC
        LIMIT 10
    """).fetchall()

    conn.close()

    if not players:
        await update.message.reply_text(
            "🏆 The leaderboard is empty."
        )
        return

    text = "🏆 LEADERBOARD\n\n"

    for index, (name, score) in enumerate(players, start=1):
        text += f"{index}. {name} — {score}\n"

    await update.message.reply_text(text)


# =========================
# START
# =========================

async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):
    await update.message.reply_text(
        "👋 Welcome!\n\n"
        f"Send `{SCORE_WORD}` to get a point.\n"
        "⏳ You can get one point every 2 minutes.\n\n"
        "🏆 Use /leaderboard to see the top players."
    )


# =========================
# MAIN
# =========================

def main():
    if not TOKEN:
        raise RuntimeError(
            "BOT_TOKEN environment variable is missing."
        )

    init_database()

    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("leaderboard", leaderboard))
    app.add_handler(CommandHandler("top", leaderboard))

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
    
