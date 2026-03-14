/**
 * Game Validator
 * 
 * Calls NucBox Ollama to validate game states
 * - deepseek-r1:32b for complex chain-of-thought reasoning
 * - Pattern matching for known cheating vectors
 * - RAM address analysis (impossible memory states)
 */

const axios = require('axios');

class GameValidator {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.ollamaClient = axios.create({
      baseURL: config.ollama,
      timeout: 60000,
    });
  }

  /**
   * Validate a game result based on RAM dump + game metadata
   * @param {string} gameId - Game ID (e.g., "pokemon-fire-red")
   * @param {object} playerData - {playerId, score, time, finalState}
   * @param {Buffer} ramDump - Raw WRAM dump from emulator
   * @returns {Promise<{valid: boolean, confidence: number, reason: string}>}
   */
  async validate(gameId, playerData, ramDump) {
    console.log(`[Validator] Validating ${gameId} for player ${playerData.playerId}`);

    try {
      // 1. Pattern-match known cheating vectors (fast path)
      const patternResult = this._patternMatch(gameId, playerData, ramDump);
      if (!patternResult.valid) {
        return { valid: false, confidence: 0.95, reason: patternResult.reason };
      }

      // 2. Call Ollama deepseek-r1:32b for reasoning (slow path)
      const reasoning = await this._reasonAboutState(gameId, playerData, ramDump);

      return {
        valid: reasoning.valid,
        confidence: reasoning.confidence,
        reason: reasoning.reason,
        reasoning: reasoning.chain, // Full CoT trace for audit
      };
    } catch (e) {
      console.error(`[Validator] Error validating ${gameId}:`, e.message);
      return { valid: false, confidence: 0.0, reason: `Validation error: ${e.message}` };
    }
  }

  /**
   * Fast pattern matching for obvious cheating
   */
  _patternMatch(gameId, playerData, ramDump) {
    // Example: Pokémon Fire Red
    if (gameId === 'pokemon-fire-red') {
      // Check if level is >100 (impossible)
      const levelAddr = 0x0529;
      const level = ramDump[levelAddr];
      if (level > 100) {
        return { valid: false, reason: `Level ${level} > 100 (impossible)` };
      }

      // Check if money > 999999 (requires sequence breaking)
      const moneyAddr = 0x0540; // Rough estimate
      if (playerData.finalMoney > 999999) {
        return { valid: false, reason: `Money ${playerData.finalMoney} exceeds max` };
      }
    }

    return { valid: true };
  }

  /**
   * Call deepseek-r1:32b for chain-of-thought reasoning
   */
  async _reasonAboutState(gameId, playerData, ramDump) {
    const prompt = `
You are a retro game cheating detector. Analyze this game result:

Game: ${gameId}
Player: ${playerData.playerId}
Final Score: ${playerData.score}
Time Elapsed: ${playerData.time}s
RAM State Hash: ${Buffer.from(ramDump).toString('hex').substring(0, 32)}...

Known facts about ${gameId}:
- Normal max score: 999999
- Speedrun record: 2h 15m
- Starting cash: 3000

Is this result legitimate? Consider:
1. Is the score achievable in the given time?
2. Are there any impossible game states?
3. Could this be bot-assisted speedrunning?

Return JSON: {"valid": bool, "confidence": 0-1, "reasoning": "..."}
`;

    try {
      const response = await this.ollamaClient.post('/api/generate', {
        model: 'deepseek-r1:32b',
        prompt,
        stream: false,
      });

      const text = response.data.response;
      const json = JSON.parse(text);

      return {
        valid: json.valid,
        confidence: json.confidence || 0.8,
        reason: json.reasoning,
        chain: text,
      };
    } catch (e) {
      console.error('[Validator] Ollama call failed:', e.message);
      throw e;
    }
  }
}

module.exports = GameValidator;
