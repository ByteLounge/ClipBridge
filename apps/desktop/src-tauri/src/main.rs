// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;
mod discovery;
mod clipboard;
mod network;

use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::broadcast;
use crate::network::{STATE, ClipboardItem, PairedDevice, save_pairings, save_history};

#[derive(serde::Serialize)]
struct PairingQRInfo {
    qr_data: string,
    qr_svg: string,
}

type string = String;

#[tauri::command]
fn get_device_id() -> String {
    let state = STATE.lock().unwrap();
    state.device_id.clone()
}

#[tauri::command]
fn generate_pairing_qr() -> Result<PairingQRInfo, String> {
    // 1. Generate X25519 pairing keys
    let (priv_key, pub_key) = crypto::generate_x25519_keypair();

    let mut state = STATE.lock().unwrap();
    state.ephemeral_pairing_key = Some(priv_key.to_bytes().to_vec());
    state.ephemeral_public_key = Some(pub_key.clone());

    let my_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    // 2. Build the pairing string
    let pairing_str = format!(
        "cbpair:{}:{}:{}:{}:{}",
        state.device_id,
        hex::encode(&pub_key),
        state.display_name,
        my_ip,
        54670
    );

    // 3. Generate QR code SVG
    let qr_svg = qrcode_generator::to_svg_to_string(
        &pairing_str,
        qrcode_generator::QrCodeEcc::Medium,
        200,
        None::<&str>,
    ).map_err(|e| format!("QR code generation failed: {}", e))?;

    Ok(PairingQRInfo {
        qr_data: pairing_str,
        qr_svg,
    })
}

#[tauri::command]
fn get_paired_devices() -> Vec<PairedDevice> {
    let state = STATE.lock().unwrap();
    state.paired_devices.values().cloned().collect()
}

#[tauri::command]
fn delete_paired_device(device_id: String) -> Result<(), String> {
    let mut state = STATE.lock().unwrap();
    state.paired_devices.remove(&device_id);
    drop(state);
    save_pairings();
    Ok(())
}

#[tauri::command]
fn get_clipboard_history() -> Vec<ClipboardItem> {
    let state = STATE.lock().unwrap();
    state.history.clone()
}

#[tauri::command]
fn set_clipboard(content: String) -> Result<(), String> {
    clipboard::write_clipboard_text(&content, &uuid::Uuid::new_v4().to_string())
}

#[tauri::command]
fn delete_clipboard_item(id: String) -> Result<(), String> {
    let mut state = STATE.lock().unwrap();
    state.history.retain(|item| item.id != id);
    drop(state);
    save_history();
    Ok(())
}

#[tauri::command]
fn toggle_pin_item(id: String) -> Result<(), String> {
    let mut state = STATE.lock().unwrap();
    if let Some(item) = state.history.iter_mut().find(|item| item.id == id) {
        item.is_pinned = !item.is_pinned;
    }
    drop(state);
    save_history();
    Ok(())
}

#[tauri::command]
fn get_network_status() -> Result<serde_json::Value, String> {
    let state = STATE.lock().unwrap();
    let my_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    
    Ok(serde_json::json!({
        "ip_address": my_ip,
        "port": 54670,
        "is_advertising": true,
        "connected_clients": state.active_txs.len(),
    }))
}

fn main() {
    // Initialize tracing logs
    tracing_subscriber::fmt::init();

    // Start Clipboard monitoring channel
    let (clip_tx, clip_rx) = broadcast::channel(32);
    clipboard::start_clipboard_monitor(clip_tx);

    // Start axum server inside a dedicated Tokio runtime thread
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            network::start_webserver(54670, clip_rx);
            futures_util::future::pending::<()>().await;
        });
    });

    // Start local discovery advertisement
    let (device_id, display_name) = {
        let state = STATE.lock().unwrap();
        (state.device_id.clone(), state.display_name.clone())
    };
    
    if let Err(e) = discovery::start_mdns_advertisement(&device_id, &display_name, 54670) {
        eprintln!("Failed to register mDNS service: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_device_id,
            generate_pairing_qr,
            get_paired_devices,
            delete_paired_device,
            get_clipboard_history,
            set_clipboard,
            delete_clipboard_item,
            toggle_pin_item,
            get_network_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
