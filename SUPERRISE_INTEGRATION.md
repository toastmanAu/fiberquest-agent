# SuperRise Wallet Integration

FiberQuest Agent supports two signer modes:

1. **Direct Mode** (default, testnet only)
   - Uses private key from `.env`
   - Fast, simple setup for testing
   - ⚠️ **NOT recommended for mainnet or production**

2. **SuperRise Mode** (testnet + mainnet safe)
   - Delegates to SuperRise wallet-server
   - Private key stays isolated in wallet-server
   - Owner-controlled fund releases
   - Full audit trail
   - Production-ready

## Setup: SuperRise Mode

### 1. Start SuperRise Wallet Server

```bash
cd /home/phill/.openclaw/workspace/superise
npm install
npm run start:wallet-server

# Wallet server listens on http://localhost:3000
```

### 2. Create a wallet in SuperRise

```bash
# Import or create wallet (via superise CLI or REST API)
curl -X POST http://localhost:3000/wallet/create \
  -H 'Content-Type: application/json' \
  -d '{
    "password": "secure_password_here"
  }'

# Response:
# {
#   "walletId": "...",
#   "address": "ckt1qzda...",
#   "fingerprint": "..."
# }
```

### 3. Configure FiberQuest Agent

Edit `.env`:

```bash
# Enable SuperRise mode
SIGNER_MODE=superrise
WALLET_SERVER_URL=http://localhost:3000

# Still need escrow address (for polling)
CKB_ESCROW_ADDRESS=ckt1qzda...

# Remove or comment out the direct private key
# CKB_ESCROW_PRIVATE_KEY=xxx  # ← NOT USED IN SUPERRISE MODE
```

### 4. Start Agent

```bash
cd /home/phill/fiberquest-agent
npm install
npm start

# Agent will connect to SuperRise wallet-server for signing
```

## Usage Difference

### Direct Mode (testnet only)
```
Player sends deposit TX
  ↓
Agent detects it (polling)
  ↓
Agent has private key in .env
  ↓
Agent signs settlement TX directly
  ↓
Winner gets CKB
```

### SuperRise Mode (testnet + mainnet safe)
```
Player sends deposit TX
  ↓
Agent detects it (polling)
  ↓
Agent calls wallet-server: POST /wallet/sign-transaction
  ↓
Wallet-server signs with isolated private key
  ↓
Returns signed TX to agent
  ↓
Agent submits to CKB network
  ↓
Winner gets CKB
```

**Key difference:** Agent never sees the private key.

## API Endpoints (SuperRise Integration)

### Get Current Wallet Address
```
GET /wallet/current
Response: {"address": "ckt1qzda...", "fingerprint": "..."}
```

### Sign a Transaction
```
POST /wallet/sign-transaction
Body: {
  "transaction": { /* unsigned CKB tx */ },
  "requireApproval": false  // optional: owner approval gate
}
Response: {"transaction": { /* signed CKB tx */ }}
```

### Sign a Message
```
POST /wallet/sign-message
Body: {"message": "..."}
Response: {"signature": "0x..."}
```

### Get Wallet Status
```
GET /wallet/status
Response: {
  "walletId": "...",
  "address": "ckt1qzda...",
  "balance": "1000000000",
  "status": "ACTIVE",
  "auditLog": [...]
}
```

### Get Transaction History
```
GET /wallet/transactions?limit=50
Response: {
  "transactions": [
    {
      "operationId": "...",
      "txHash": "0x...",
      "status": "CONFIRMED",
      "amount": "1000000000",
      "timestamp": 1710340800
    }
  ]
}
```

## Switching Between Modes

### Direct → SuperRise

```bash
# 1. Update .env
SIGNER_MODE=superrise
WALLET_SERVER_URL=http://localhost:3000

# 2. Make sure SuperRise wallet-server is running
ps aux | grep wallet-server

# 3. Verify wallet exists and has funds
curl http://localhost:3000/wallet/status

# 4. Restart agent
npm restart
```

### SuperRise → Direct

```bash
# 1. Update .env
SIGNER_MODE=direct
CKB_ESCROW_PRIVATE_KEY=your_key_here

# 2. Remove WALLET_SERVER_URL (or comment it out)

# 3. Restart agent
npm restart
```

## Security Model

### Owner (Controls Private Key)
- ✅ Imports wallet into SuperRise
- ✅ Sets password/PIN
- ✅ Approves large settlements (if configured)
- ✅ Views audit trail
- ❌ Cannot delegate to agent

### Agent (Uses Wallet, No Key Access)
- ✅ Calls wallet-server to sign
- ✅ Manages tournament state
- ✅ Settles winners
- ❌ Never sees private key
- ❌ Cannot change password
- ❌ Cannot export key

### Audit Trail
- Every transaction logged
- Actor (agent/owner), action, amount, timestamp
- Immutable (stored in SuperRise wallet-server)
- Queryable via `/wallet/status` → `auditLog`

## Mainnet Deployment

Once FiberQuest is live on mainnet:

```bash
# 1. Use real CKB mainnet RPC (update CKB_RPC_URL)
CKB_RPC_URL=https://mainnet-node.ckbapp.dev

# 2. Use SuperRise mode (not direct!)
SIGNER_MODE=superrise

# 3. Ensure wallet has real CKB (not testnet)
curl http://localhost:3000/wallet/status | grep balance

# 4. Set up owner approval for large amounts (e.g., >10 CKB)
# (Configure in SuperRise wallet-server)

# 5. Run agent
npm start
```

## Troubleshooting

### "Cannot connect to wallet-server"

```bash
# Check if wallet-server is running
ps aux | grep wallet-server

# Check if it's listening
curl http://localhost:3000/wallet/status

# If not running, start it
cd /home/phill/.openclaw/workspace/superise
npm run start:wallet-server
```

### "Wallet not found"

```bash
# Check if wallet exists in SuperRise
curl http://localhost:3000/wallet/current

# If not, create one
curl -X POST http://localhost:3000/wallet/create \
  -d '{"password": "..."}'
```

### "Signing failed"

```bash
# Check agent logs
npm start 2>&1 | grep SuperRise

# Verify wallet has CKB
curl http://localhost:3000/wallet/status | grep balance

# Verify transaction is valid (check CKB_RPC_URL)
curl https://testnet.ckb.dev -X POST \
  -d '{"id":1,"method":"get_block_number","jsonrpc":"2.0"}'
```

### "Permission denied" / "Approval required"

If SuperRise is configured to require owner approval for large settlements:

```bash
# Owner must approve in SuperRise UI or via API
curl -X POST http://localhost:3000/wallet/approve-pending \
  -d '{"operationId": "...", "approved": true}'
```

## Performance Impact

| Mode | Sign Time | Notes |
|------|-----------|-------|
| Direct | ~50ms | No network overhead |
| SuperRise | ~100-200ms | Local HTTP call to wallet-server |

For tournaments with 100+ concurrent validations, SuperRise adds minimal overhead (~100-150ms total per settlement).

## Migration Path (Recommended for Production)

**Phase 1: Testnet (now)**
- Use `SIGNER_MODE=direct` for rapid testing
- Validate all tournament flows work

**Phase 2: Testnet + SuperRise (next week)**
- Deploy SuperRise wallet-server locally
- Switch to `SIGNER_MODE=superrise`
- Test with real wallet isolation
- Build owner UI for approval/audit

**Phase 3: Mainnet (March 25, hackathon)**
- Same code, real CKB mainnet
- Owner controls escrow wallet
- Participants trust SuperRise isolation

## References

- SuperRise wallet-server: `/home/phill/.openclaw/workspace/superise/apps/wallet-server`
- Wallet domain model: `/home/phill/.openclaw/workspace/superise/design/architecture/06-wallet-domain-and-use-cases.md`
- REST API: SuperRise wallet-server documentation

---

**TL;DR:**

- **Testnet MVP:** Use `SIGNER_MODE=direct` (fast, simple)
- **Testnet + security:** Use `SIGNER_MODE=superrise` (isolated key)
- **Mainnet:** Must use SuperRise (production requirement)
