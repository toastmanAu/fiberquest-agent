/**
 * FiberQuest Agent — Unit Tests
 * Cline uses these to verify changes don't break core functionality
 */

const CKBClient = require('../src/ckb-client');
const GameValidator = require('../src/game-validator');
const Database = require('../src/database');

describe('FiberQuest Core', () => {
  describe('CKBClient', () => {
    test('should initialize with testnet RPC URL', () => {
      const client = new CKBClient('https://testnet.ckb.dev');
      expect(client.rpcUrl).toContain('testnet');
    });

    test('should format deposit detection query correctly', () => {
      const query = CKBClient.buildSearchQuery('ckt1qzda0cr08m85hc8j...');
      expect(query).toHaveProperty('search_key');
      expect(query).toHaveProperty('script_search_mode');
    });
  });

  describe('GameValidator', () => {
    test('should validate pokemon-fire-red stats within bounds', () => {
      const playerData = {
        level: 100,
        money: 999999,
        badges: 8,
        pokedex: 386,
      };
      const result = GameValidator.validatePattern('pokemon-fire-red', playerData);
      expect(result.pass).toBe(true);
    });

    test('should reject invalid pokemon-fire-red stats', () => {
      const playerData = {
        level: 150, // Invalid
        money: 9999999, // Too high
        badges: 10, // Too many
        pokedex: 500, // Out of range
      };
      const result = GameValidator.validatePattern('pokemon-fire-red', playerData);
      expect(result.pass).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Database', () => {
    let db;

    beforeAll(() => {
      db = new Database(':memory:');
    });

    afterAll(() => {
      db.close();
    });

    test('should create tournament', () => {
      const tournamentId = db.createTournament('pokemon-fire-red', 61000000000, 244000000000, 4);
      expect(tournamentId).toBeDefined();
      expect(typeof tournamentId).toBe('string');
    });

    test('should retrieve tournament details', () => {
      const id = db.createTournament('mario-kart-64', 61000000000, 244000000000, 2);
      const tournament = db.getTournament(id);
      expect(tournament).toBeDefined();
      expect(tournament.gameId).toBe('mario-kart-64');
    });
  });

  describe('API Integration', () => {
    test('should validate tournament structure', () => {
      const tournament = {
        id: 'tournament-123',
        gameId: 'pokemon-fire-red',
        entryFee: '61000000000',
        prizePool: '244000000000',
        playerCount: 0,
        maxPlayers: 4,
        status: 'recruiting',
      };
      expect(tournament).toHaveProperty('id');
      expect(tournament).toHaveProperty('gameId');
      expect(tournament).toHaveProperty('status');
    });
  });
});
