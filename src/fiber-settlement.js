class FiberSettlement {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
  }

  async settleWinner(tournamentId, winnerId, prizeAmount) {
    // TODO: Create Fiber payment channel, transfer CKB to winner
    throw new Error('Not implemented');
  }
}

module.exports = FiberSettlement;
