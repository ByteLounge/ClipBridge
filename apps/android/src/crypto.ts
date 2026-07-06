import './polyfills';
import { x25519 } from '@noble/curves/ed25519';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

const forge = require('node-forge');

// Hex converter helpers
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

const bytesToBinary = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return bin;
};

const binaryToBytes = (binStr: string): Uint8Array => {
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
};

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
  
  const salt = new Uint8Array(32);
  const extractInput = new Uint8Array(salt.length + sharedSecret.length);
  extractInput.set(salt, 0);
  extractInput.set(sharedSecret, salt.length);
  
  const prkHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Buffer.from(extractInput).toString('base64'),
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  
  const prk = hexToBytes(prkHex);

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

  const view = new DataView(nonce.buffer);
  view.setBigUint64(0, BigInt(now), false);

  const randomBytes = Crypto.getRandomBytes(4);
  nonce.set(randomBytes, 8);

  return nonce;
}

/**
 * Encrypts payload using AES-256-GCM.
 * Returns Promise<{ ciphertext: string, tag: string }>
 */
export async function encryptPayload(
  key: Uint8Array,
  plaintext: string,
  nonce: Uint8Array
): Promise<{ ciphertext: string; tag: string }> {
  const keyBytes = forge.util.createBuffer(bytesToBinary(key));
  const nonceBytes = forge.util.createBuffer(bytesToBinary(nonce));
  const ptRaw = forge.util.createBuffer(plaintext, 'utf8');

  // Initialize forge cipher
  const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
  cipher.start({ iv: nonceBytes });
  cipher.update(ptRaw);
  cipher.finish();

  const ctBytes = binaryToBytes(cipher.output.getBytes());
  const tagBytes = binaryToBytes(cipher.mode.tag.getBytes());

  return {
    ciphertext: bytesToHex(ctBytes),
    tag: bytesToHex(tagBytes)
  };
}

/**
 * Decrypts payload using AES-256-GCM.
 * Returns decrypted plaintext string.
 */
export async function decryptPayload(
  key: Uint8Array,
  ciphertextHex: string,
  nonce: Uint8Array,
  tagHex: string
): Promise<string> {
  const keyBytes = forge.util.createBuffer(bytesToBinary(key));
  const nonceBytes = forge.util.createBuffer(bytesToBinary(nonce));
  const ctBytes = forge.util.createBuffer(bytesToBinary(hexToBytes(ciphertextHex)));
  const tagBytes = forge.util.createBuffer(bytesToBinary(hexToBytes(tagHex)));

  // Initialize forge decipher
  const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);
  decipher.start({ iv: nonceBytes, tag: tagBytes });
  decipher.update(ctBytes);
  
  const pass = decipher.finish();
  if (!pass) {
    throw new Error('AES-GCM Decryption Integrity Verification Failed');
  }

  return decipher.output.toString();
}
