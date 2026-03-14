#!/usr/bin/env node
/**
 * FiberQuest Agent (Main Orchestrator)
 * 
 * Spawns specialized subagents:
 * - EscrowWatcher: Monitors CKB deposits, triggers tournaments
 * - GameValidator: Validates game results via Ollama reasoning
 * - SettlementHandler: Manages Fiber channels, settles winners
 * - TournamentOrchestrator: Coordinates state, resolves disputes
 * 
 * Hardware:
 * - CKB RPC polling (deposits)
 * - Ollama inference (NucBox)
 * - Fan control: managed by fiberquest-fan.service (systemd)
 * 
 * Accessible via: @OcRyzesBot (Telegram) + HTTP API
 * Collaborative: Kernel (assistant) + Phill (user) can guide
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { EventEmitter } = require('events');

const CKBClient = require('./ckb-client');
const TelegramHandler = require('./telegram-handler');
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
    this.ckb = new CKBClient(this.config);
    this.telegram = new TelegramHandler(this.config);
    this.subagents = new Map();
    this.workQueue = [];
    this.startTime = Date.now();
  }

  async initialize() {
    console.log('[FiberQuest] Initializing main orchestrator...');
    
    await this.db.init();
    console.log('[FiberQuest] Database initialized');

    // Verify escrow address
    if (!this.config.escrowAddress || !this.config.escrowPrivateKey) {
      throw new Error('Missing CKB_ESCROW_ADDRESS or CKB_ESCROW_PRIVATE_KEY');
    }

    // Verify Ollama connectivity
    try {
      await axios.get(`${this.config.ollama}/api/tags`);
      console.log('[FiberQuest] ✅ Ollama connected at', this.config.ollama);
    } catch (e) {
      throw new Error(`Cannot reach Ollama at ${this.config.ollama}: ${e.message}`);
    }

    // Verify CKB RPC
    try {
      const blockNum = await this.ckb.getBlockNumber();
      console.log('[FiberQuest] ✅ CKB RPC connected, block:', blockNum);
    } catch (e) {
      throw new Error(`Cannot reach CKB RPC: ${e.message}`);
    }

    console.log('[FiberQuest] Ready. Escrow:', this.config.escrowAddress);
  }

  async startDepositPolling() {
    console.log('[FiberQuest] Starting CKB deposit polling...');
    setInterval(async () => {
      try {
        const deposits = await this.ckb.pollForDeposits();
        if (deposits.length > 0) {
          console.log(`[FiberQuest] 🔔 Detected ${deposits.length} new deposits`);
          this.emit('deposits', deposits);
        }
      } catch (e) {
        console.error('[FiberQuest] Polling error:', e.message);
      }
    }, 12000); // Poll every 2 blocks (~12 seconds)
  }

  async start() {
    await this.initialize();
    this.startDepositPolling();

    // HTTP server
    const app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        escrow: this.config.escrowAddress,
      });
    });

    app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        escrow: this.config.escrowAddress,
        ollama: this.config.ollama,
        ckb: this.config.ckbRpc,
        workQueueSize: this.workQueue.length,
        subagents: Array.from(this.subagents.keys()),
      });
    });

    // Telegram webhook
    app.post('/telegram', async (req, res) => {
      try {
        const result = await this.telegram.handleWebhook(req.body);
        res.json(result || { ok: false });
      } catch (e) {
        console.error('[FiberQuest] Telegram handler error:', e.message);
        res.status(500).json({ error: e.message });
      }
    });

    // Queue validation
    app.post('/queue/validate-game', async (req, res) => {
      try {
        const { gameId, playerData, ramDump } = req.body;
        const taskId = `val-${Date.now()}`;
        
        this.workQueue.push({ type: 'validate', taskId, gameId, playerData, ramDump });
        console.log(`[FiberQuest] Queued validation: ${taskId}`);
        
        res.json({ taskId, queued: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Queue settlement
    app.post('/queue/settle-winner', async (req, res) => {
      try {
        const { tournamentId, winnerId, prizeAmount } = req.body;
        const taskId = `settle-${Date.now()}`;
        
        this.workQueue.push({ type: 'settle', taskId, tournamentId, winnerId, prizeAmount });
        console.log(`[FiberQuest] Queued settlement: ${taskId}`);
        
        res.json({ taskId, queued: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.listen(this.config.port, () => {
      console.log(`[FiberQuest] HTTP server listening on port ${this.config.port}`);
      console.log(`[FiberQuest] Telegram webhook: /telegram`);
      console.log(`[FiberQuest] Ready for work. @OcRyzesBot is now live.`);
    });
  }
}

// Run agent
const agent = new FiberQuestAgent();
agent.start().catch(err => {
  console.error('[FiberQuest] Fatal error:', err);
  process.exit(1);
});

module.exports = FiberQuestAgent;

// Run agent
const agent = new FiberQuestAgent();
agent.start().catch(err => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});

module.exports = FiberQuestAgent;
