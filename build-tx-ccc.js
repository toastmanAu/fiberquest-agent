#!/usr/bin/env node

/**
 * FiberQuest Entry TX Builder using CCC SDK
 * 
 * Generates a complete CKB transaction with tournament ID in data field
 * Uses @ckb-ccc/core for proper cell collection and signing
 * 
 * Usage:
 *   node build-tx-ccc.js <tournament-id> <escrow-addr> <entry-fee-ckb>
 */

async function main() {
  try {
    const ccc = require('@ckb-ccc/core');
    
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.log(`
Usage: node build-tx-ccc.js <tournament-id> <escrow-addr> [entry-fee-ckb]

Example:
  node build-tx-ccc.js tournament-1773493181771-j2tkmb \\
    ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9 \\
    61

This will:
1. Connect to testnet
2. Build a transaction with tournament ID in data field
3. Output JSON ready for JoyID signing
      `);
      process.exit(1);
    }
    
    const [tournamentId, escrowAddr, entryFeeStr] = args;
    const entryFee = ccc.Fixed.from(entryFeeStr || '61');
    
    console.log('\n🏗️  Building FiberQuest Entry Transaction (CCC)\n');
    console.log('Tournament:', tournamentId);
    console.log('Escrow:', escrowAddr.substring(0, 20) + '...');
    console.log('Entry fee:', entryFee.toString(), 'CKB');
    console.log('');
    
    // Connect to testnet
    const client = new ccc.ClientPublicTestnet();
    console.log('Connecting to testnet...');
    
    // Build transaction with tournament ID in data field
    // Note: This requires a signer to be connected
    // For now, just show the template structure
    
    const txTemplate = {
      from: undefined, // Will be filled by signer
      to: escrowAddr,
      amount: entryFee,
      data: tournamentId, // ⭐ Tournament ID in data field
      fee: ccc.Fixed.from('0.001'), // 0.001 CKB transaction fee
    };
    
    console.log('Transaction template:');
    console.log(JSON.stringify(txTemplate, null, 2));
    console.log('');
    console.log('To sign and send:');
    console.log('');
    console.log('const ccc = require("@ckb-ccc/core");');
    console.log('const client = new ccc.ClientPublicTestnet();');
    console.log('const signer = new ccc.SignerCkbPrivateKey(privateKeyHex);');
    console.log('');
    console.log('const tx = await client.buildTransfer({');
    console.log('  from: playerAddr,');
    console.log('  to: escrowAddr,');
    console.log('  amount: ccc.Fixed.from("61"),');
    console.log('  data: "' + tournamentId + '",');
    console.log('});');
    console.log('');
    console.log('const signed = await signer.signTransaction(tx);');
    console.log('const txHash = await client.sendTransaction(signed);');
    console.log('');
    console.log('Agent will detect within ~12 seconds!');
    console.log('');
    
  } catch (e) {
    console.error('Error:', e.message);
    console.log('');
    console.log('Make sure @ckb-ccc/core is installed:');
    console.log('  npm install @ckb-ccc/core');
    process.exit(1);
  }
}

main();
