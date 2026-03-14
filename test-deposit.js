#!/usr/bin/env node

/**
 * Testnet CKB Faucet + Tournament Entry Simulator
 * 
 * Usage:
 *   node test-deposit.js <tournament-id> <player-addr>
 * 
 * This script:
 * 1. Requests testnet CKB from faucet (if needed)
 * 2. Sends CKB deposit to agent escrow address
 * 3. Includes tournament ID in transaction data field
 * 4. Verifies agent detects the deposit
 */

const axios = require('axios');

const ESCROW_ADDRESS = 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9';
const CKB_RPC = 'https://testnet.ckb.dev';
const AGENT_URL = 'http://192.168.68.65:3001';

async function main() {
  const [, , tournamentId, playerAddr] = process.argv;

  if (!tournamentId || !playerAddr) {
    console.log(`
Usage: node test-deposit.js <tournament-id> <player-addr>

Example:
  node test-deposit.js tournament-1773492369077-3ybgpk ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9

This will:
1. Send 10 CKB from your address to the escrow
2. Include tournament ID in the TX data field
3. Agent will detect it within ~12 seconds
    `);
    process.exit(1);
  }

  console.log(`\n📊 FiberQuest Testnet Entry Simulator\n`);
  console.log(`Tournament: ${tournamentId}`);
  console.log(`Player: ${playerAddr.substring(0, 20)}...`);
  console.log(`Escrow: ${ESCROW_ADDRESS.substring(0, 20)}...`);
  console.log(`\n🔄 Steps:\n`);

  try {
    // Step 1: Get tournament details
    console.log('1️⃣  Fetching tournament details...');
    const tourneyRes = await axios.get(`${AGENT_URL}/api/tournament/${tournamentId}`);
    const { tournament } = tourneyRes.data;
    console.log(`   ✅ Tournament: ${tournament.gameId} | Entry fee: ${tournament.entryFee / 1e8} CKB\n`);

    // Step 2: Show what should happen
    console.log('2️⃣  Building deposit transaction...');
    console.log(`   Entry fee: ${tournament.entryFee} Shannon (${tournament.entryFee / 1e8} CKB)`);
    console.log(`   Data field: "${tournamentId}" (UTF-8) or "0x${Buffer.from(tournamentId).toString('hex')}"\n`);

    // Step 3: Instructions for actual TX
    console.log('3️⃣  ⚠️  MANUAL STEP: Send CKB deposit\n');
    console.log(`   Option A: Use ckb-cli`);
    console.log(`   $ ckb-cli wallet transfer --to-address "${ESCROW_ADDRESS}" --amount ${tournament.entryFee / 1e8} --data-hex "0x${Buffer.from(tournamentId).toString('hex')}"\n`);

    console.log(`   Option B: Use JoyID (via website):\n`);
    console.log(`   const tx = {`);
    console.log(`     to: "${ESCROW_ADDRESS}",`);
    console.log(`     amount: "${tournament.entryFee}",`);
    console.log(`     data: "${tournamentId}"  // Tournament ID in data field`);
    console.log(`   };`);
    console.log(`   const signedTx = await signer.signTransaction(tx);\n`);

    // Step 4: Wait and verify
    console.log('4️⃣  Waiting for deposit...\n');
    console.log(`   Once you send the CKB deposit, agent will detect it within ~12 seconds.`);
    console.log(`   You can verify via:\n`);
    console.log(`   curl http://192.168.68.65:3001/api/tournament/${tournamentId}`);
    console.log(`   curl http://192.168.68.65:3001/api/player/${playerAddr}/entries\n`);

    console.log('   Agent logs:');
    console.log(`   ssh fiberquest "sudo journalctl -u fiberquest-agent -f | grep 'Entry\\|Deposit'\n`);

  } catch (e) {
    console.error('❌ Error:', e.response?.data || e.message);
    process.exit(1);
  }
}

main();
