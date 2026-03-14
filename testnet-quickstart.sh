#!/bin/bash

# Quick testnet CKB faucet + deposit simulator
# Usage: bash testnet-quickstart.sh

set -e

ESCROW="ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9"
TOURNAMENT_ID="tournament-1773492369077-3ybgpk"
AGENT_URL="http://192.168.68.65:3001"

echo "🎮 FiberQuest Testnet Quickstart"
echo ""

# Step 0: Verify agent is running
echo "Step 0: Verify agent is running..."
HEALTH=$(curl -s $AGENT_URL/health | jq -r '.status')
if [ "$HEALTH" != "ok" ]; then
  echo "❌ Agent not responding at $AGENT_URL"
  echo "   Run: ssh fiberquest 'sudo systemctl status fiberquest-agent'"
  exit 1
fi
echo "✅ Agent is running\n"

# Step 1: Check tournament
echo "Step 1: Tournament status"
TOURNAMENT=$(curl -s "$AGENT_URL/api/tournament/$TOURNAMENT_ID")
ENTRY_FEE=$(echo $TOURNAMENT | jq -r '.tournament.entryFee')
GAME=$(echo $TOURNAMENT | jq -r '.tournament.gameId')
echo "   Game: $GAME"
echo "   Entry fee: $(($ENTRY_FEE / 1000000000)) CKB"
echo "   Escrow: $ESCROW"
echo ""

# Step 2: Show how to get testnet CKB
echo "Step 2: Get Testnet CKB"
echo "   1. Visit: https://faucet.nervos.org"
echo "   2. Enter your address"
echo "   3. Request 50 CKB"
echo "   4. Wait ~1 minute for receipt"
echo ""
echo "   Or use ckb-cli if you have a funded address:"
echo "   \$ ckb-cli wallet get-capacity --address <your-address>"
echo ""

# Step 3: Show deposit command
echo "Step 3: Send Deposit TX"
DATA_HEX="0x$(echo -n $TOURNAMENT_ID | xxd -p -r | xxd -p -c256)"
echo "   Run this command with your funded account:"
echo ""
echo "   \$ ckb-cli wallet transfer \\"
echo "     --to-address \"$ESCROW\" \\"
echo "     --amount 10 \\"
echo "     --data-hex \"$DATA_HEX\""
echo ""

# Step 4: Watch for confirmation
echo "Step 4: Watch agent detect deposit (in another terminal)"
echo "   \$ ssh fiberquest 'sudo journalctl -u fiberquest-agent -f' | grep Entry"
echo ""
echo "   You should see: '[Entry] Deposit detected: ... → Tournament ...'"
echo "   This will happen within ~12 seconds of the TX being confirmed."
echo ""

# Step 5: Check tournament status
echo "Step 5: Verify player entry"
echo "   \$ curl $AGENT_URL/api/tournament/$TOURNAMENT_ID | jq '.playerCount'"
echo ""
echo "✅ Setup complete! Follow steps 2-5 above to test the flow."
