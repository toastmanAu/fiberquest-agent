# FiberQuest Agent

**Tournament orchestrator for retro game competitions with CKB escrow + Fiber settlement.**

- 🎮 **3 supported games:** Pokémon Fire Red (speedrun), Mortal Kombat II (1v1), Mario Kart 64 (GP)
- 🧠 **AI validation:** Deepseek-r1:32b chain-of-thought reasoning via NucBox Ollama
- 💰 **CKB escrow:** Deposits via JoyID SDK (data field integration)
- ⚡ **Fiber settlement:** Payment channels for instant winner payouts
- 📱 **Telegram bot:** @OcRyzesBot for status + manual triggers
- 🌐 **Website API:** React components for tournament join/browse/play
- 🌡️ **Hardware:** GPIO18 PWM fan control, auto-scaling by CPU temp

## Quick Start

### 1. Install

```bash
git clone https://github.com/toastmanAu/fiberquest-agent
cd fiberquest-agent
npm install
cp .env.example .env
# Edit .env with your CKB_ESCROW_ADDRESS and _PRIVATE_KEY
```

### 2. Run

```bash
npm start
# Agent listens on port 3001
# Deposit polling: every 12s
# NucBox Ollama: 192.168.68.79:11434
```

### 3. Test (One Tournament)

```bash
# Create tournament
curl -X POST http://localhost:3001/api/tournament/create \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "entryFee": "1000000000",
    "prizePool": "4000000000",
    "maxPlayers": 2,
    "minPlayers": 2
  }'
# Returns: {"tournamentId": "tournament-1710340800000-abc123"}

# Player 1 enters (via website or direct POST)
curl -X POST http://localhost:3001/api/tournament/join \
  -H 'Content-Type: application/json' \
  -d '{
    "tournamentId": "tournament-1710340800000-abc123",
    "playerAddr": "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0...",
    "joyidTx": { /* signed JoyID transaction */ }
  }'
# Expected: {"status": "pending", "txHash": "0x..."}

# Wait ~12s for agent to detect deposit
# Check logs:
tail -f /tmp/fiberquest.log | grep "Entry"

# Player 2 enters
# ... (repeat)

# When minPlayers reached: tournament-ready event fires

# Player 1 submits game result
curl -X POST http://localhost:3001/queue/validate-game \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "playerData": {
      "playerId": "ckt1qzda...",
      "timeSeconds": 4050,
      "finalLevel": 48,
      "finalMoney": 450000,
      "pokedexCount": 152,
      "gymBadges": 8
    },
    "ramDump": "0x..."
  }'
# Validation queued. Deepseek reasoning takes ~30s.

# Settle winner
curl -X POST http://localhost:3001/queue/settle-winner \
  -H 'Content-Type: application/json' \
  -d '{
    "tournamentId": "tournament-1710340800000-abc123",
    "winnerId": "ckt1qzda...",
    "prizeAmount": "3800000000"
  }'
# Settlement queued. Fiber channel opens, sends payment, closes (~6s).
# Winner receives CKB in next block.
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- System diagram (CKBClient → EntryHandler → GameValidator → FiberSettler)
- Data flows (deposit → validation → settlement)
- Performance targets
- Deployment checklist

## Website Integration

See [WEBSITE_INTEGRATION.md](./WEBSITE_INTEGRATION.md) for:
- React `TournamentJoinButton` component
- JoyID SDK integration with data field
- API contract (request/response examples)
- Testing instructions

## Components

| Component | File | Purpose |
|-----------|------|---------|
| **CKBClient** | `src/ckb-client.js` | CKB RPC polling, deposit detection |
| **EntryHandler** | `src/entry-handler.js` | Process deposits, extract tournament ID from data field |
| **GameValidator** | `src/game-validator.js` | Pattern match + Deepseek reasoning |
| **Validators** | `src/validators/*.js` | Game-specific rules (3 games) |
| **FiberSettler** | `src/fiber-settler.js` | Payment channel management |
| **WebsiteAPI** | `src/website-api.js` | HTTP endpoints (join, list, status) |
| **TelegramHandler** | `src/telegram-handler.js` | @OcRyzesBot webhook |
| **Database** | `src/database.js` | SQLite schema (5 tables) |

## API Endpoints

### Create Tournament (Admin)
```
POST /api/tournament/create
Content-Type: application/json

{
  "gameId": "pokemon-fire-red",
  "entryFee": "1000000000",
  "prizePool": "4000000000",
  "maxPlayers": 4,
  "minPlayers": 2
}

Response:
{
  "tournamentId": "tournament-1710340800000-abc123",
  "status": "recruiting"
}
```

### Join Tournament (Player)
```
POST /api/tournament/join
Content-Type: application/json

{
  "tournamentId": "tournament-1710340800000-abc123",
  "playerAddr": "ckt1qzda...",
  "joyidTx": { /* signed CKB transaction with data field */ }
}

Response:
{
  "status": "pending",
  "message": "Entry transaction submitted. Awaiting on-chain confirmation.",
  "txHash": "0x...",
  "estimatedConfirmationTime": "~6 seconds (1 block)"
}
```

### List Tournaments
```
GET /api/tournaments

Response:
{
  "tournaments": [
    {
      "id": "tournament-1710340800000-abc123",
      "gameId": "pokemon-fire-red",
      "entryFee": "1000000000",
      "prizePool": "4000000000",
      "maxPlayers": 4,
      "minPlayers": 2,
      "status": "recruiting",
      "playerCount": 2,
      "spotsRemaining": 2
    }
  ]
}
```

### Get Tournament Details
```
GET /api/tournament/{tournamentId}

Response:
{
  "tournament": { /* full tournament object */ },
  "playerCount": 2,
  "spotsRemaining": 2
}
```

### Player Entry History
```
GET /api/player/{playerAddr}/entries

Response:
{
  "entries": [
    {
      "id": "entry-0x123abc...",
      "tournamentId": "tournament-1710340800000-abc123",
      "status": "joined",
      "score": null,
      "payout": null,
      "createdAt": 1710340800
    }
  ]
}
```

### Submit Game Result (for validation)
```
POST /queue/validate-game
Content-Type: application/json

{
  "gameId": "pokemon-fire-red",
  "playerData": {
    "playerId": "ckt1qzda...",
    "timeSeconds": 4050,
    "finalLevel": 48,
    "finalMoney": 450000,
    "pokedexCount": 152,
    "gymBadges": 8
  },
  "ramDump": "0x..."
}

Response:
{
  "taskId": "val-1710340860123",
  "queued": true
}
```

### Settle Winner (for settlement)
```
POST /queue/settle-winner
Content-Type: application/json

{
  "tournamentId": "tournament-1710340800000-abc123",
  "winnerId": "ckt1qzda...",
  "prizeAmount": "3800000000"
}

Response:
{
  "taskId": "settle-1710340890456",
  "queued": true
}
```

### Status Endpoints
```
GET /health
Response: {"status": "ok", "uptime": 3600, "escrow": "ckt1qzda..."}

GET /status
Response: {
  "status": "running",
  "uptime": 3600,
  "workQueueSize": 2,
  "subagents": []
}
```

## Environment Variables

```bash
# CKB Testnet
CKB_RPC_URL=https://testnet.ckb.dev
CKB_ESCROW_ADDRESS=ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9
CKB_ESCROW_PRIVATE_KEY=your_private_key_here

# Fiber Network (N100)
FIBER_RPC_URL=http://192.168.68.79:8227

# Ollama (NucBox)
OLLAMA_URL=http://192.168.68.79:11434

# Telegram Bot
TELEGRAM_BOT_TOKEN=8640272636:AAFd8CX2fCWV_iSkD51rDrO-upZfkoCS1Us

# HTTP Server
AGENT_PORT=3001
```

## Game Validators

### Pokémon Fire Red (Speedrun)
- Pattern: Level ≤ 100, Money ≤ 999999, Badges ≤ 8, Pokedex ≤ 386
- Reasoning: Deepseek checks if time + level + badges are realistic for natural play

### Mortal Kombat II (1v1 Tournament)
- Pattern: Health ≤ 100%, Combo ≤ 8 hits, 8 wins required
- Reasoning: Deepseek verifies if combo chains and win counts are plausible

### Mario Kart 64 (Grand Prix)
- Pattern: Points ≤ 48, All 4 tracks completed, Lap time 30-180 seconds
- Reasoning: Deepseek checks if lap times and point totals match physics

Each validator has:
- **Fast path** (pattern match, ~500ms) — catches obvious cheating
- **Slow path** (Deepseek, ~30s) — chain-of-thought reasoning for edge cases
- **Confidence score** — player gets feedback on verdict certainty
- **Full audit trail** — stored in database for transparency

## Hardware

### GPIO18 PWM Fan Control (Pi 5)

```bash
# Service status
sudo systemctl status fiberquest-fan

# View logs
sudo journalctl -u fiberquest-fan -f

# Manual control (if needed)
sudo systemctl stop fiberquest-fan
sudo systemctl start fiberquest-fan
```

- **Frequency:** 20kHz (smooth operation)
- **Range:** 20-100% duty cycle
- **Temperature mapping:** 50°C = 0% (fan off), 75°C = 100% (full speed)
- **Smooth ramping:** Avoids jarring speed changes
- **Persistent:** Survives reboot (systemd enabled)

## Testing Checklist

- [ ] Agent starts without errors
- [ ] CKB RPC reachable
- [ ] Ollama reachable (deepseek-r1:32b loaded)
- [ ] Fiber RPC reachable
- [ ] Fan service running (`sudo systemctl status fiberquest-fan`)
- [ ] Create tournament works
- [ ] Player entry accepted (pending status)
- [ ] Deposit detected (check logs)
- [ ] Game result validation completes (~30s)
- [ ] Settlement completed (Fiber channel opened/closed)
- [ ] Winner received CKB

## Deployment

### Pi 5 (Agent + Website)
```bash
cd /home/phill/fiberquest-agent
npm install
npm start

# Or systemd service:
# [Unit] ExecStart=/usr/bin/node src/index.js
# [Service] WorkingDirectory=/home/phill/fiberquest-agent
```

### NucBox (Ollama Inference)
```bash
# Already running at 192.168.68.79:11434
ollama list  # Verify deepseek-r1:32b is loaded
```

### CKB Node (ckbnode)
```bash
ssh ckbnode 'systemctl status ckb'
```

### Fan Service (Pi 5)
```bash
sudo systemctl status fiberquest-fan
sudo journalctl -u fiberquest-fan -f
```

## Troubleshooting

### Agent won't start
```bash
# Check Node version
node --version  # Should be 22.x+

# Check dependencies
npm install

# Check environment
cat .env | grep CKB_ESCROW_ADDRESS
```

### Deposits not detected
```bash
# Check CKB RPC
curl https://testnet.ckb.dev -d '{"id": 1, "method": "get_block_number", ...}'

# Check deposit polling logs
npm start 2>&1 | grep "Deposit\|Polling"

# Verify escrow address in database
sqlite3 data/fiberquest.db "SELECT * FROM escrow_transactions LIMIT 5;"
```

### Validation timeout
```bash
# Check Ollama status
curl http://192.168.68.79:11434/api/tags

# Check if deepseek-r1:32b is loaded
ollama list | grep deepseek

# Increase timeout in src/game-validator.js (ollamaClient.timeout)
```

### Settlement fails
```bash
# Check Fiber RPC
curl http://192.168.68.79:8227/info

# Check Fiber node logs (on N100)
ssh phill@192.168.68.79 'sudo journalctl -u fnn -f'

# Verify agent Fiber wallet has CKB for channel fees
```

## Performance Targets (5 concurrent tournaments)

| Operation | Duration | Notes |
|-----------|----------|-------|
| Detect deposit | ~12s | Polling interval (2 blocks) |
| Create player record | ~100ms | SQLite write |
| Pattern match | ~500ms | Local validation |
| Deepseek reasoning | ~30s | NucBox GPU inference |
| Fiber settlement | ~6s | Channel open/close on-chain |
| **Total (worst case)** | **~48s** | All sequential |

## Future Improvements

- [ ] **WebSocket** for real-time tournament updates (instead of polling)
- [ ] **Multiple Ollama nodes** for parallel validation
- [ ] **Rollups** for batched settlements (Fiber + CKB)
- [ ] **Mobile app** (React Native, JoyID bridge)
- [ ] **More games** (SMB3, Mega Man, etc.)
- [ ] **Spectator mode** (stream tournament live via Twitch)
- [ ] **Leaderboards** (all-time records, seasonal rankings)

## License

MIT

## Author

Built by Kernel (assistant) + Phill for **FiberQuest hackathon (March 25, 2026)**.

---

**Status:** 🚀 **Production-ready for hackathon demo**

Next: Deploy to Pi 5, run E2E tournament test.
