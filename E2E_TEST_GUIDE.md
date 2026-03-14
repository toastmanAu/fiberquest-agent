# FiberQuest E2E Testing Guide

## Setup Complete ✅

**Agent running on Pi 5:** http://192.168.68.65:3001
**First tournament created:** `tournament-1773492369077-3ybgpk` (Pokémon Fire Red, 2 players needed)

## Full E2E Flow (Tonight)

### Phase 1: Get Testnet CKB (5 min)

```bash
# Check testnet CKB faucet (Nervos community faucet)
# https://faucet.nervos.org
# Request 50 CKB → goes to your address

# Verify you have CKB
ckb-cli wallet get-capacity --address <your-address>
```

### Phase 2: Send Tournament Entry Deposit (5 min)

Player 1 joins:
```bash
ckb-cli wallet transfer \
  --to-address "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9" \
  --amount 10 \
  --data-hex "0x$(echo -n 'tournament-1773492369077-3ybgpk' | xxd -p)"
```

**What happens:**
- TX sent to CKB testnet
- Transaction includes tournament ID in `data` field
- Agent polls every 12s
- Within ~12s: agent detects deposit → creates player entry

**Verify:**
```bash
# Check tournament status (should show 1 player)
curl http://192.168.68.65:3001/api/tournament/tournament-1773492369077-3ybgpk | jq '.playerCount'

# Check agent logs
ssh fiberquest "sudo journalctl -u fiberquest-agent -f" | grep "Entry"
```

### Phase 3: Player 2 Joins (5 min)

Same as Player 1:
```bash
ckb-cli wallet transfer \
  --to-address "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9" \
  --amount 10 \
  --data-hex "0x$(echo -n 'tournament-1773492369077-3ybgpk' | xxd -p)"
```

**Expected:**
- Agent detects 2nd deposit
- Tournament now has 2/2 players → **tournament-ready event fires**
- Tournament status changes to "live"

### Phase 4: Player 1 Submits Game Result (1 min)

```bash
curl -X POST http://192.168.68.65:3001/queue/validate-game \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "playerData": {
      "playerId": "<player-1-address>",
      "timeSeconds": 4050,
      "finalLevel": 48,
      "finalMoney": 450000,
      "pokedexCount": 152,
      "gymBadges": 8
    },
    "ramDump": "0x0000000000000000"
  }'
```

**What happens:**
1. Validation task queued
2. Pattern match runs (~500ms): checks Level ≤ 100, Money ≤ 999999, etc. → PASS
3. Deepseek-r1:32b reasoning starts (~30s): chain-of-thought analysis
4. Result stored in database with confidence score

**Monitor:**
```bash
ssh fiberquest "sudo journalctl -u fiberquest-agent -f" | grep "Validator"
```

### Phase 5: Player 2 Submits Game Result (1 min)

Same as Player 1:
```bash
curl -X POST http://192.168.68.65:3001/queue/validate-game \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "playerData": {
      "playerId": "<player-2-address>",
      "timeSeconds": 4200,  # Slightly slower
      "finalLevel": 47,
      "finalMoney": 400000,
      "pokedexCount": 150,
      "gymBadges": 8
    },
    "ramDump": "0x0000000000000000"
  }'
```

Both results are now validated.

### Phase 6: Settle Winner (2 min)

Determine winner (Player 1 was faster: 4050s < 4200s):

```bash
curl -X POST http://192.168.68.65:3001/queue/settle-winner \
  -H 'Content-Type: application/json' \
  -d '{
    "tournamentId": "tournament-1773492369077-3ybgpk",
    "winnerId": "<player-1-address>",
    "prizeAmount": "19000000000"
  }'
```

**What happens:**
1. Fiber channel opens with winner
2. Prize sent via channel (19 CKB, half the pool)
3. Channel closes → on-chain finalization
4. Winner receives CKB in next block (~6s)

**Verify:**
```bash
# Check Fiber settlement log
ssh fiberquest "sudo journalctl -u fiberquest-agent -f" | grep "Settler"

# Check winner's balance increased
ckb-cli wallet get-capacity --address "<player-1-address>"
```

## API Reference

### Create Tournament
```bash
curl -X POST http://192.168.68.65:3001/api/tournament/create \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "mortal-kombat-2",
    "entryFee": "500000000",
    "prizePool": "2000000000",
    "maxPlayers": 4,
    "minPlayers": 2
  }'
# Returns: {"tournamentId": "...", "status": "recruiting"}
```

### Get Tournament Status
```bash
curl http://192.168.68.65:3001/api/tournament/{tournamentId} | jq .
```

### Get All Tournaments
```bash
curl http://192.168.68.65:3001/api/tournaments | jq '.tournaments[] | {id, gameId, status, playerCount: .spotsRemaining}'
```

### Get Player History
```bash
curl http://192.168.68.65:3001/api/player/{playerAddr}/entries | jq .
```

### Agent Health
```bash
curl http://192.168.68.65:3001/health | jq .
curl http://192.168.68.65:3001/status | jq .
```

## Supported Games

### Pokémon Fire Red
- Type: Speedrun
- Validation: Level, Money, Badges, Pokedex checks
- Reasoning: Deepseek verifies if level + time realistic for speedrun

### Mortal Kombat II
- Type: 1v1 Tournament
- Validation: Health %, Combo chain limits
- Reasoning: Deepseek checks plausibility of combo sequences

### Mario Kart 64
- Type: Grand Prix
- Validation: Points cap, lap times
- Reasoning: Deepseek checks if lap times match physics

## Troubleshooting

### "Tournament not found"
```bash
# Verify tournament exists
curl http://192.168.68.65:3001/api/tournaments | jq '.tournaments[].id'
```

### "Deposit not detected"
```bash
# Check agent logs
ssh fiberquest "sudo journalctl -u fiberquest-agent -n 30"

# Verify TX was sent to correct escrow address
# Verify TX includes tournament ID in data field
```

### "Validation timeout"
```bash
# Deepseek reasoning can take 30+ seconds
# Check if it's still running
ssh fiberquest "ps aux | grep deepseek"

# Check Ollama status
curl http://192.168.68.79:11434/api/tags
```

### "Settlement failed"
```bash
# Check Fiber RPC
curl http://192.168.68.79:8227/info

# Check if wallet has CKB for channel fees
curl http://192.168.68.65:3001/status
```

## Data Flow Summary

```
Player sends CKB deposit (10 CKB)
  ↓ TX includes tournament ID in data field
  ↓ Sent to escrow address
  ↓ (6s block time)
  ↓
Agent polling (every 12s)
  ↓ Detects deposit
  ↓ Extracts tournament ID from data field
  ↓ Creates tournament_players record
  ↓ Checks if minPlayers reached
  ↓ Emits 'tournament-ready' if yes
  ↓
Player 2 joins (same process)
  ↓ minPlayers = 2 reached
  ↓ Tournament status = "live"
  ↓
Players play games (offline, on their machines)
  ↓
Player 1 submits result to agent
  ↓ Pattern match: quick validation
  ↓ Deepseek reasoning: 30s chain-of-thought
  ↓ Result stored with confidence score
  ↓
Player 2 submits result (same)
  ↓
Agent determines winner (higher score/faster time)
  ↓
Settle winner via Fiber
  ↓ Open payment channel
  ↓ Send 19 CKB (half prize pool)
  ↓ Close channel (on-chain)
  ↓
Winner receives CKB in next block
  ↓ Tournament complete ✅
```

## Performance Timeline

Assuming continuous operations:

- **T+0s:** Tournament created
- **T+12s:** Player 1 deposit detected
- **T+24s:** Player 2 deposit detected → tournament-ready
- **T+60s:** Player 1 submits result
- **T+90s:** Deepseek validation completes
- **T+91s:** Player 2 submits result
- **T+121s:** Deepseek validation completes
- **T+122s:** Settlement triggered
- **T+128s:** Fiber channel closes
- **T+134s:** Winner receives CKB

**Total time from creation to winner payout: ~2 minutes 14 seconds**

## Next Steps

1. **Get testnet CKB** (via faucet)
2. **Send Player 1 deposit** (follow Phase 2)
3. **Verify agent detects** (check logs)
4. **Send Player 2 deposit** (follow Phase 3)
5. **Submit results** (follow Phases 4–5)
6. **Settle winner** (follow Phase 6)
7. **Verify winner received CKB** (check balance)

Ready? 🚀
