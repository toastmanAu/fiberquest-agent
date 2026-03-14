# FiberQuest Agent Architecture

## System Overview

```
Website (Next.js, Pi 5:3000)
   ↓ POST /api/tournament/join (with JoyID signature)
   ↓ [CKB transaction: to=escrowAddress, amount=entryFee, data=tournamentId]
   ↓
┌─────────────────────────────────────────────────────────────┐
│ FiberQuest Agent (Pi 5, port 3001)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ CKBClient (Deposit Polling, 12s interval)              ││
│  │ → Watches escrow address for incoming CKB              ││
│  │ → Extracts tournament ID from tx data field            ││
│  └──────────────────┬──────────────────────────────────────┘│
│                     ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ EntryHandler                                            ││
│  │ → Processes deposits                                    ││
│  │ → Creates tournament_players records                    ││
│  │ → Emits 'tournament-ready' when minPlayers reached      ││
│  └──────────────────┬──────────────────────────────────────┘│
│                     ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ GameValidator (via NucBox Ollama)                       ││
│  │ → Pattern match (fast path, ~500ms)                     ││
│  │ → Deepseek-r1:32b reasoning (slow path, ~30s)           ││
│  │ → Stores result + confidence in game_results table      ││
│  └──────────────────┬──────────────────────────────────────┘│
│                     ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ FiberSettler (Fiber RPC)                                ││
│  │ → Opens channel with winner's address                   ││
│  │ → Sends prize via channel payment                       ││
│  │ → Closes channel (on-chain settlement)                  ││
│  │ → Records settleTxHash in database                      ││
│  └──────────────────┬──────────────────────────────────────┘│
│                     ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ SQLite Database                                          ││
│  │ ├─ tournaments (id, gameId, status, entryFee, etc)      ││
│  │ ├─ tournament_players (playerEntry, status, payout)     ││
│  │ ├─ escrow_transactions (txHash, amount, status)         ││
│  │ ├─ fiber_channels (channelId, settleTx, status)         ││
│  │ └─ game_results (validation chain, confidence)          ││
│  └──────────────────────────────────────────────────────────┘│
│                     ↓                                         │
│  @OcRyzesBot (Telegram) ← /queue/validate-game              │
│  Commands: /status, /validate, /settle                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: Tournament Entry to Settlement

### 1. Player Joins Tournament (Website)

```
Player clicks "Join Tournament"
  ↓
Website calls: POST /api/tournament/join
  {
    tournamentId: "INV-2026-0042",
    playerAddr: "ckt1qzda...",
    joyidTx: { ... }  // JoyID signature
  }
  ↓
Website invokes JoyID SDK with:
  {
    to: "escrowAddress",
    amount: "1000000000" (10 CKB entry fee),
    data: "INV-2026-0042" // Tournament ID (UTF-8 or hex)
  }
  ↓
Player confirms in JoyID app
  ↓
Transaction sent to CKB network
  TX: {
    outputs: [{
      capacity: "1000000000",
      lock: ...,
      data: "0x494e562d323032362d303034322" // "INV-2026-0042" hex-encoded
    }]
  }
```

### 2. Agent Detects Deposit

```
CKBClient.pollForDeposits() (every 12s)
  ↓ Finds TX to escrowAddress
  ↓
EntryHandler.processDeposit(tx)
  ↓ Extracts data field: "INV-2026-0042"
  ↓ Creates escrow_transactions record
  ↓ Creates tournament_players record (status: "joined")
  ↓ Checks if minPlayers reached
  ↓ Emits 'tournament-ready' event
```

### 3. Tournament Ready

```
minPlayers reached (e.g., 4/4)
  ↓
Agent updates tournament.status = "live"
  ↓
Website shows "Tournament Starting..."
  ↓
Emits notification to all players
```

### 4. Players Play Game

```
Player runs RetroArch with game
  ↓ Completes game run
  ↓ Submits result to agent
  POST /queue/validate-game
  {
    gameId: "pokemon-fire-red",
    playerData: {
      playerId: "ckt1qzda...",
      timeSeconds: 4050,
      finalLevel: 48,
      finalMoney: 450000,
      pokedexCount: 152,
      gymBadges: 8
    },
    ramDump: "0x..." // WRAM snapshot
  }
```

### 5. Validation (Pattern Match → Deepseek)

```
GameValidator.validate(gameId, playerData, ramDump)
  ↓
1. Pattern Match (fast):
   - Level > 100? No
   - Money > 999999? No
   - Badges > 8? No
   → PASS
   ↓
2. Deepseek-r1:32b (slow, ~30s):
   Prompt: "Validate Pokémon speedrun...
   Final Level: 48, Time: 67m 30s, Badges: 8/8
   Is this realistic? Speedrun record: ~2h, Level 45-55 common..."
   ↓
   Response:
   {
     "valid": true,
     "confidence": 0.92,
     "reasoning": "Player reached Level 48, which is realistic for speedrun.
                   Time 67m 30s is reasonable. No obvious cheating detected."
   }
  ↓
Stores in game_results table with full chain-of-thought trace
```

### 6. Winner Determined

```
All players submitted + validated
  ↓ Agent ranks by score/time
  ↓ Highest score = winner
  ↓
Tournament status = "validating" → "settled"
```

### 7. Settlement via Fiber

```
POST /queue/settle-winner
{
  tournamentId: "INV-2026-0042",
  winnerId: "ckt1qzda...",
  prizeAmount: "38000000000" (380 CKB)
}
  ↓
FiberSettler.settleTournament():
  ↓
1. createChannel(winnerId, prizeAmount)
   → Fiber RPC: /open_channel
   → Stores channelId in fiber_channels
   ↓
2. sendPayment(channelId, prizeAmount)
   → Fiber RPC: /update_channel
   → Increments sequence number
   → Updates channel state
   ↓
3. settleChannel(channelId)
   → Fiber RPC: /close_channel
   → Finalizes on-chain
   → Records settleTxHash in database
  ↓
Winner receives 380 CKB in next block (via Fiber settlement TX)
```

## Key Design Decisions

### 1. JoyID Data Field Integration
- Uses merged SDK feature (commit 4346275, March 10, 2026)
- Tournament ID stored in transaction data field
- No off-chain database lookup needed
- Immutable audit trail on-chain

### 2. Polling-Based (Not Event-Based)
- CKBClient polls every 12 seconds (2 blocks)
- Simple, reliable, no complex event subscriptions
- Handles network delays gracefully
- Processed TXs cached to avoid duplicates

### 3. SQLite for State
- Local, persistent database
- No external service dependencies
- Fast queries for website
- Full audit trail (timestamps, status history)

### 4. Fiber for Settlement
- Payment channels for instant settlement
- Matches tournament prize distribution
- Private (off-chain state), public (on-chain finalization)
- Supports multi-winner tournaments (multiple channels)

### 5. Deepseek-r1:32b for Validation
- Chain-of-thought reasoning stores full trace
- Pattern match fast-path catches obvious cheating
- Slow path handles edge cases
- Confidence score for player feedback

## API Endpoints

### Website API
- `GET /api/tournaments` — List all tournaments
- `GET /api/tournament/<id>` — Get details + player count
- `POST /api/tournament/join` — Submit entry (JoyID tx)
- `GET /api/player/<addr>/entries` — Player's entry history
- `POST /api/tournament/create` — Admin: create tournament

### Telegram Bot (@OcRyzesBot)
- `/status` — Agent + tournament status
- `/validate <gameId>` — Queue game validation
- `/settle <tournamentId>` — Queue settlement

### Internal Queues
- `POST /queue/validate-game` — Submit game result
- `POST /queue/settle-winner` — Queue settlement

## Performance Targets (for 5 concurrent tournaments)

| Operation | Duration | Notes |
|-----------|----------|-------|
| Detect deposit | ~12s | Poll interval |
| Pattern match | ~500ms | Local validators |
| Deepseek reasoning | ~30s | 32B model, NucBox GPU |
| Fiber settlement | ~6s | 1 block confirmation |
| **Total (worst case)** | **~48s** | All sequential |

## Deployment Checklist

- [ ] Pi 5 agent running (npm start)
- [ ] CKB testnet RPC accessible
- [ ] Fiber RPC accessible (http://192.168.68.79:8227)
- [ ] NucBox Ollama accessible (http://192.168.68.79:11434)
- [ ] SQLite database initialized (npm run migrate)
- [ ] Escrow address funded (test CKB)
- [ ] @OcRyzesBot webhook configured
- [ ] Website connected to agent API (http://localhost:3001)
- [ ] Fan service running (sudo systemctl status fiberquest-fan)

## Testing

### Unit Tests
```bash
npm test
```

### Integration Test (Testnet)
```bash
# 1. Create tournament
curl -X POST http://localhost:3001/api/tournament/create \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "entryFee": "1000000000",
    "prizePool": "4000000000",
    "maxPlayers": 4,
    "minPlayers": 2
  }'

# 2. Player 1 enters (via website, triggers JoyID)
# TX: to=escrowAddress, amount=1000000000, data="INV-2026-0042"

# 3. Player 2 enters
# TX: to=escrowAddress, amount=1000000000, data="INV-2026-0042"

# 4. Wait ~12s, tournament-ready event fires

# 5. Players submit results
curl -X POST http://localhost:3001/queue/validate-game \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "playerData": {
      "playerId": "...",
      "timeSeconds": 4050,
      "finalLevel": 48
    },
    "ramDump": "0x..."
  }'

# 6. Settle winner
curl -X POST http://localhost:3001/queue/settle-winner \
  -H 'Content-Type: application/json' \
  -d '{
    "tournamentId": "INV-2026-0042",
    "winnerId": "ckt1qzda...",
    "prizeAmount": "3800000000"
  }'
```

## Next Steps

1. **Deploy to Pi 5** — Copy agent code, npm install, systemd service
2. **Wire website** — POST /api/tournament/join in React component
3. **Test deposit detection** — Send test TX, verify agent catches it
4. **Test validation** — Submit game result, verify Ollama call succeeds
5. **Test settlement** — Verify Fiber channel opens and closes
6. **Load testing** — 5 concurrent tournaments, multiple validators
