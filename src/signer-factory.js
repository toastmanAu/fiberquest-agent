/**
 * Signer Factory
 * 
 * Creates appropriate signer based on configuration:
 * - Mode: "direct" → uses private key from .env (testnet only)
 * - Mode: "superrise" → delegates to wallet-server (testnet + mainnet safe)
 */

const SuperRiseSigner = require('./superrise-signer');

class DirectSigner {
  constructor(privateKey) {
    this.privateKey = privateKey;
    console.log('[DirectSigner] Using direct private key mode (testnet only)');
  }

  async getAddress() {
    // Derive address from private key (simplified)
    return process.env.CKB_ESCROW_ADDRESS;
  }

  async signTransaction(tx) {
    // In production, would use proper signing library
    console.log('[DirectSigner] Signing with direct key...');
    // Placeholder: actual implementation would use crypto.sign()
    return tx;
  }

  async signMessage(message) {
    // Message signing
    return Buffer.from(message).toString('hex');
  }
}

function createSigner(config) {
  const mode = config.signerMode || 'direct';

  switch (mode) {
    case 'superrise':
      console.log('[SignerFactory] Using SuperRise wallet-server');
      return new SuperRiseSigner(config.walletServerUrl || 'http://localhost:3000');

    case 'direct':
      if (!config.escrowPrivateKey) {
        throw new Error('Direct mode requires CKB_ESCROW_PRIVATE_KEY in .env');
      }
      console.log('[SignerFactory] Using direct private key (TESTNET ONLY)');
      return new DirectSigner(config.escrowPrivateKey);

    default:
      throw new Error(`Unknown signer mode: ${mode}`);
  }
}

module.exports = { createSigner, DirectSigner, SuperRiseSigner };
