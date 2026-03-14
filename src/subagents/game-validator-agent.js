/**
 * Game Validator Subagent
 * 
 * Accessible to: Kernel (assistant) + Phill (user)
 * Task: Validate game results using Ollama reasoning
 * 
 * Workflow:
 * 1. Receive game result (gameId, playerData, RAM dump)
 * 2. Pattern match for obvious cheating
 * 3. Call deepseek-r1:32b for chain-of-thought reasoning
 * 4. Return verdict + confidence + reasoning trace
 * 5. Accept guidance from Kernel/Phill ("override this", "re-check that")
 */

const axios = require('axios');

class GameValidatorAgent {
  constructor() {
    this.ollama = axios.create({
      baseURL: process.env.OLLAMA_URL || 'http://192.168.68.79:11434',
      timeout: 60000,
    });
  }

  async validateGame(gameId, playerData, ramDump) {
    console.log(`[GameValidator] Validating ${gameId} for ${playerData.playerId}`);
    
    // Pattern match (fast path)
    const patterns = this._patternMatch(gameId, playerData, ramDump);
    if (!patterns.valid) {
      return patterns;
    }

    // Chain-of-thought (slow path)
    const reasoning = await this._reasonWithDeepSeek(gameId, playerData, ramDump);
    return reasoning;
  }

  _patternMatch(gameId, playerData, ramDump) {
    // TODO: Game-specific pattern rules
    return { valid: true };
  }

  async _reasonWithDeepSeek(gameId, playerData, ramDump) {
    const prompt = `Validate this ${gameId} result:
Player: ${playerData.playerId}
Score: ${playerData.score}
Time: ${playerData.time}s

Is this legitimate? Return JSON: {"valid": bool, "confidence": 0-1, "reason": "..."}`;

    try {
      const res = await this.ollama.post('/api/generate', {
        model: 'deepseek-r1:32b',
        prompt,
        stream: false,
      });

      return JSON.parse(res.data.response);
    } catch (e) {
      console.error('[GameValidator] Error:', e.message);
      return { valid: false, confidence: 0, reason: `Error: ${e.message}` };
    }
  }
}

// Main entry
if (require.main === module) {
  const agent = new GameValidatorAgent();
  // Subagent will receive work via stdin/stdout bridge
  console.log('[GameValidator] Ready for work');
}

module.exports = GameValidatorAgent;
