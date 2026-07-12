use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use std::path::PathBuf;
use std::fs;
use hex;
use dirs;
use hostname;
use crate::crypto::{derive_shared_key, decrypt_aes_gcm, encrypt_aes_gcm, generate_nonce};
use crate::clipboard::{self, ClipboardUpdate};

// Configuration & DB files path
fn get_config_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("ClipBridge");
    let _ = fs::create_dir_all(&path);
    path
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub key: Vec<u8>, // derived 32-byte sync key
    pub last_active: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ClipboardItem {
    pub id: String,
    pub timestamp: u64,
    pub data_type: String,
    pub content: String,
    pub origin_device_name: String,
    pub is_pinned: bool,
}

pub struct ServerState {
    pub device_id: String,
    pub display_name: String,
    pub paired_devices: HashMap<String, PairedDevice>,
    pub history: Vec<ClipboardItem>,
    // Active connections sender channels: peer_device_id -> Channel
    pub active_txs: HashMap<String, broadcast::Sender<String>>,
    // Ephemeral pairing keys (e.g. current private key used for displaying QR code)
    pub ephemeral_pairing_key: Option<Vec<u8>>, // Private key bytes (X25519)
    pub ephemeral_public_key: Option<Vec<u8>>,  // Public key bytes (X25519)
}

pub static STATE: Lazy<Arc<Mutex<ServerState>>> = Lazy::new(|| {
    let device_id = Uuid::new_v4().to_string();
    let display_name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Desktop PC".to_string());
    
    // Load config from disk if exists
    let mut paired_devices = HashMap::new();
    let mut history = Vec::new();
    
    let path = get_config_dir();
    let pairing_path = path.join("pairing.json");
    if pairing_path.exists() {
        if let Ok(data) = fs::read_to_string(pairing_path) {
            if let Ok(parsed) = serde_json::from_str::<HashMap<String, PairedDevice>>(&data) {
                paired_devices = parsed;
            }
        }
    }

    let history_path = path.join("history.json");
    if history_path.exists() {
        if let Ok(data) = fs::read_to_string(history_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<ClipboardItem>>(&data) {
                history = parsed;
            }
        }
    }

    Arc::new(Mutex::new(ServerState {
        device_id,
        display_name,
        paired_devices,
        history,
        active_txs: HashMap::new(),
        ephemeral_pairing_key: None,
        ephemeral_public_key: None,
    }))
});

// Save config on changes
pub fn save_pairings() {
    let state = STATE.lock().unwrap();
    let pairing_path = get_config_dir().join("pairing.json");
    println!("[ClipBridge DB] Saving pairings to path: {:?}", pairing_path);
    match serde_json::to_string(&state.paired_devices) {
        Ok(serialized) => {
            if let Err(e) = fs::write(&pairing_path, &serialized) {
                eprintln!("[ClipBridge DB] Failed to write pairing.json: {:?}", e);
            } else {
                println!("[ClipBridge DB] Successfully saved {} paired devices.", state.paired_devices.len());
            }
        }
        Err(e) => eprintln!("[ClipBridge DB] Failed to serialize pairings: {:?}", e),
    }
}

pub fn save_history() {
    let state = STATE.lock().unwrap();
    let history_path = get_config_dir().join("history.json");
    println!("[ClipBridge DB] Saving history to path: {:?}", history_path);
    match serde_json::to_string(&state.history) {
        Ok(serialized) => {
            if let Err(e) = fs::write(&history_path, &serialized) {
                eprintln!("[ClipBridge DB] Failed to write history.json: {:?}", e);
            } else {
                println!("[ClipBridge DB] Successfully saved {} history items.", state.history.len());
            }
        }
        Err(e) => eprintln!("[ClipBridge DB] Failed to serialize history: {:?}", e),
    }
}

use uuid::Uuid;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct HandshakePayload {
    timestamp: u64,
    challenge: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct SyncEnvelope {
    sender_id: String,
    nonce: String,      // 12-byte hex IV
    ciphertext: String, // hex encoded
    tag: String,        // 16-byte hex tag
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
struct DecryptedSyncPayload {
    clip_id: String,
    timestamp: u64,
    data_type: String,
    content: String,
    origin_device_id: String,
    ttl: u8,
}

// Starts the Axum webserver in background
pub fn start_webserver(port: u16, mut clip_rx: broadcast::Receiver<ClipboardUpdate>) {
    let app = Router::new()
        .route("/pair", get(pair_handler))
        .route("/ws", get(ws_handler))
        .with_state(STATE.clone());

    // Listen loop
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
            .await
            .expect("Failed to bind network port");
        println!("Server listening on port {}", port);
        axum::serve(listener, app).await.unwrap();
    });

    // Clipboard monitoring loop (pushes changes out to WS connections)
    tokio::spawn(async move {
        loop {
            if let Ok(update) = clip_rx.recv().await {
                // Construct envelope and send to all active tx channels
                let state = STATE.lock().unwrap();
                let my_device_id = state.device_id.clone();
                let paired = state.paired_devices.clone();
                
                // Add to history
                drop(state);
                add_history_item(ClipboardItem {
                    id: update.id.clone(),
                    timestamp: update.timestamp,
                    data_type: "text".to_string(),
                    content: update.content.clone(),
                    origin_device_name: "Local Desktop".to_string(),
                    is_pinned: false,
                });

                for (peer_id, tx) in &STATE.lock().unwrap().active_txs {
                    if let Some(device) = paired.get(peer_id) {
                        let payload = DecryptedSyncPayload {
                            clip_id: update.id.clone(),
                            timestamp: update.timestamp,
                            data_type: "text".to_string(),
                            content: update.content.clone(),
                            origin_device_id: my_device_id.clone(),
                            ttl: 3,
                        };

                        if let Ok(payload_bytes) = serde_json::to_vec(&payload) {
                            let nonce = generate_nonce();
                            if let Ok((ct, tag)) = encrypt_aes_gcm(&device.key, &payload_bytes, &nonce) {
                                let env = SyncEnvelope {
                                    sender_id: my_device_id.clone(),
                                    nonce: hex::encode(nonce),
                                    ciphertext: hex::encode(ct),
                                    tag: hex::encode(tag),
                                };

                                if let Ok(env_str) = serde_json::to_string(&env) {
                                    let _ = tx.send(env_str);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

fn add_history_item(item: ClipboardItem) {
    let mut state = STATE.lock().unwrap();
    // Cap history size to 100
    if state.history.len() >= 100 {
        state.history.remove(0);
    }
    state.history.push(item);
    drop(state);
    save_history();
}

async fn pair_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<Mutex<ServerState>>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_pair_ws(socket, state))
}

async fn handle_pair_ws(mut socket: WebSocket, state: Arc<Mutex<ServerState>>) {
    // 1. Await PAIR_REQUEST from client
    let request_msg = match socket.recv().await {
        Some(Ok(Message::Text(text))) => text,
        _ => return,
    };

    #[derive(serde::Deserialize)]
    struct RawPairRequest {
        device_id: String,
        display_name: String,
        client_public_key: String, // hex encoded
    }

    let req: RawPairRequest = match serde_json::from_str(&request_msg) {
        Ok(r) => r,
        Err(_) => return,
    };

    // 2. Load ephemeral X25519 keys
    // 2. Load ephemeral X25519 keys
    let priv_key_bytes = {
        let guard = state.lock().unwrap();
        match &guard.ephemeral_pairing_key {
            Some(bytes) if bytes.len() == 32 => bytes.clone(),
            _ => return,
        }
    };

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&priv_key_bytes);
    let ephemeral_private_key = x25519_dalek::StaticSecret::from(arr);

    // 3. Compute shared secret and key derivation
    let peer_pub_bytes = match hex::decode(&req.client_public_key) {
        Ok(b) => b,
        Err(_) => return,
    };

    let derived_key = match derive_shared_key(&ephemeral_private_key, &peer_pub_bytes) {
        Ok(k) => k,
        Err(_) => return,
    };

    // 4. Store paired device
    {
        let mut guard = state.lock().unwrap();
        guard.paired_devices.insert(
            req.device_id.clone(),
            PairedDevice {
                id: req.device_id.clone(),
                name: req.display_name.clone(),
                key: derived_key,
                last_active: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            },
        );
    }
    save_pairings();

    // 5. Send PAIR_RESPONSE to client
    let (my_id, my_name, pub_key_bytes) = {
        let guard = state.lock().unwrap();
        (
            guard.device_id.clone(),
            guard.display_name.clone(),
            guard.ephemeral_public_key.clone().unwrap_or_default()
        )
    };

    #[derive(serde::Serialize)]
    struct RawPairResponse {
        #[serde(rename = "type")]
        msg_type: String,
        device_id: String,
        display_name: String,
        server_public_key: String,
    }

    let resp = RawPairResponse {
        msg_type: "PAIR_RESPONSE".to_string(),
        device_id: my_id,
        display_name: my_name,
        server_public_key: hex::encode(pub_key_bytes),
    };

    if let Ok(resp_str) = serde_json::to_string(&resp) {
        let _ = socket.send(Message::Text(resp_str)).await;
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<Mutex<ServerState>>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_live_ws(socket, state))
}

async fn handle_live_ws(socket: WebSocket, state: Arc<Mutex<ServerState>>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // 1. Authentication Handshake
    let handshake_msg = match ws_receiver.next().await {
        Some(Ok(Message::Text(text))) => text,
        Some(Ok(other)) => {
            println!("[ClipBridge Connect] Handshake failed: Received non-text message type {:?}", other);
            return;
        }
        Some(Err(e)) => {
            println!("[ClipBridge Connect] Handshake failed: Socket error: {:?}", e);
            return;
        }
        None => {
            println!("[ClipBridge Connect] Handshake failed: Client disconnected immediately.");
            return;
        }
    };

    #[derive(serde::Deserialize)]
    struct HandshakeRequest {
        device_id: String,
        nonce: String,
        encrypted_handshake: String,
    }

    let hr: HandshakeRequest = match serde_json::from_str(&handshake_msg) {
        Ok(val) => val,
        Err(e) => {
            println!("[ClipBridge Connect] Handshake failed: Invalid JSON payload. Error: {:?}", e);
            return;
        }
    };

    let paired_device = {
        let guard = state.lock().unwrap();
        guard.paired_devices.get(&hr.device_id).cloned()
    };

    let device = match paired_device {
        Some(d) => d,
        None => {
            println!("[ClipBridge Connect] Handshake failed: Device {} is not paired.", hr.device_id);
            return; // Device not paired
        }
    };

    // Decrypt handshake payload
    let nonce_bytes = match hex::decode(&hr.nonce) {
        Ok(n) if n.len() == 12 => {
            let mut arr = [0u8; 12];
            arr.copy_from_slice(&n);
            arr
        }
        _ => {
            println!("[ClipBridge Connect] Handshake failed: Invalid nonce format/length from device {}.", hr.device_id);
            return;
        }
    };

    let encrypted_bytes = match hex::decode(&hr.encrypted_handshake) {
        Ok(b) if b.len() > 16 => b,
        _ => {
            println!("[ClipBridge Connect] Handshake failed: Invalid ciphertext format from device {}.", hr.device_id);
            return;
        }
    };

    let (ct, tag) = encrypted_bytes.split_at(encrypted_bytes.len() - 16);

    let decrypted = match decrypt_aes_gcm(&device.key, ct, &nonce_bytes, tag) {
        Ok(p) => p,
        Err(e) => {
            println!("[ClipBridge Connect] Handshake failed: Decryption error for device {}. Error: {:?}", hr.device_id, e);
            return;
        }
    };

    let handshake_payload: HandshakePayload = match serde_json::from_slice(&decrypted) {
        Ok(p) => p,
        Err(e) => {
            println!("[ClipBridge Connect] Handshake failed: Payload JSON format error for device {}. Error: {:?}", hr.device_id, e);
            return;
        }
    };

    // Validate timestamp (max 5 minutes difference to prevent replays)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let diff = now.abs_diff(handshake_payload.timestamp);
    if diff > 300000 {
        println!("[ClipBridge Connect] Handshake failed: Clock skew too large for device {}. Server: {} ms, Client: {} ms, Delta: {} ms (Max: 300000 ms)",
            hr.device_id, now, handshake_payload.timestamp, diff);
        return; // Replayed handshake or out of sync clock
    }

    // Handshake successful! Register device to active tx channels.
    let peer_id = hr.device_id.clone();
    let (tx, mut rx) = broadcast::channel(16);

    {
        let mut guard = state.lock().unwrap();
        guard.active_txs.insert(peer_id.clone(), tx);
    }

    println!("[ClipBridge Connect] Secure client session established for device: {} (ID: {})", device.name, peer_id);

    // Spawn a writer task to pipe updates to this client
    let peer_id_clone = peer_id.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if msg == "UNPAIR" {
                println!("[ClipBridge Connection] UNPAIR signal received. Tearing down writer task for: {}", peer_id_clone);
                break;
            }
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break; // Connection closed
            }
        }
        // Cleanup on drop
        let mut guard = state_clone.lock().unwrap();
        guard.active_txs.remove(&peer_id_clone);
        println!("[ClipBridge Connection] Writer task cleaned up for client: {}", peer_id_clone);
    });

    // Reader task (listen for updates from this client)
    let my_device_id = {
        let guard = state.lock().unwrap();
        guard.device_id.clone()
    };

    while let Some(res) = ws_receiver.next().await {
        let msg = match res {
            Ok(m) => m,
            Err(e) => {
                println!("[ClipBridge Connection] Read error occurred for client {}: {:?}", peer_id, e);
                break;
            }
        };

        if let Message::Text(text) = msg {
            // Heartbeat check
            if text == "PING" {
                println!("[ClipBridge Heartbeat] Received PING from device {}. Returning PONG.", peer_id);
                let tx_opt = {
                    let guard = state.lock().unwrap();
                    guard.active_txs.get(&peer_id).cloned()
                };
                if let Some(active_tx) = tx_opt {
                    let _ = active_tx.send("PONG".to_string());
                }
                continue;
            }

            if let Ok(env) = serde_json::from_str::<SyncEnvelope>(&text) {
                // 1. Verify sender ID is matching this session device
                if env.sender_id != peer_id {
                    println!("[ClipBridge Sync] Warning: Envelope sender ID mismatch (got {}, expected {})", env.sender_id, peer_id);
                    continue;
                }

                // 2. Decode packet parameters
                let nonce_bytes = match hex::decode(&env.nonce) {
                    Ok(n) if n.len() == 12 => {
                        let mut arr = [0u8; 12];
                        arr.copy_from_slice(&n);
                        arr
                    }
                    _ => continue,
                };

                let ct = match hex::decode(&env.ciphertext) {
                    Ok(c) => c,
                    _ => continue,
                };

                let tag = match hex::decode(&env.tag) {
                    Ok(t) if t.len() == 16 => t,
                    _ => continue,
                };

                // 3. Decrypt and check integrity
                if let Ok(dec_bytes) = decrypt_aes_gcm(&device.key, &ct, &nonce_bytes, &tag) {
                    if let Ok(payload) = serde_json::from_slice::<DecryptedSyncPayload>(&dec_bytes) {
                        
                        // Dynamic unpairing check
                        let is_still_paired = {
                            let guard = state.lock().unwrap();
                            guard.paired_devices.contains_key(&peer_id)
                        };
                        if !is_still_paired {
                            println!("[ClipBridge Connection] Device {} is no longer paired. Terminating session.", peer_id);
                            break;
                        }

                        // 4. Validate payload & loop prevention
                        if payload.origin_device_id == my_device_id {
                            continue; // Reflected loop packet
                        }

                        println!("[ClipBridge Sync] Successfully received and decrypted clipboard payload from device: {}", device.name);

                        // Write to local OS clipboard
                        let _ = clipboard::write_clipboard_text(&payload.content, &payload.clip_id);

                        // Save in local history log
                        add_history_item(ClipboardItem {
                            id: payload.clip_id.clone(),
                            timestamp: payload.timestamp,
                            data_type: payload.data_type.clone(),
                            content: payload.content.clone(),
                            origin_device_name: device.name.clone(),
                            is_pinned: false,
                        });
                    }
                }
            }
        }
    }

    // Cleanup when reader exits
    println!("[ClipBridge Connection] Reader task exiting for client: {}", peer_id);
    let mut guard = state.lock().unwrap();
    guard.active_txs.remove(&peer_id);
}
