const sqlite3 = require('sqlite3');
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '../data/fiberquest.db');
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else {
          this._createTables();
          resolve();
        }
      });
    });
  }

  _createTables() {
    const schema = `
      -- Tournaments
      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        gameId TEXT NOT NULL,
        creator TEXT NOT NULL,
        entryFee INTEGER NOT NULL,
        prizePool INTEGER NOT NULL,
        maxPlayers INTEGER NOT NULL,
        minPlayers INTEGER NOT NULL,
        status TEXT DEFAULT 'recruiting', -- recruiting, live, validating, settled
        cutoffBlock INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        startedAt INTEGER,
        settledAt INTEGER
      );

      -- Tournament Players
      CREATE TABLE IF NOT EXISTS tournament_players (
        id TEXT PRIMARY KEY,
        tournamentId TEXT NOT NULL,
        playerId TEXT NOT NULL,
        escrowTxHash TEXT NOT NULL,
        status TEXT DEFAULT 'joined', -- joined, playing, submitted, validated, settled
        score INTEGER,
        finalState TEXT, -- JSON
        validationResult TEXT, -- JSON: {valid, confidence, reason}
        payout INTEGER,
        payoutTxHash TEXT,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        submittedAt INTEGER,
        validatedAt INTEGER,
        paidAt INTEGER,
        FOREIGN KEY(tournamentId) REFERENCES tournaments(id),
        UNIQUE(tournamentId, playerId)
      );

      -- Escrow Transactions
      CREATE TABLE IF NOT EXISTS escrow_transactions (
        txHash TEXT PRIMARY KEY,
        playerId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        tournamentId TEXT,
        status TEXT DEFAULT 'pending', -- pending, confirmed, settled
        blockNumber INTEGER,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY(tournamentId) REFERENCES tournaments(id)
      );

      -- Fiber Channels (Settlement)
      CREATE TABLE IF NOT EXISTS fiber_channels (
        id TEXT PRIMARY KEY,
        tournamentId TEXT NOT NULL,
        winnerId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        channelState TEXT, -- JSON: {sequenceNum, locked, ...}
        status TEXT DEFAULT 'opening', -- opening, open, settling, settled
        channelTxHash TEXT,
        settleTxHash TEXT,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        settledAt INTEGER,
        FOREIGN KEY(tournamentId) REFERENCES tournaments(id)
      );

      -- Game Results (for validator audit trail)
      CREATE TABLE IF NOT EXISTS game_results (
        id TEXT PRIMARY KEY,
        playerTournamentId TEXT NOT NULL,
        gameId TEXT NOT NULL,
        playerData TEXT NOT NULL, -- JSON: {score, time, finalState, ...}
        ramDump TEXT, -- hex encoded
        validationChain TEXT, -- Full deepseek-r1 reasoning
        patternMatchResult TEXT, -- JSON
        reasoningResult TEXT, -- JSON
        finalVerdict TEXT, -- JSON: {valid, confidence}
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY(playerTournamentId) REFERENCES tournament_players(id)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_tournament_status ON tournaments(status);
      CREATE INDEX IF NOT EXISTS idx_tournament_players_status ON tournament_players(status);
      CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_fiber_status ON fiber_channels(status);
    `;

    schema.split(';').forEach(statement => {
      if (statement.trim()) {
        this.db.run(statement + ';', (err) => {
          if (err) console.error('[DB] Schema error:', err.message);
        });
      }
    });
  }

  // Helper methods
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = Database;
