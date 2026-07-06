package com.clipbridge.data

import java.security.*
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.random.Random

object CryptoManager {

    /**
     * Generates a new ephemeral X25519 PrivateKey and its encoded PublicKey byte array.
     */
    fun generateKeyPair(): Pair<PrivateKey, ByteArray> {
        val kpg = KeyPairGenerator.getInstance("XDH")
        kpg.initialize(255)
        val kp = kpg.generateKeyPair()
        return Pair(kp.private, kp.public.encoded)
    }

    /**
     * Computes the X25519 Shared Secret and derives a 256-bit symmetric key using HKDF-SHA256.
     */
    fun deriveSharedKey(localPrivateKey: PrivateKey, peerPublicKeyBytes: ByteArray): ByteArray {
        // Parse peer's X.509 encoded public key
        val kf = KeyFactory.getInstance("XDH")
        val pubKeySpec = X509EncodedKeySpec(peerPublicKeyBytes)
        val peerPublicKey = kf.generatePublic(pubKeySpec)

        // Perform X25519 Key Agreement
        val ka = KeyAgreement.getInstance("XDH")
        ka.init(localPrivateKey)
        ka.doPhase(peerPublicKey, true)
        val sharedSecret = ka.generateSecret()

        // Derive 32-byte symmetric key via simple HKDF-SHA256 Expand
        return hkdfExpand(sharedSecret, "clipbridge-sync-key".toByteArray())
    }

    /**
     * Encrypts plaintext using AES-256-GCM.
     * Returns Triple(ciphertext, tag, nonce)
     */
    fun encrypt(key: ByteArray, plaintext: ByteArray, nonce: ByteArray): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(key, "AES")
        val spec = GCMParameterSpec(128, nonce) // 128 bit auth tag size
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec)
        
        val encrypted = cipher.doFinal(plaintext)
        
        // Split ciphertext and 16-byte GCM tag
        val tagSize = 16
        val ciphertext = encrypted.copyOfRange(0, encrypted.size - tagSize)
        val tag = encrypted.copyOfRange(encrypted.size - tagSize, encrypted.size)
        
        return Pair(ciphertext, tag)
    }

    /**
     * Decrypts ciphertext using AES-256-GCM and verifies authentication tag.
     */
    fun decrypt(key: ByteArray, ciphertext: ByteArray, nonce: ByteArray, tag: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(key, "AES")
        val spec = GCMParameterSpec(128, nonce)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)

        // Reconstruct cipher input payload + tag
        val encrypted = ByteArray(ciphertext.size + tag.size)
        System.arraycopy(ciphertext, 0, encrypted, 0, ciphertext.size)
        System.arraycopy(tag, 0, encrypted, ciphertext.size, tag.size)

        return cipher.doFinal(encrypted)
    }

    /**
     * Generates a unique 12-byte initialization vector (nonce)
     */
    fun generateNonce(): ByteArray {
        val nonce = ByteArray(12)
        val now = System.currentTimeMillis()
        
        // Put timestamp in first 8 bytes
        for (i in 0..7) {
            nonce[i] = (now ushr ((7 - i) * 8)).toByte()
        }
        
        // Random bytes for last 4 bytes
        val rand = Random.nextBytes(4)
        System.arraycopy(rand, 0, nonce, 8, 4)
        
        return nonce
    }

    /**
     * Simplified HKDF-SHA256 implementation
     */
    private fun hkdfExpand(ikm: ByteArray, info: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        // Step 1: Extract (Assume salt is empty)
        val salt = ByteArray(32)
        mac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)

        // Step 2: Expand to 32 bytes (1 block of SHA256)
        mac.init(SecretKeySpec(prk, "HmacSHA256"))
        mac.update(info)
        mac.update(1.toByte())
        val output = mac.doFinal()
        return output.copyOf(32)
    }
}
