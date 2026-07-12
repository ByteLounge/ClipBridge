use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use x25519_dalek::{PublicKey, StaticSecret};
use std::error::Error;
use rand::RngCore;

/// Generates a new X25519 private key (StaticSecret) and its public key bytes.
pub fn generate_x25519_keypair() -> (StaticSecret, Vec<u8>) {
    let mut rng = rand::thread_rng();
    let secret = StaticSecret::random_from_rng(&mut rng);
    let public = PublicKey::from(&secret);
    (secret, public.as_bytes().to_vec())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    use sha2::{Sha256, Digest};
    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    
    let mut formatted_key = [0u8; 64];
    if key.len() > 64 {
        let hash = Sha256::digest(key);
        formatted_key[..32].copy_from_slice(&hash);
    } else {
        formatted_key[..key.len()].copy_from_slice(key);
    }
    
    for i in 0..64 {
        ipad[i] ^= formatted_key[i];
        opad[i] ^= formatted_key[i];
    }
    
    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(data);
    let inner_hash = inner.finalize();
    
    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(&inner_hash);
    let outer_hash = outer.finalize();
    
    outer_hash.into()
}

/// Derives a shared symmetric key (AES-256) from a local private key and a peer's public key using standard HKDF-SHA256.
pub fn derive_shared_key(
    private_key: &StaticSecret,
    peer_public_key_bytes: &[u8],
) -> Result<Vec<u8>, Box<dyn Error>> {
    if peer_public_key_bytes.len() != 32 {
        return Err("Invalid public key length".into());
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(peer_public_key_bytes);
    
    let peer_public = PublicKey::from(arr);
    let shared_secret = private_key.diffie_hellman(&peer_public);
    
    // Standard HKDF-SHA256 (32-byte salt of zeros, info: "clipbridge-sync-key")
    let salt = [0u8; 32];
    let prk = hmac_sha256(&salt, shared_secret.as_bytes());
    
    let mut expand_data = b"clipbridge-sync-key".to_vec();
    expand_data.push(1); // Block counter 1
    let k_sync = hmac_sha256(&prk, &expand_data);
    
    Ok(k_sync.to_vec())
}

/// Encrypts a message using AES-256-GCM with the derived symmetric key.
pub fn encrypt_aes_gcm(
    key_bytes: &[u8],
    plaintext: &[u8],
    nonce_bytes: &[u8; 12],
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn Error>> {
    let cipher = Aes256Gcm::new_from_slice(key_bytes)
        .map_err(|e| format!("Cipher key init failed: {}", e))?;
    
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let encrypted_data = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;
    
    // Split ciphertext and 16-byte GCM tag
    if encrypted_data.len() < 16 {
        return Err("Ciphertext too short".into());
    }
    
    let tag_pos = encrypted_data.len() - 16;
    let ciphertext = encrypted_data[..tag_pos].to_vec();
    let tag = encrypted_data[tag_pos..].to_vec();
    
    Ok((ciphertext, tag))
}

/// Decrypts a message using AES-256-GCM.
pub fn decrypt_aes_gcm(
    key_bytes: &[u8],
    ciphertext: &[u8],
    nonce_bytes: &[u8; 12],
    tag_bytes: &[u8],
) -> Result<Vec<u8>, Box<dyn Error>> {
    let cipher = Aes256Gcm::new_from_slice(key_bytes)
        .map_err(|e| format!("Cipher key init failed: {}", e))?;
    
    let nonce = Nonce::from_slice(nonce_bytes);
    
    // Reconstruct ciphertext + tag
    let mut full_payload = ciphertext.to_vec();
    full_payload.extend_from_slice(tag_bytes);
    
    let decrypted = cipher.decrypt(nonce, full_payload.as_slice())
        .map_err(|e| format!("Decryption failed: {}", e))?;
    
    Ok(decrypted)
}

/// Helper to generate a unique 12-byte initialization vector (nonce)
pub fn generate_nonce() -> [u8; 12] {
    let mut nonce = [0u8; 12];
    
    // First 8 bytes: Unix timestamp in ms
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    nonce[0..8].copy_from_slice(&now.to_be_bytes());

    // Remaining 4 bytes: Random padding
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut nonce[8..12]);

    nonce
}
