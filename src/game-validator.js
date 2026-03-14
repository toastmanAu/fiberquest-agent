/**
 * Game Validator
 * 
 * Calls NucBox Ollama to validate game states
 * - deepseek-r1:32b for complex chain-of-thought reasoning
 * - Pattern matching for known cheating vectors
 * - RAM address analysis (impossible memory states)
 */

const axios = require('axios');
const PokemonValidator = require('./validators/pokemon-fire-red');
const MK2Validator = require('./validators/mortal-kombat-2');
const MK64Validator = require('./validators/mario-kart-64');

class GameValidator {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.ollamaClient = axios.create({
      baseURL: config.ollama,
      timeout: 60000,
    });

    // Load game-specific validators
    this.validators = {
      'pokemon-fire-red': new PokemonValidator(),
      'mortal-kombat-2': new MK2Validator(),
      'mario-kart-64': new MK64Validator(),
    };
  }

  /**
   * Validate a game result based on RAM dump + game metadata
   */
  async validate(gameId, playerData, ramDump) {
    console.log(`[Validator] Validating ${gameId} for player ${playerData.playerId}`);

    const validator = this.validators[gameId];
    if (!validator) {
      throw new Error(`Unknown game: ${gameId}`);
    }

    try {
      // 1. Pattern-match (fast path)
      const patternResult = validator.patternMatch(playerData, ramDump);
      if (!patternResult.valid) {
        return { 
          valid: false, 
          confidence: patternResult.confidence, 
          reason: patternResult.reason,
          patternMatch: true,
        };
      }

      // 2. Call Ollama deepseek-r1:32b for reasoning (slow path)
      const prompt = validator.reasoningPrompt(playerData, ramDump);
      const reasoning = await this._reasonWithDeepSeek(prompt);

      return {
        valid: reasoning.valid,
        confidence: reasoning.confidence,
        reason: reasoning.reasoning || reasoning.reason,
        chain: reasoning.fullChain,
        patternMatch: false,
      };
    } catch (e) {
      console.error(`[Validator] Error validating ${gameId}:`, e.message);
      return { 
        valid: false, 
        confidence: 0.0, 
        reason: `Validation error: ${e.message}` 
      };
    }
  }

  /**
   * Call deepseek-r1:32b for chain-of-thought reasoning
   */
  async _reasonWithDeepSeek(prompt) {
    try {
      const response = await this.ollamaClient.post('/api/generate', {
        model: 'deepseek-r1:32b',
        prompt,
        stream: false,
      });

      const text = response.data.response;
      
      try {
        const json = JSON.parse(text);
        return {
          valid: json.valid,
          confidence: json.confidence || 0.8,
          reasoning: json.reasoning || json.reason,
          fullChain: text,
        };
      } catch (e) {
        // Model didn't return JSON, extract from text
        return {
          valid: text.toLowerCase().includes('legitimate') || text.toLowerCase().includes('valid'),
          confidence: 0.7,
          reasoning: text.substring(0, 500),
          fullChain: text,
        };
      }
    } catch (e) {
      console.error('[Validator] Ollama call failed:', e.message);
      throw e;
    }
  }
}

module.exports = GameValidator;
