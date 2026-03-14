const { EventEmitter } = require('events');

class EscrowMonitor extends EventEmitter {
  constructor(config, agent) {
    super();
    this.config = config;
    this.agent = agent;
    this.pollInterval = 12000; // 2 blocks
  }

  start() {
    console.log('[EscrowMonitor] Polling CKB escrow address every 12s');
    this._poll();
    setInterval(() => this._poll(), this.pollInterval);
  }

  async _poll() {
    // TODO: Query CKB RPC for deposits to escrow address
    // Emit 'deposit' event when new entry fee detected
  }
}

module.exports = EscrowMonitor;
