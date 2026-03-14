/**
 * SuperRise Wallet Signer
 * 
 * Delegates signing to SuperRise wallet-server instead of storing
 * private key in agent environment. Keeps key isolated and owner-controlled.
 * 
 * Usage:
 *   const signer = new SuperRiseSigner(walletServerUrl);
 *   const signedTx = await signer.signTransaction(unsignedTx);
 */

const axios = require('axios');

class SuperRiseSigner {
  constructor(walletServerUrl = 'http://localhost:3000') {
    this.walletServerUrl = walletServerUrl;
    this.client = axios.create({
      baseURL: walletServerUrl,
      timeout: 30000,
    });
  }

  /**
   * Get current wallet address from SuperRise
   */
  async getAddress() {
    try {
      const res = await this.client.get('/wallet/current');
      return res.data.address;
    } catch (e) {
      throw new Error(`Failed to get wallet address: ${e.message}`);
    }
  }

  /**
   * Sign a CKB transaction
   * 
   * SuperRise wallet-server handles:
   * - Private key management
   * - Transaction signing
   * - Audit logging
   * - Owner approval (if configured)
   */
  async signTransaction(tx) {
    try {
      console.log(`[SuperRise] Signing transaction...`);

      const res = await this.client.post('/wallet/sign-transaction', {
        transaction: tx,
        // Optional: require owner approval for large amounts
        // requireApproval: true,
      });

      const signedTx = res.data.transaction;
      console.log(`[SuperRise] ✅ Transaction signed: ${signedTx.hash.substring(0, 16)}...`);

      return signedTx;
    } catch (e) {
      console.error(`[SuperRise] Signing failed:`, e.message);
      throw e;
    }
  }

  /**
   * Sign a raw message (for authentication, etc.)
   */
  async signMessage(message) {
    try {
      const res = await this.client.post('/wallet/sign-message', {
        message,
      });

      return res.data.signature;
    } catch (e) {
      throw new Error(`Failed to sign message: ${e.message}`);
    }
  }

  /**
   * Verify a signature (using wallet's public key)
   */
  async verifySignature(message, signature) {
    try {
      const res = await this.client.post('/wallet/verify-signature', {
        message,
        signature,
      });

      return res.data.valid;
    } catch (e) {
      throw new Error(`Failed to verify signature: ${e.message}`);
    }
  }

  /**
   * Get wallet status and audit trail
   */
  async getStatus() {
    try {
      const res = await this.client.get('/wallet/status');
      return res.data;
    } catch (e) {
      throw new Error(`Failed to get wallet status: ${e.message}`);
    }
  }

  /**
   * Get transaction history from wallet
   */
  async getTransactionHistory(limit = 50) {
    try {
      const res = await this.client.get('/wallet/transactions', {
        params: { limit },
      });

      return res.data.transactions;
    } catch (e) {
      throw new Error(`Failed to get transaction history: ${e.message}`);
    }
  }
}

module.exports = SuperRiseSigner;
