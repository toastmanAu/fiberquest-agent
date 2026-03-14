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
 * Accessible to: Kernel (local assistant) + Phill (user)
 * Collaborative: Keep on track, intervene as needed
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { EventEmitter } = require('events');
const { sessions_spawn } = require('openclaw-sdk'); // Integration with OpenClaw

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
    this.subagents = new Map(); // Track spawned subagents
    this.workQueue = []; // Pending validation/settlement tasks
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

    console.log('[FiberQuest] Ready. Escrow:', this.config.escrowAddress);
  }

  async spawnSubagent(name, task) {
    console.log(`[FiberQuest] Spawning subagent: ${name}`);
    
    try {
      const subagent = await sessions_spawn({
        task,
        agentId: 'default',
        mode: 'session', // Persistent session
        label: `FiberQuest/${name}`,
      });

      this.subagents.set(name, subagent);
      console.log(`[FiberQuest] ✅ Subagent spawned: ${name}`);
      return subagent;
    } catch (e) {
      console.error(`[FiberQuest] Failed to spawn ${name}:`, e.message);
      throw e;
    }
  }

  async start() {
    await this.initialize();

    // Spawn persistent subagents
    await this.spawnSubagent('escrow-watcher', 'Monitor CKB escrow address for deposits and trigger tournaments');
    await this.spawnSubagent('game-validator', 'Validate game results using Ollama deepseek-r1:32b reasoning');
    await this.spawnSubagent('settlement-handler', 'Manage Fiber payment channels and settle winners');
    await this.spawnSubagent('tournament-orchestrator', 'Coordinate tournament state and resolve disputes');

    // HTTP server for health + RPC
    const app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        subagents: Array.from(this.subagents.keys()),
      });
    });

    app.get('/status', (req, res) => {
      res.json({
        escrow: this.config.escrowAddress,
        ollama: this.config.ollama,
        uptime: process.uptime(),
        activeSubagents: this.subagents.size,
        workQueueSize: this.workQueue.length,
      });
    });

    // Queue a game for validation
    app.post('/queue/validate-game', async (req, res) => {
      try {
        const { gameId, playerData, ramDump } = req.body;
        const taskId = `val-${Date.now()}`;
        
        this.workQueue.push({ type: 'validate', taskId, gameId, playerData, ramDump });
        
        // Send to validator subagent
        const validator = this.subagents.get('game-validator');
        await validator.send(`Validate ${gameId} for player ${playerData.playerId}: ${JSON.stringify(playerData)}`);
        
        res.json({ taskId, queued: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Queue a settlement
    app.post('/queue/settle-winner', async (req, res) => {
      try {
        const { tournamentId, winnerId, prizeAmount } = req.body;
        const taskId = `settle-${Date.now()}`;
        
        this.workQueue.push({ type: 'settle', taskId, tournamentId, winnerId, prizeAmount });
        
        // Send to settlement subagent
        const settlement = this.subagents.get('settlement-handler');
        await settlement.send(`Settle tournament ${tournamentId}: pay ${prizeAmount} CKB to ${winnerId}`);
        
        res.json({ taskId, queued: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.listen(this.config.port, () => {
      console.log(`[FiberQuest] HTTP server listening on port ${this.config.port}`);
      console.log(`[FiberQuest] Ready for work. Kernel and Phill can now guide the system.`);
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
