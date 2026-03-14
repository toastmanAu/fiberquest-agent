/**
 * CKB RPC Client
 * 
 * Monitors escrow address for deposits
 * Publishes tournament results to chain
 */

const axios = require('axios');

class CKBClient {
  constructor(config) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.ckbRpc,
      timeout: 10000,
    });
    this.lastSyncBlock = null;
  }

  async getBlockNumber() {
    try {
      const res = await this.client.post('/', {
        jsonrpc: '2.0',
        id: 1,
        method: 'get_tip_block_number',
        params: [],
      });
      return res.data.result;
    } catch (e) {
      console.error('[CKB] get_block_number error:', e.message);
      throw e;
    }
  }

  /**
   * Get transactions to escrow address
   */
  async getEscrowTransactions(fromBlock, toBlock) {
    try {
      // TODO: Query for transactions with outputs to escrow address
      // This requires either Indexer RPC or parsing block data
      console.log(`[CKB] Scanning blocks ${fromBlock} to ${toBlock} for deposits to ${this.config.escrowAddress}`);
      
      return [];
    } catch (e) {
      console.error('[CKB] getEscrowTransactions error:', e.message);
      throw e;
    }
  }

  /**
   * Detect new deposits since last check
   */
  async pollForDeposits() {
    try {
      const currentBlock = await this.getBlockNumber();
      
      if (!this.lastSyncBlock) {
        this.lastSyncBlock = parseInt(currentBlock, 16) - 1;
      }

      const fromBlock = this.lastSyncBlock + 1;
      const toBlock = parseInt(currentBlock, 16);

      if (fromBlock > toBlock) {
        return []; // No new blocks
      }

      const deposits = await this.getEscrowTransactions(fromBlock, toBlock);
      this.lastSyncBlock = toBlock;

      return deposits;
    } catch (e) {
      console.error('[CKB] pollForDeposits error:', e.message);
      return [];
    }
  }

  /**
   * Send a transaction (settlement payout)
   */
  async sendTransaction(tx) {
    try {
      const res = await this.client.post('/', {
        jsonrpc: '2.0',
        id: 1,
        method: 'send_transaction',
        params: [tx],
      });
      return res.data.result;
    } catch (e) {
      console.error('[CKB] sendTransaction error:', e.message);
      throw e;
    }
  }
}

module.exports = CKBClient;
