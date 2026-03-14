/**
 * Tournament Entry Handler
 * 
 * Processes player entries:
 * 1. Detects CKB deposits to escrow address (via CKBClient polling)
 * 2. Extracts tournament ID from transaction data field
 * 3. Creates tournament_players record
 * 4. Emits event to TournamentOrchestrator (once enough players join)
 */

const { EventEmitter } = require('events');

class EntryHandler extends EventEmitter {
  constructor(config, db, ckb) {
    super();
    this.config = config;
    this.db = db;
    this.ckb = ckb;
    this.processedTxs = new Set();
  }

  /**
   * Handle incoming CKB deposit
   * 
   * Transaction structure:
   * {
   *   hash: "0x...",
   *   inputs: [...],
   *   outputs: [
   *     {
   *       capacity: "1000000000" (10 CKB),
   *       lock: "...",
   *       type: null,
   *       data: "INV-2026-0042" OR "0x494e562d3230323630303432"  (tournament ID)
   *     }
   *   ],
   *   outputsData: ["0x..."],
   *   blockNumber: 1234567
   * }
   */
  async processDeposit(tx) {
    const txHash = tx.hash;
    
    // Skip if already processed
    if (this.processedTxs.has(txHash)) {
      return null;
    }

    try {
      // Find output with data field (tournament ID)
      const outputWithData = tx.outputs.findIndex(out => {
        const data = tx.outputsData?.[tx.outputs.indexOf(out)];
        return data && data !== '0x';
      });

      if (outputWithData === -1) {
        console.log(`[Entry] ${txHash.substring(0, 10)}... has no data field, skipping`);
        return null;
      }

      // Extract tournament ID from data field
      const rawData = tx.outputsData[outputWithData];
      const tournamentId = this._decodeData(rawData);

      // Extract player address from input
      const playerId = tx.inputs[0]?.previous_output?.tx_hash; // Simplified; real logic uses lock script
      const amount = BigInt(tx.outputs[outputWithData].capacity);

      console.log(`[Entry] Deposit detected: ${playerId.substring(0, 10)}... → Tournament ${tournamentId} | ${(amount / BigInt(1e8)).toString()} CKB`);

      // Verify tournament exists
      const tournament = await this.db.get(
        'SELECT * FROM tournaments WHERE id = ?',
        [tournamentId]
      );

      if (!tournament) {
        console.error(`[Entry] Tournament ${tournamentId} not found`);
        return null;
      }

      // Verify entry fee matches
      if (amount !== BigInt(tournament.entryFee)) {
        console.error(`[Entry] Entry fee mismatch: ${amount} != ${tournament.entryFee}`);
        return null;
      }

      // Create escrow transaction record
      await this.db.run(
        `INSERT INTO escrow_transactions (txHash, playerId, amount, tournamentId, status, blockNumber)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [txHash, playerId, amount.toString(), tournamentId, 'pending', tx.blockNumber]
      );

      // Create tournament_players record
      const playerEntryId = `entry-${txHash.substring(0, 20)}-${Date.now()}`;
      await this.db.run(
        `INSERT INTO tournament_players (id, tournamentId, playerId, escrowTxHash, status)
         VALUES (?, ?, ?, ?, ?)`,
        [playerEntryId, tournamentId, playerId, txHash, 'joined']
      );

      this.processedTxs.add(txHash);

      // Check if tournament is ready to start
      const playerCount = await this.db.get(
        'SELECT COUNT(*) as count FROM tournament_players WHERE tournamentId = ? AND status = ?',
        [tournamentId, 'joined']
      );

      if (playerCount.count >= tournament.minPlayers) {
        console.log(`[Entry] Tournament ${tournamentId} has ${playerCount.count} players, ready to start`);
        this.emit('tournament-ready', {
          tournamentId,
          playerCount: playerCount.count,
          maxPlayers: tournament.maxPlayers,
        });
      }

      return {
        tournamentId,
        playerId,
        playerEntryId,
        amount: amount.toString(),
        blockNumber: tx.blockNumber,
      };
    } catch (e) {
      console.error(`[Entry] Error processing deposit ${txHash}:`, e.message);
      return null;
    }
  }

  /**
   * Decode tournament ID from transaction data field
   * Handles both hex (0x-prefixed) and UTF-8 strings
   */
  _decodeData(hexData) {
    if (!hexData) return null;

    try {
      // Remove 0x prefix if present
      const clean = hexData.startsWith('0x') ? hexData.slice(2) : hexData;

      // Try to decode as UTF-8
      const bytes = Buffer.from(clean, 'hex');
      const str = bytes.toString('utf8');

      // Validate tournament ID format (e.g., "INV-2026-0042")
      if (/^[A-Z0-9\-]{5,32}$/.test(str)) {
        return str;
      }

      // Fallback to hex
      return hexData;
    } catch (e) {
      return hexData;
    }
  }

  /**
   * Poll for deposits and process them
   */
  async startPolling(pollIntervalMs = 12000) {
    console.log('[Entry] Starting deposit polling...');
    
    setInterval(async () => {
      try {
        const deposits = await this.ckb.pollForDeposits();
        
        for (const deposit of deposits) {
          const result = await this.processDeposit(deposit);
          if (result) {
            console.log(`[Entry] ✅ Processed: ${result.playerEntryId}`);
          }
        }
      } catch (e) {
        console.error('[Entry] Polling error:', e.message);
      }
    }, pollIntervalMs);
  }
}

module.exports = EntryHandler;
