# Website Integration Guide

## React Component: Tournament Entry with JoyID

```tsx
import { useCcc } from '@ckb-ccc/react';
import { useCallback, useState } from 'react';

export function TournamentJoinButton({ tournament }) {
  const { signerInfo, open } = useCcc();
  const [status, setStatus] = useState('idle');
  const [txHash, setTxHash] = useState('');

  const handleJoin = useCallback(async () => {
    if (!signerInfo?.signer) {
      open();
      return;
    }

    setStatus('signing');

    try {
      // Build CKB transaction with JoyID data field
      const tx = {
        version: '0',
        cellDeps: [/* standard cell deps */],
        headerDeps: [],
        inputs: [
          {
            previousOutput: {
              txHash: signerInfo.signer.publicKey, // Use signer's output
              index: '0',
            },
            since: '0',
          },
        ],
        outputs: [
          {
            capacity: tournament.entryFee, // Entry fee in Shannon (e.g., "1000000000")
            lock: {
              codeHash: /* lock script code hash */,
              hashType: 'type',
              args: signerInfo.signer.publicKey,
            },
            type: null,
            data: tournament.id, // Tournament ID (UTF-8 or hex)
          },
        ],
        outputsData: [
          // Include tournament ID in hex format
          '0x' + Buffer.from(tournament.id).toString('hex'),
        ],
        witnesses: [/* signature placeholder */],
      };

      // Sign with JoyID
      const signedTx = await signerInfo.signer.signTransaction(tx);

      setStatus('submitted');
      setTxHash(signedTx.hash);

      // Notify agent
      const response = await fetch('http://localhost:3001/api/tournament/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          playerAddr: signerInfo.address,
          joyidTx: signedTx,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setStatus('pending');
        console.log('✅ Entry submitted. Awaiting on-chain confirmation:', result);
      } else {
        setStatus('error');
        console.error('❌ Entry failed:', result.error);
      }
    } catch (e) {
      setStatus('error');
      console.error('Error joining tournament:', e);
    }
  }, [signerInfo, tournament]);

  return (
    <div className="tournament-join">
      <button
        onClick={handleJoin}
        disabled={status === 'signing' || status === 'submitted'}
        className={`join-btn ${status}`}
      >
        {status === 'idle' && `Join (${tournament.entryFee} CKB)`}
        {status === 'signing' && 'Signing...'}
        {status === 'submitted' && 'Sending TX...'}
        {status === 'pending' && '⏳ Awaiting Confirmation'}
        {status === 'error' && 'Error - Try Again'}
      </button>

      {txHash && (
        <p className="tx-info">
          TX: <code>{txHash.substring(0, 16)}...</code>
        </p>
      )}

      {status === 'pending' && (
        <p className="pending-info">
          ✅ Entry submitted! Agent will confirm within ~12 seconds.
        </p>
      )}
    </div>
  );
}
```

## Usage in Tournament Page

```tsx
import { TournamentJoinButton } from './components/TournamentJoinButton';

export function TournamentDetail({ tournamentId }) {
  const [tournament, setTournament] = useState(null);

  useEffect(() => {
    fetch(`http://localhost:3001/api/tournament/${tournamentId}`)
      .then(r => r.json())
      .then(({ tournament, playerCount, spotsRemaining }) => {
        setTournament({ ...tournament, playerCount, spotsRemaining });
      });
  }, [tournamentId]);

  return (
    <div className="tournament-detail">
      <h1>{tournament?.gameId}</h1>
      <p>Entry Fee: {tournament?.entryFee} CKB</p>
      <p>Prize Pool: {tournament?.prizePool} CKB</p>
      <p>Players: {tournament?.playerCount}/{tournament?.maxPlayers}</p>

      {tournament?.spotsRemaining > 0 ? (
        <TournamentJoinButton tournament={tournament} />
      ) : (
        <p className="closed">Tournament is full</p>
      )}

      <div className="participants">
        <h3>Participants</h3>
        {/* List will auto-update as new players join (via polling or WebSocket) */}
      </div>
    </div>
  );
}
```

## Agent API Contract

### POST /api/tournament/join

**Request:**
```json
{
  "tournamentId": "INV-2026-0042",
  "playerAddr": "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0...",
  "joyidTx": {
    "hash": "0x1234567890abcdef...",
    "inputs": [...],
    "outputs": [
      {
        "capacity": "1000000000",
        "lock": {...},
        "data": "0x494e562d323032362d303034322"
      }
    ],
    "outputsData": ["0x494e562d323032362d303034322"],
    ...
  }
}
```

**Response (Success):**
```json
{
  "status": "pending",
  "message": "Entry transaction submitted. Awaiting on-chain confirmation.",
  "txHash": "0x...",
  "estimatedConfirmationTime": "~6 seconds (1 block)"
}
```

**Response (Error):**
```json
{
  "error": "Tournament not found or closed"
}
```

### GET /api/tournament/<id>

**Response:**
```json
{
  "tournament": {
    "id": "INV-2026-0042",
    "gameId": "pokemon-fire-red",
    "entryFee": "1000000000",
    "prizePool": "4000000000",
    "maxPlayers": 4,
    "minPlayers": 2,
    "status": "recruiting"
  },
  "playerCount": 2,
  "spotsRemaining": 2
}
```

### GET /api/player/<addr>/entries

**Response:**
```json
{
  "entries": [
    {
      "id": "entry-0x123abc...-1234567890",
      "tournamentId": "INV-2026-0042",
      "playerId": "ckt1qzda...",
      "status": "joined",
      "escrowTxHash": "0x...",
      "score": null,
      "payout": null,
      "createdAt": 1710340800,
      "submittedAt": null,
      "validatedAt": null
    }
  ]
}
```

## Real-Time Updates (WebSocket)

Optional: Add WebSocket server to agent for real-time tournament updates:

```tsx
const [players, setPlayers] = useState([]);

useEffect(() => {
  const ws = new WebSocket('ws://localhost:3001/tournament/' + tournamentId);

  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    if (update.type === 'player-joined') {
      setPlayers(prev => [...prev, update.player]);
    }
  };

  return () => ws.close();
}, [tournamentId]);
```

## Testing the Flow

### 1. Create a test tournament
```bash
curl -X POST http://localhost:3001/api/tournament/create \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "pokemon-fire-red",
    "entryFee": "1000000000",
    "prizePool": "4000000000",
    "maxPlayers": 2,
    "minPlayers": 2
  }'
# Returns: {"tournamentId": "tournament-1710340800000-abc123", ...}
```

### 2. Simulate player entry (via website or curl)
```bash
# Website: Click "Join" button, confirm in JoyID app

# Or simulate via curl:
curl -X POST http://localhost:3001/api/tournament/join \
  -H 'Content-Type: application/json' \
  -d '{
    "tournamentId": "tournament-1710340800000-abc123",
    "playerAddr": "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9",
    "joyidTx": {
      "hash": "0x...",
      ...
    }
  }'
```

### 3. Check tournament status
```bash
curl http://localhost:3001/api/tournament/tournament-1710340800000-abc123
# Should show playerCount increasing
```

### 4. Verify deposits were detected
```bash
# Check agent logs:
sudo journalctl -u fiberquest-agent -f
# Should see: "[Entry] Deposit detected: ckt1qz... → Tournament tournament-1... | 10 CKB"
```

## Performance Tuning

- **Entry polling**: Default 12s (2 blocks). Reduce to 6s for faster UX (if NucBox RPC can handle it).
- **Validation timeout**: Default 60s. Deepseek reasoning may take 30-40s; adjust if needed.
- **Settlement**: Default fire-and-forget. Can add confirmation polling if needed.

## Error Handling

- **Tournament closed**: User sees "Tournament is full" or "Tournament not found"
- **TX failed**: User sees "Error - Try Again", can resubmit
- **Timeout**: If agent doesn't confirm within 30s, show "Still waiting..." with retry option
- **Double entry**: Agent rejects with "Player already entered"
