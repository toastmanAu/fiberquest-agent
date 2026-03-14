/**
 * Telegram Bot Handler
 * 
 * Listens for webhook from @OcRyzesBot
 * Commands:
 * - /status: Agent status
 * - /validate <gameId> <playerId>: Queue validation
 * - /settle <tournamentId> <winnerId> <amount>: Queue settlement
 * 
 * Both Kernel (me) and Phill can interact
 */

const axios = require('axios');

class TelegramHandler {
  constructor(config) {
    this.config = config;
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.telegramAPI = `https://api.telegram.org/bot${this.botToken}`;
    
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not set');
    }
  }

  /**
   * Handle incoming webhook from Telegram
   */
  async handleWebhook(update) {
    console.log('[Telegram] Received update:', update.update_id);

    if (!update.message) return null;

    const { message } = update;
    const { chat, text, from } = message;

    console.log(`[Telegram] ${from.username || from.id}: ${text}`);

    // Parse command
    const [cmd, ...args] = text.split(' ');

    let reply = '';

    switch (cmd) {
      case '/status':
        reply = await this._handleStatus();
        break;
      case '/validate':
        if (args.length < 2) {
          reply = '❌ Usage: /validate <gameId> <playerId>';
        } else {
          reply = await this._handleValidate(args[0], args[1]);
        }
        break;
      case '/settle':
        if (args.length < 3) {
          reply = '❌ Usage: /settle <tournamentId> <winnerId> <amount>';
        } else {
          reply = await this._handleSettle(args[0], args[1], args[2]);
        }
        break;
      default:
        reply = '🎮 FiberQuest Agent\n\nCommands:\n/status - Agent status\n/validate <gameId> <playerId> - Queue validation\n/settle <tournamentId> <winnerId> <amount> - Queue settlement';
    }

    // Send reply
    await this.sendMessage(chat.id, reply);
    return { ok: true };
  }

  async _handleStatus() {
    // TODO: Call agent /status endpoint
    return '✅ Agent running\n📊 Status TBD';
  }

  async _handleValidate(gameId, playerId) {
    // TODO: POST to agent /queue/validate-game
    return `📋 Queued validation for ${gameId} / ${playerId}`;
  }

  async _handleSettle(tournamentId, winnerId, amount) {
    // TODO: POST to agent /queue/settle-winner
    return `💰 Queued settlement: ${winnerId} gets ${amount} CKB`;
  }

  /**
   * Send Telegram message
   */
  async sendMessage(chatId, text) {
    try {
      await axios.post(`${this.telegramAPI}/sendMessage`, {
        chat_id: chatId,
        text,
      });
    } catch (e) {
      console.error('[Telegram] sendMessage error:', e.message);
    }
  }
}

module.exports = TelegramHandler;
