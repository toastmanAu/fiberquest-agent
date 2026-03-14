# Building & Signing Tournament Entry Transactions

## Overview

FiberQuest tournaments require CKB deposits with the **tournament ID embedded in the transaction data field**. The website/app builds the transaction locally, signs it with JoyID, and submits to the network.

## Method 1: CCC SDK (Recommended)

The cleanest way using the official Nervos CKB SDK:

```javascript
import ccc from '@ckb-ccc/core';

// Connect to testnet
const client = new ccc.ClientPublicTestnet();

// Build transaction with tournament ID in data field
const tx = await client.buildTransfer({
  from: playerAddress,
  to: escrowAddress,
  amount: ccc.Fixed.from('61'), // 61 CKB (minimum to avoid dust)
  data: 'tournament-1773493181771-j2tkmb', // ⭐ Tournament ID
});

// Sign with JoyID
const signed = await signer.signTransaction(tx);

// Send to network
const txHash = await client.sendTransaction(signed);
console.log('Transaction sent:', txHash);

// Agent detects within ~12 seconds
```

## Method 2: Manual Transaction Assembly

For more control, build the transaction manually:

```javascript
const tx = {
  version: '0',
  cellDeps: [
    // Standard secp256k1 lock (testnet)
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
    // Your UTXO
    {
      previousOutput: {
        txHash: '0x...', // Your actual UTXO hash
        index: '0',
      },
      since: '0',
    },
  ],
  outputs: [
    // Escrow output with tournament ID
    {
      capacity: '61000000000', // 61 CKB
      lock: {
        codeHash: '0x9bd7e06f3ecf4be50f9870fbf89682bab4c3f6c6a3b1e5c0f0f6d0c0e0f0e0f0e',
        hashType: 'type',
        args: escrowLockArgs,
      },
      type: null,
    },
    // Change output
    {
      capacity: changeAmount.toString(),
      lock: {
        codeHash: '0x9bd7e06f3ecf4be50f9870fbf89682bab4c3f6c6a3b1e5c0f0f6d0c0e0f0e0f0e',
        hashType: 'type',
        args: playerLockArgs,
      },
      type: null,
    },
  ],
  outputsData: [
    // ⭐ Tournament ID in hex
    '0x' + Buffer.from('tournament-1773493181771-j2tkmb').toString('hex'),
    '0x', // Change output has no data
  ],
  witnesses: [
    '0x', // Signature placeholder
  ],
};
```

## Method 3: ckb-cli (Command Line)

Once ckb-cli is properly configured:

```bash
ckb-cli wallet transfer \
  --from-account <your-address> \
  --to-address ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9 \
  --capacity 61 \
  --to-data 0x746f75726e616d656e742d313737333439333138313737312d6a32746b6d62
```

## Transaction Requirements

| Field | Value | Notes |
|-------|-------|-------|
| **Amount** | 61 CKB | Minimum (prevents dust) |
| **To Address** | `ckt1qzda0cr08m85...` | Escrow address |
| **Data Field** | Tournament ID (UTF-8 or hex) | Agent extracts this to identify tournament |
| **Fee** | 0.001 CKB | Standard testnet fee |

## Data Field Format

Tournament ID can be encoded two ways:

**UTF-8 (simpler):**
```
data: "tournament-1773493181771-j2tkmb"
```

**Hex (for strict data compatibility):**
```
data: "0x746f75726e616d656e742d313737333439333138313737312d6a32746b6d62"
```

Both are equivalent. Agent handles both.

## Website Integration

The `TournamentJoinButton.jsx` component automatically:
1. Builds the transaction with tournament ID in data field
2. Signs with JoyID
3. Submits to testnet
4. Notifies the player

User flow:
```
Player clicks "Join" 
  ↓ (website builds TX with tournament ID)
  ↓ (JoyID signs)
  ↓ (TX submitted to testnet)
  ↓ (6 seconds: confirmed)
  ↓ (12 seconds: agent detects)
  ↓ (player entry created)
```

## Testing

### Generate a test transaction:
```bash
node build-entry-tx.js tournament-1773493181771-j2tkmb \
  ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqv5emmruh9u256aaa4l2a4nw3qf3n8fksq60duk9 \
  ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqf5jxwwmdpyxcaavg0nzszgzfn3244326qfjeq82
```

### Watch agent detect:
```bash
ssh fiberquest "sudo journalctl -u fiberquest-agent -f" | grep Entry
```

## Common Issues

### "Cell not found"
- Player address doesn't have a live UTXO
- Solution: Check balance first (`ckb-cli wallet get-capacity`)

### "Data field not detected"
- Tournament ID wasn't included in the transaction data field
- Solution: Verify `outputsData[0]` contains the hex-encoded tournament ID

### Agent doesn't detect within 12 seconds
- Transaction may still be pending
- Check testnet block height (updates ~6s)
- Agent polling interval is 12s (2 blocks)

## References

- CCC SDK: https://github.com/ckb-js/ccc
- CKB Transaction Format: https://github.com/nervosnetwork/ckb-spec
- testnet.ckb.dev: CKB testnet RPC
