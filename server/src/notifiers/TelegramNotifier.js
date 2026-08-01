'use strict';

const Notifier = require('./Notifier');
const { postJson } = require('./http');
const { telegramHtml } = require('./templates');

const API_BASE = 'https://api.telegram.org';

/**
 * Push to a phone, for free, with no account beyond a Telegram one.
 *
 * Setup is two steps: talk to @BotFather to create a bot and get its token,
 * then send that bot a message and run `npm run telegram:id` to read back the
 * chat id. A bot cannot start a conversation with you — you must message it
 * first — which is the single most common reason a correct-looking token still
 * yields "chat not found".
 *
 * Limits are 30 messages/second globally and 1/second per chat. An uptime
 * monitor emits alerts on state transitions only, so this is never close.
 */
class TelegramNotifier extends Notifier {
  constructor({ botToken, chatId, timeoutMs = 10000 }) {
    super('telegram');
    this.botToken = botToken;
    this.chatId = chatId;
    this.timeoutMs = timeoutMs;
  }

  async send(payload) {
    await postJson(`${API_BASE}/bot${this.botToken}/sendMessage`, {
      timeoutMs: this.timeoutMs,
      body: {
        chat_id: this.chatId,
        text: telegramHtml(payload),
        parse_mode: 'HTML',
        // The alert is the point; a link card for a downed site is noise.
        disable_web_page_preview: true,
      },
    });
  }
}

module.exports = TelegramNotifier;
