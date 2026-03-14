#!/usr/bin/env node
/**
 * FiberQuest Agent
 * 
 * Responsibilities:
 * - Monitor CKB escrow address for entry fee deposits
 * - Watch tournament cutoff blocks → publish results to chain
 * - Run game validators (calls NucBox Ollama for inference)
 * - Manage Fiber payment channels → settle winners
 * - Auto-approve/reject payouts based on validator output
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { EventEmitter } = require('events');

const EscrowMonitor = require('./escrow-monitor');
const TournamentManager = require('./tournament-manager');
const GameValidator = require('./game-validator');
const FiberSettlement = require('./fiber-settlement');
const Database = require('./database');

class FiberQuestAgent extends EventEmitter {
  constructor() {
    super();
    this.config = {
      ckbRpc: process.env.CKB_RPC_URL || 'https://testnet.ckb.dev',
      fiberRpc: process.env.FIBER_RPC_URL || 'http://192.168.68.79:8227',
      ollama: process.env.OLLAMA_URL || 'http://192.168.68.79:11434',
      escrowAddress: process.env.CKB_ESCROW_ADDRESS,
      escrowPrivateKey: process.env.CKB_ESCROW_PRIVATE_KEY,
      port: process.env.AGENT_PORT || 3001,
    };

    this.db = new Database();
    this.escrowMonitor = new EscrowMonitor(this.config, this);
    this.tournamentManager = new TournamentManager(this.config, this);
    this.validator = new GameValidator(this.config, this);
    this.settlement = new FiberSettlement(this.config, this);
  }

  async initialize() {
    console.log('[Agent] Initializing FiberQuest Agent...');
    
    await this.db.init();
    console.log('[Agent] Database initialized');

    // Verify escrow address
    if (!this.config.escrowAddress || !this.config.escrowPrivateKey) {
      throw new Error('Missing CKB_ESCROW_ADDRESS or CKB_ESCROW_PRIVATE_KEY');
    }

    // Verify Ollama connectivity
    try {
      await axios.get(`${this.config.ollama}/api/tags`);
      console.log('[Agent] ✅ Ollama connected at', this.config.ollama);
    } catch (e) {
      throw new Error(`Cannot reach Ollama at ${this.config.ollama}: ${e.message}`);
    }

    console.log('[Agent] Ready. Escrow address:', this.config.escrowAddress);
  }

  async start() {
    await this.initialize();

    // Start monitors
    this.escrowMonitor.start();
    this.tournamentManager.start();

    // HTTP server for health checks + RPC
    const app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });

    app.get('/status', (req, res) => {
      res.json({
        escrow: this.config.escrowAddress,
        ollama: this.config.ollama,
        uptime: process.uptime(),
        tournaments: this.tournamentManager.activeTournaments.size,
      });
    });

    // Tournament RPC endpoints
    app.post('/rpc/validate-game', async (req, res) => {
      try {
        const { gameId, playerData, ramDump } = req.body;
        const result = await this.validator.validate(gameId, playerData, ramDump);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post('/rpc/settle-winner', async (req, res) => {
      try {
        const { tournamentId, winnerId, prizeAmount } = req.body;
        const txHash = await this.settlement.settleWinner(tournamentId, winnerId, prizeAmount);
        res.json({ txHash });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.listen(this.config.port, () => {
      console.log(`[Agent] HTTP server listening on port ${this.config.port}`);
    });
  }
}

// Run agent
const agent = new FiberQuestAgent();
agent.start().catch(err => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});

module.exports = FiberQuestAgent;
