'use strict';

/**
 * Prints the chat id(s) your bot can reach, so you can fill in
 * TELEGRAM_CHAT_ID.
 *
 *   1. Create a bot: message @BotFather → /newbot → copy the token
 *   2. Put TELEGRAM_BOT_TOKEN=... in server/.env
 *   3. Open your new bot in Telegram and send it any message ("hi")
 *   4. npm run telegram:id
 *
 * Step 3 is not optional: bots cannot open a conversation with you, so until
 * you message it first there is nothing for getUpdates to return.
 *
 * Reads process.env directly rather than src/config/env — that module refuses
 * to boot when 'telegram' is enabled without a chat id, which is exactly the
 * situation you are in while running this.
 */

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

async function main() {
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set in server/.env');
    process.exit(1);
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const payload = await response.json();

  if (!payload.ok) {
    console.error(`Telegram rejected the request: ${payload.description}`);
    console.error('A 401 here means the token is wrong — recheck it with @BotFather.');
    process.exit(1);
  }

  // A chat can appear in many updates; collapse to one row each.
  const chats = new Map();
  for (const update of payload.result) {
    const chat = (update.message || update.channel_post || {}).chat;
    if (chat) chats.set(chat.id, chat);
  }

  if (chats.size === 0) {
    console.log('No messages found.');
    console.log('Send your bot a message in Telegram, then run this again.');
    console.log('(Telegram only retains recent updates, so do it within 24h.)');
    return;
  }

  console.log('Found these chats — copy the id you want into TELEGRAM_CHAT_ID:\n');
  for (const chat of chats.values()) {
    const who = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ');
    console.log(`  TELEGRAM_CHAT_ID=${chat.id}    (${chat.type}: ${who || 'unnamed'})`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
