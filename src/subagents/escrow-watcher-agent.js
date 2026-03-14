/**
 * Escrow Watcher Subagent
 * 
 * Accessible to: Kernel (assistant) + Phill (user)
 * Task: Monitor CKB escrow address for deposits
 * 
 * Workflow:
 * 1. Poll CKB RPC every 12 seconds (2 blocks)
 * 2. Detect new deposits to escrow address
 * 3. Trigger tournament creation
 * 4. Report back to main orchestrator
 */

const axios = require('axios');

class EscrowWatcherAgent {
  constructor() {
    this.ckb = axios.create({
      baseURL: process.env.CKB_RPC_URL || 'https://testnet.ckb.dev',
    });
    this.lastBlock = null;
  }

  async start() {
    console.log('[EscrowWatcher] Starting escrow monitor');
    setInterval(() => this._poll(), 12000);
  }

  async _poll() {
    try {
      // Get current block
      // TODO: Query CKB RPC for deposits to escrow address
      // Emit event when new deposits detected
    } catch (e) {
      console.error('[EscrowWatcher] Poll error:', e.message);
    }
  }
}

if (require.main === module) {
  const agent = new EscrowWatcherAgent();
  agent.start();
}

module.exports = EscrowWatcherAgent;
