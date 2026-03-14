/**
 * Fiber Settlement Handler
 * 
 * Manages payment channels and winner payouts:
 * 1. Creates Fiber channel between agent and game validator
 * 2. Transfers prize to winner via channel payment
 * 3. Settles channel (closes it, finalizes on-chain)
 * 4. Records settlement for audit trail
 */

const axios = require('axios');

class FiberSettler {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this.fiberClient = axios.create({
      baseURL: config.fiberRpc,
      timeout: 30000,
    });
    this.channels = new Map(); // channelId → {state, balance}
  }

  /**
   * Create a new Fiber channel for settlement
   * 
   * Channel flow:
   * 1. Agent creates channel with winner's address
   * 2. Agent deposits prize amount
   * 3. Agent adds payment to channel (updates state)
   * 4. Winner accepts settlement (signs accept packet)
   * 5. Channel closes (on-chain settlement)
   */
  async createChannel(tournamentId, winnerId, prizeAmount) {
    console.log(`[Settler] Creating Fiber channel for ${winnerId} | ${prizeAmount} CKB`);

    try {
      // Step 1: Open channel with Fiber RPC
      const openReq = {
        remote_pubkey: winnerId, // Winner's public key
        funding_amount: prizeAmount, // Prize amount
        push_amount: prizeAmount, // Full amount goes to winner
      };

      const openRes = await this.fiberClient.post('/open_channel', openReq);
      const channelId = openRes.data.channel_id;
      const channelState = openRes.data.state;

      console.log(`[Settler] ✅ Channel opened: ${channelId} | State: ${channelState}`);

      // Step 2: Record channel in database
      await this.db.run(
        `INSERT INTO fiber_channels (id, tournamentId, winnerId, amount, channelState, status, channelTxHash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [channelId, tournamentId, winnerId, prizeAmount, JSON.stringify(channelState), 'open', openRes.data.funding_tx]
      );

      // Store in memory for fast lookups
      this.channels.set(channelId, {
        winnerId,
        prizeAmount,
        state: channelState,
        sequenceNum: 0,
      });

      return {
        channelId,
        status: 'open',
        fundingTx: openRes.data.funding_tx,
      };
    } catch (e) {
      console.error(`[Settler] Channel creation failed:`, e.message);
      throw e;
    }
  }

  /**
   * Send payment via Fiber channel
   * Updates channel state, increments sequence number
   */
  async sendPayment(channelId, amount) {
    console.log(`[Settler] Sending ${amount} CKB via channel ${channelId.substring(0, 16)}...`);

    try {
      const channel = this.channels.get(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found in memory`);
      }

      // Build payment update
      const sequenceNum = channel.sequenceNum + 1;
      const paymentReq = {
        channel_id: channelId,
        amount,
        sequence: sequenceNum,
      };

      // Sign the payment (agent's private key)
      // Real implementation would use crypto.sign() with agent's key
      const signature = Buffer.from(
        require('crypto').randomBytes(64) // Placeholder
      ).toString('hex');

      paymentReq.signature = signature;

      // Submit to Fiber
      const payRes = await this.fiberClient.post('/update_channel', paymentReq);

      console.log(`[Settler] ✅ Payment sent via channel | Seq: ${sequenceNum}`);

      // Update in-memory state
      channel.sequenceNum = sequenceNum;
      channel.state = payRes.data.state;

      return {
        channelId,
        sequence: sequenceNum,
        amount,
        state: payRes.data.state,
      };
    } catch (e) {
      console.error(`[Settler] Payment failed:`, e.message);
      throw e;
    }
  }

  /**
   * Close/settle a Fiber channel
   * Finalizes on-chain, releases funds to winner
   */
  async settleChannel(channelId) {
    console.log(`[Settler] Settling channel ${channelId.substring(0, 16)}...`);

    try {
      const channel = this.channels.get(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      // Build settlement request
      const settleReq = {
        channel_id: channelId,
        final_state: channel.state,
        sequence: channel.sequenceNum,
      };

      // Sign settlement (agent's key)
      const signature = Buffer.from(
        require('crypto').randomBytes(64) // Placeholder
      ).toString('hex');

      settleReq.signature = signature;

      // Submit settlement
      const settleRes = await this.fiberClient.post('/close_channel', settleReq);

      console.log(`[Settler] ✅ Channel settled | TX: ${settleRes.data.settle_tx}`);

      // Update database
      await this.db.run(
        `UPDATE fiber_channels SET status = ?, settleTxHash = ?, settledAt = ?
         WHERE id = ?`,
        ['settled', settleRes.data.settle_tx, Math.floor(Date.now() / 1000), channelId]
      );

      // Remove from memory
      this.channels.delete(channelId);

      return {
        channelId,
        settleTx: settleRes.data.settle_tx,
        status: 'settled',
      };
    } catch (e) {
      console.error(`[Settler] Settlement failed:`, e.message);
      throw e;
    }
  }

  /**
   * Complete flow: open channel → send payment → settle
   */
  async settleTournament(tournamentId, winnerId, prizeAmount) {
    console.log(`[Settler] Starting settlement flow: ${winnerId} ← ${prizeAmount} CKB`);

    try {
      // 1. Create channel
      const channel = await this.createChannel(tournamentId, winnerId, prizeAmount);
      const channelId = channel.channelId;

      // 2. Send payment
      await this.sendPayment(channelId, prizeAmount);

      // 3. Settle (close channel)
      const settled = await this.settleChannel(channelId);

      console.log(`[Settler] ✅ Settlement complete: ${settlementId}`);

      return {
        tournamentId,
        winnerId,
        prizeAmount,
        channelId,
        settleTx: settled.settleTx,
        status: 'settled',
      };
    } catch (e) {
      console.error(`[Settler] Settlement flow failed:`, e.message);
      throw e;
    }
  }
}

module.exports = FiberSettler;
