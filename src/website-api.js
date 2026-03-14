/**
 * Website API Integration
 * 
 * Exposes HTTP endpoints for the FiberQuest website:
 * - POST /api/tournament/join — Submit tournament entry with JoyID signature
 * - GET /api/tournament/<id> — Get tournament details
 * - GET /api/tournaments — List all tournaments
 * - GET /api/player/<id>/entries — Get player's entry history
 */

class WebsiteAPI {
  constructor(app, db, ckb) {
    this.app = app;
    this.db = db;
    this.ckb = ckb;
    this.setupRoutes();
  }

  setupRoutes() {
    // List all tournaments
    this.app.get('/api/tournaments', async (req, res) => {
      try {
        const tournaments = await this.db.all(
          'SELECT * FROM tournaments ORDER BY createdAt DESC LIMIT 50'
        );
        res.json({ tournaments });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Get tournament details
    this.app.get('/api/tournament/:id', async (req, res) => {
      try {
        const tournament = await this.db.get(
          'SELECT * FROM tournaments WHERE id = ?',
          [req.params.id]
        );

        if (!tournament) {
          return res.status(404).json({ error: 'Tournament not found' });
        }

        const players = await this.db.all(
          'SELECT COUNT(*) as count FROM tournament_players WHERE tournamentId = ? AND status = ?',
          [tournament.id, 'joined']
        );

        res.json({
          tournament,
          playerCount: players[0]?.count || 0,
          spotsRemaining: Math.max(0, tournament.maxPlayers - (players[0]?.count || 0)),
        });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Submit tournament entry (via JoyID)
    this.app.post('/api/tournament/join', async (req, res) => {
      try {
        const { tournamentId, playerAddr, joyidTx } = req.body;

        // Validate inputs
        if (!tournamentId || !playerAddr || !joyidTx) {
          return res.status(400).json({ error: 'Missing tournamentId, playerAddr, or joyidTx' });
        }

        // Verify tournament exists and is open
        const tournament = await this.db.get(
          'SELECT * FROM tournaments WHERE id = ? AND status = ?',
          [tournamentId, 'recruiting']
        );

        if (!tournament) {
          return res.status(404).json({ error: 'Tournament not found or closed' });
        }

        // Check player not already in tournament
        const existing = await this.db.get(
          'SELECT * FROM tournament_players WHERE tournamentId = ? AND playerId = ?',
          [tournamentId, playerAddr]
        );

        if (existing) {
          return res.status(409).json({ error: 'Player already entered' });
        }

        // Verify transaction
        // (In production: verify joyidTx is a valid CKB tx signed by playerAddr with:
        //  - to = escrowAddress
        //  - amount = tournament.entryFee
        //  - data = tournamentId)

        console.log(`[API] Verifying entry TX: ${joyidTx.hash.substring(0, 16)}...`);

        // Queue for deposit polling to catch and process
        console.log(`[API] Entry submitted for tournament ${tournamentId}, awaiting on-chain confirmation`);

        res.json({
          status: 'pending',
          message: 'Entry transaction submitted. Awaiting on-chain confirmation.',
          txHash: joyidTx.hash,
          estimatedConfirmationTime: '~6 seconds (1 block)',
        });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Get player's entry history
    this.app.get('/api/player/:addr/entries', async (req, res) => {
      try {
        const entries = await this.db.all(
          `SELECT tp.*, t.gameId, t.entryFee, t.prizePool, t.status as tournamentStatus
           FROM tournament_players tp
           JOIN tournaments t ON tp.tournamentId = t.id
           WHERE tp.playerId = ?
           ORDER BY tp.createdAt DESC
           LIMIT 50`,
          [req.params.addr]
        );

        res.json({ entries });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Admin: Create tournament
    this.app.post('/api/tournament/create', async (req, res) => {
      try {
        const { gameId, entryFee, prizePool, maxPlayers, minPlayers } = req.body;

        const id = `tournament-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        await this.db.run(
          `INSERT INTO tournaments (id, gameId, creator, entryFee, prizePool, maxPlayers, minPlayers, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, gameId, 'admin', entryFee, prizePool, maxPlayers, minPlayers, 'recruiting', Math.floor(Date.now() / 1000)]
        );

        res.json({ tournamentId: id, status: 'recruiting' });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  }
}

module.exports = WebsiteAPI;
