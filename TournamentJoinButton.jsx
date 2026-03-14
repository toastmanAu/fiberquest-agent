import { useCcc } from '@ckb-ccc/connector-react';
import { useCallback, useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Tournament Join Button with JoyID Integration
 * 
 * Connects FiberQuest website to agent API (Pi 5 port 3001)
 * Handles JoyID signing + deposit with tournament ID in data field
 */

export function TournamentJoinButton({ tournament, onSuccess }) {
  const { signerInfo, open } = useCcc();
  const [status, setStatus] = useState('idle');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');

  const handleJoin = useCallback(async () => {
    if (!signerInfo?.signer) {
      open();
      return;
    }

    setStatus('signing');
    setError('');

    try {
      // Get signer address
      const address = signerInfo.address;

      // Notify agent of intent
      const joinRes = await axios.post('http://192.168.68.65:3001/api/tournament/join', {
        tournamentId: tournament.id,
        playerAddr: address,
        // JoyID will sign the actual TX
        joyidTx: null, // Placeholder until actual TX
      });

      setStatus('submitted');
      console.log('Entry submitted:', joinRes.data);

      // Now prompt user to send the actual CKB deposit
      // In a real integration, this would invoke JoyID to sign + send the TX
      const depositTxHash = await signAndSendDeposit(address, tournament);

      if (depositTxHash) {
        setTxHash(depositTxHash);
        setStatus('pending');
        console.log('✅ Deposit sent:', depositTxHash);
      }
    } catch (e) {
      setStatus('error');
      setError(e.response?.data?.error || e.message);
      console.error('Error joining tournament:', e);
    }
  }, [signerInfo, tournament, open]);

  return (
    <div className="tournament-join">
      <button
        onClick={handleJoin}
        disabled={status === 'signing' || status === 'submitted'}
        className={`join-btn ${status}`}
      >
        {status === 'idle' && `Join (${tournament.entryFee / 1e8} CKB)`}
        {status === 'signing' && 'Signing...'}
        {status === 'submitted' && 'Sending TX...'}
        {status === 'pending' && '⏳ Awaiting Confirmation'}
        {status === 'error' && 'Error - Try Again'}
      </button>

      {txHash && (
        <p className="tx-info">
          TX: <code>{txHash.substring(0, 20)}...</code>
        </p>
      )}

      {status === 'pending' && (
        <p className="pending-info">
          ✅ Entry submitted! Agent will confirm within ~12 seconds.
        </p>
      )}

      {error && (
        <p className="error-info">
          ❌ {error}
        </p>
      )}
    </div>
  );
}

/**
 * Sign and send deposit TX (placeholder - needs JoyID integration)
 */
async function signAndSendDeposit(playerAddr, tournament) {
  console.log('TODO: Integrate with JoyID to sign + send deposit TX');
  console.log('Tournament ID for data field:', tournament.id);
  console.log('Entry fee:', tournament.entryFee);
  
  // In a real implementation:
  // 1. Build unsigned CKB TX with:
  //    - to: escrow address
  //    - amount: tournament.entryFee
  //    - data: tournament.id (UTF-8 or hex)
  // 2. Sign with JoyID
  // 3. Send to CKB network
  // 4. Return TX hash
  
  return null;
}

export default TournamentJoinButton;
