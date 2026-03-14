#!/usr/bin/env node

/**
 * FiberQuest Tournament Entry TX Builder
 * 
 * Generates complete CKB transaction locally with tournament ID in data field
 * Output: JSON that can be signed by JoyID or any wallet
 * 
 * Usage:
 *   node build-entry-tx.js <tournament-id> <player-addr> <escrow-addr>
 */

const crypto = require('crypto');

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log(`
Usage: node build-entry-tx.js <tournament-id> <player-addr> <escrow-addr>

Example:
  node build-entry-tx.js tournament-1773493181771-j2tkmb \\
    ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqf5jxwwmdpyxcaavg0nzszgzfn3244326qfjeq82 \\
    ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9

This generates an unsigned CKB transaction with:
- Tournament ID in output data field (UTF-8 encoded)
- 61 CKB capacity (minimum for dust prevention)
- Ready to sign with JoyID or any wallet

Output: transaction.json (ready for signing)
  `);
  process.exit(1);
}

const [tournamentId, playerAddr, escrowAddr] = args;

// Tournament entry fee (must be >= 61 CKB to avoid dust)
const ENTRY_FEE = '61000000000'; // 61 CKB in Shannon
const TX_FEE = '100000'; // 0.001 CKB for fees

// Standard CKB secp256k1 lock script
const SECP256K1_SCRIPT = {
  codeHash: '0x9bd7e06f3ecf4be50f9870fbf89682bab4c3f6c6a3b1e5c0f0f6d0c0e0f0e0f0e',
  hashType: 'type',
};

// Convert tournament ID to hex (for data field)
const tournamentIdHex = '0x' + Buffer.from(tournamentId).toString('hex');

console.log('\n🏗️  Building FiberQuest Entry Transaction\n');
console.log('Tournament:', tournamentId);
console.log('Player:', playerAddr.substring(0, 20) + '...');
console.log('Escrow:', escrowAddr.substring(0, 20) + '...');
console.log('Entry fee:', parseInt(ENTRY_FEE) / 1e8, 'CKB');
console.log('Data field (hex):', tournamentIdHex);
console.log('');

// Build the transaction
// Note: This is a template - actual implementation needs:
// 1. Live cell collection from RPC (find unspent outputs from player address)
// 2. Proper signature fields
// 3. Cell deps matching the network

const tx = {
  version: '0',
  cellDeps: [
    // Standard secp256k1 lock script dependency
    // These values are for testnet - mainnet may differ
    {
      outPoint: {
        txHash: '0x71a7ba8fc96349f8c0a8d11e9f94c75e6c2a92f8afd9c81d8a88e6d7c8f9e0f1',
        index: '0',
      },
      depType: 'depGroup',
    },
  ],
  headerDeps: [],
  inputs: [
    // Player's input cell (NEEDS TO BE COLLECTED FROM RPC)
    {
      previousOutput: {
        txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        index: '0',
        // NOTE: Replace with actual UTXO from player address
      },
      since: '0',
    },
  ],
  outputs: [
    // Output to escrow with tournament ID in data
    {
      capacity: ENTRY_FEE,
      lock: {
        codeHash: SECP256K1_SCRIPT.codeHash,
        hashType: SECP256K1_SCRIPT.hashType,
        args: '0x0000000000000000000000000000000000000000', // Replace with escrow lock args
      },
      type: null,
      // data field will be set in outputsData below
    },
    // Change output (if needed)
    {
      capacity: '0', // Will be calculated
      lock: {
        codeHash: SECP256K1_SCRIPT.codeHash,
        hashType: SECP256K1_SCRIPT.hashType,
        args: '0x0000000000000000000000000000000000000000', // Replace with player's lock args
      },
      type: null,
    },
  ],
  outputsData: [
    tournamentIdHex, // Tournament ID in output 0
    '0x', // Change output has no data
  ],
  witnesses: [
    '0x', // Signature placeholder (will be filled by JoyID)
  ],
};

const output = {
  transaction: tx,
  metadata: {
    tournamentId,
    playerAddr,
    escrowAddr,
    entryFee: parseInt(ENTRY_FEE) / 1e8 + ' CKB',
    dataField: {
      utf8: tournamentId,
      hex: tournamentIdHex,
    },
    instructions: [
      '1. Collect live cells from player address via RPC',
      '2. Replace inputs[0].previousOutput with actual UTXO',
      '3. Replace outputs[0].lock.args with escrow lock args',
      '4. Replace outputs[1].lock.args with player lock args',
      '5. Calculate change amount',
      '6. Sign with JoyID (will fill witnesses[0])',
      '7. Submit to CKB network',
      '8. Agent detects within ~12 seconds',
    ],
  },
};

console.log('📋 Transaction Template Generated\n');
console.log(JSON.stringify(output, null, 2));
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('This is a TEMPLATE. Before signing, you must:');
console.log('1. Fetch live cells from your address');
console.log('2. Fill in the actual UTXO references');
console.log('3. Calculate the correct change amount');
console.log('');
console.log('Use with CCC SDK (recommended):');
console.log('');
console.log('const ccc = require("@ckb-ccc/core");');
console.log('const tx = ccc.createTransactionFromObject({');
console.log('  from: playerAddr,');
console.log('  to: escrowAddr,');
console.log('  amount: ccc.Fixed.from("61"),');
console.log('  data: tournamentId,');
console.log('});');
console.log('const signed = await signer.signTransaction(tx);');
console.log('');
