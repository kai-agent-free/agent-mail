/**
 * Agent Mail v0.8 - Encrypt on Arrival
 * 
 * Uses NaCl box encryption (curve25519-xsalsa20-poly1305)
 * Compatible with Solana wallet keypairs (ed25519 -> x25519 conversion)
 */

const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

// Server keypair - generated once, used for all encryptions
// In production, this should be stored securely
let serverKeyPair = null;

function getServerKeyPair() {
  if (!serverKeyPair) {
    // Generate ephemeral keypair for this server session
    // For persistent encryption, store this in secrets
    serverKeyPair = nacl.box.keyPair();
  }
  return serverKeyPair;
}

/**
 * Encrypt content for an agent using their public key
 * @param {string} content - Plaintext content to encrypt
 * @param {string} agentPublicKeyBase64 - Agent's public key (base64)
 * @returns {Object} { encrypted: base64, nonce: base64, serverPublicKey: base64 }
 */
function encryptForAgent(content, agentPublicKeyBase64) {
  try {
    const agentPublicKey = naclUtil.decodeBase64(agentPublicKeyBase64);
    const message = naclUtil.decodeUTF8(content);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const serverKeys = getServerKeyPair();
    
    const encrypted = nacl.box(message, nonce, agentPublicKey, serverKeys.secretKey);
    
    return {
      encrypted: naclUtil.encodeBase64(encrypted),
      nonce: naclUtil.encodeBase64(nonce),
      serverPublicKey: naclUtil.encodeBase64(serverKeys.publicKey)
    };
  } catch (err) {
    console.error('Encryption error:', err);
    throw new Error('Failed to encrypt content: ' + err.message);
  }
}

/**
 * Decrypt content (for testing/verification)
 * @param {string} encryptedBase64 - Encrypted content (base64)
 * @param {string} nonceBase64 - Nonce (base64)
 * @param {string} senderPublicKeyBase64 - Sender's public key (base64)
 * @param {Uint8Array} secretKey - Recipient's secret key
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedBase64, nonceBase64, senderPublicKeyBase64, secretKey) {
  const encrypted = naclUtil.decodeBase64(encryptedBase64);
  const nonce = naclUtil.decodeBase64(nonceBase64);
  const senderPublicKey = naclUtil.decodeBase64(senderPublicKeyBase64);
  
  const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, secretKey);
  if (!decrypted) {
    throw new Error('Decryption failed - invalid key or corrupted data');
  }
  
  return naclUtil.encodeUTF8(decrypted);
}

/**
 * Generate a new keypair for an agent
 * @returns {Object} { publicKey: base64, secretKey: base64 }
 */
function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey)
  };
}

/**
 * Validate a public key format
 * @param {string} publicKeyBase64 - Public key to validate
 * @returns {boolean} True if valid
 */
function isValidPublicKey(publicKeyBase64) {
  try {
    const decoded = naclUtil.decodeBase64(publicKeyBase64);
    return decoded.length === nacl.box.publicKeyLength;
  } catch {
    return false;
  }
}

/**
 * Convert ed25519 public key (Solana) to x25519 (NaCl box)
 * Note: This requires additional library for proper conversion
 * For now, agents should provide x25519 keys directly
 */
function ed25519ToX25519(ed25519PublicKey) {
  // TODO: Implement proper conversion using tweetnacl-util or ed2curve
  // For MVP, require agents to provide x25519 keys
  throw new Error('ed25519 to x25519 conversion not yet implemented. Please provide x25519 public key.');
}

module.exports = {
  encryptForAgent,
  decrypt,
  generateKeyPair,
  isValidPublicKey,
  getServerKeyPair
};
