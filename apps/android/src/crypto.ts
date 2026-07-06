import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

// Hex converter helper
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return result;
}

/**
 * Generates X25519 private key and matching public key.
 */
export function generateX25519KeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Computes shared secret via X25519 and expands it to a 256-bit symmetric key using HKDF-SHA256.
 */
export async function deriveSharedKey(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = x25519.getSharedSecret(privateKey, peerPublicKey);
  
  // Custom simple HKDF-SHA256 extraction & expansion using expo-crypto SHA-256
  // Extract: SHA-256(salt=all_zeros, sharedSecret)
  const salt = new Uint8Array(32);
  const extractInput = new Uint8Array(salt.length + sharedSecret.length);
  extractInput.set(salt, 0);
  extractInput.set(sharedSecret, salt.length);
  
  // Calculate SHA-256 hash using expo-crypto
  const prkHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Buffer.from(extractInput).toString('base64'),
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  
  const prk = hexToBytes(prkHex);

  // Expand: SHA-256(prk, info + counter)
  const info = new TextEncoder().encode('clipbridge-sync-key');
  const expandInput = new Uint8Array(prk.length + info.length + 1);
  expandInput.set(prk, 0);
  expandInput.set(info, prk.length);
  expandInput[prk.length + info.length] = 1; // counter = 1

  const syncKeyHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Buffer.from(expandInput).toString('base64'),
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  return hexToBytes(syncKeyHex);
}

/**
 * Generates a unique 12-byte initialization vector (nonce).
 */
export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(12);
  const now = Date.now();

  // First 8 bytes: timestamp
  const view = new DataView(nonce.buffer);
  view.setBigUint64(0, BigInt(now), false); // Big endian

  // Last 4 bytes: random bytes
  const randomBytes = Crypto.getRandomBytes(4);
  nonce.set(randomBytes, 8);

  return nonce;
}

/**
 * Encrypts payload using AES-256-GCM.
 * Returns { ciphertext: hex, tag: hex }
 */
export function encryptPayload(
  key: Uint8Array,
  plaintext: string,
  nonce: Uint8Array
): { ciphertext: string; tag: string } {
  const ptBytes = new TextEncoder().encode(plaintext);
  const aesGcm = gcm(key, nonce);
  
  const encrypted = aesGcm.encrypt(ptBytes);
  
  // noble-ciphers AES-GCM output is [ciphertext + tag]
  // Tag size is 16 bytes
  const tagSize = 16;
  const ciphertextBytes = encrypted.subarray(0, encrypted.length - tagSize);
  const tagBytes = encrypted.subarray(encrypted.length - tagSize);

  return {
    ciphertext: bytesToHex(ciphertextBytes),
    tag: bytesToHex(tagBytes)
  };
}

/**
 * Decrypts payload using AES-256-GCM.
 * Returns decrypted plaintext string.
 */
export function decryptPayload(
  key: Uint8Array,
  ciphertextHex: string,
  nonce: Uint8Array,
  tagHex: string
): string {
  const ciphertext = hexToBytes(ciphertextHex);
  const tag = hexToBytes(tagHex);

  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext, 0);
  encrypted.set(tag, ciphertext.length);

  const aesGcm = gcm(key, nonce);
  const decryptedBytes = aesGcm.decrypt(encrypted);

  return new TextDecoder().decode(decryptedBytes);
}
