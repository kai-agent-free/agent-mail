const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { encodeURL, createQR } = require('@solana/pay');
const crypto = require('crypto');

// Solana connection (mainnet for production)
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// Our receiving wallet (AgentWallet Solana address)
const RECIPIENT = new PublicKey('6jdAMtg9iFtKnLqTzXgDbfXGQSfzgTUQNAhwrhURZnHL');

// USDC on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Pricing
const PRICES = {
  mailbox_basic: 0.50,      // $0.50 USDC for basic mailbox
  mailbox_premium: 2.00,    // $2 USDC for premium (more storage, custom domain)
  send_email: 0.01,         // $0.01 per outbound email
};

/**
 * Create a Solana Pay payment request
 */
function createPaymentRequest(type, agentId) {
  const amount = PRICES[type];
  if (!amount) {
    throw new Error(`Unknown payment type: ${type}`);
  }

  const reference = new PublicKey(crypto.randomBytes(32));
  
  const url = encodeURL({
    recipient: RECIPIENT,
    amount: amount,
    splToken: USDC_MINT,
    reference: reference,
    label: 'Agent Mail',
    message: `Payment for ${type} - Agent ${agentId}`,
    memo: `agentmail:${type}:${agentId}`,
  });

  return {
    url: url.toString(),
    reference: reference.toBase58(),
    amount: amount,
    type: type,
    recipient: RECIPIENT.toBase58(),
    currency: 'USDC',
  };
}

/**
 * Verify a payment was completed
 */
async function verifyPayment(reference) {
  try {
    const referenceKey = new PublicKey(reference);
    
    // Find transactions that reference this payment
    const signatures = await connection.getSignaturesForAddress(referenceKey, {
      limit: 1,
    });

    if (signatures.length === 0) {
      return { verified: false, status: 'pending' };
    }

    const signature = signatures[0].signature;
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
    });

    if (!tx) {
      return { verified: false, status: 'pending' };
    }

    // Check if transaction was successful
    if (tx.meta?.err) {
      return { verified: false, status: 'failed', error: tx.meta.err };
    }

    return {
      verified: true,
      status: 'confirmed',
      signature: signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return { verified: false, status: 'error', error: error.message };
  }
}

/**
 * Get payment status by checking recent transactions
 */
async function getPaymentStatus(reference) {
  return verifyPayment(reference);
}

module.exports = {
  createPaymentRequest,
  verifyPayment,
  getPaymentStatus,
  PRICES,
  RECIPIENT: RECIPIENT.toBase58(),
};
