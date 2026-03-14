const { EventEmitter } = require('events');

class TournamentManager extends EventEmitter {
  constructor(config, agent) {
    super();
    this.config = config;
    this.agent = agent;
    this.activeTournaments = new Map();
  }

  start() {
    console.log('[TournamentManager] Monitoring active tournaments');
    // TODO: Load tournaments from DB, watch cutoff blocks
  }
}

module.exports = TournamentManager;
