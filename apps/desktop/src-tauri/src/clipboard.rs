use arboard::Clipboard;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::time::Duration;
use tokio::sync::broadcast;
use uuid::Uuid;

static CLIPBOARD_INSTANCE: Lazy<Mutex<Clipboard>> = Lazy::new(|| {
    Mutex::new(Clipboard::new().expect("Failed to initialize clipboard"))
});

static LAST_CLIPBOARD_TEXT: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));
static LAST_SYNCED_CLIP_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ClipboardUpdate {
    pub id: String,
    pub timestamp: u64,
    pub content: String,
}

/// Reads the current text from the system clipboard.
pub fn read_clipboard_text() -> Result<String, String> {
    let mut cb = CLIPBOARD_INSTANCE.lock().map_err(|e| e.to_string())?;
    cb.get_text().map_err(|e| e.to_string())
}

/// Writes text to the system clipboard, setting the LAST_SYNCED_CLIP_ID to avoid loop re-broadcasts.
pub fn write_clipboard_text(text: &str, clip_id: &str) -> Result<(), String> {
    let mut cb = CLIPBOARD_INSTANCE.lock().map_err(|e| e.to_string())?;
    
    // Set the sync guard first
    if let Ok(mut guard) = LAST_SYNCED_CLIP_ID.lock() {
        *guard = Some(clip_id.to_string());
    }
    
    if let Ok(mut last_text) = LAST_CLIPBOARD_TEXT.lock() {
        *last_text = text.to_string();
    }
    
    cb.set_text(text.to_string()).map_err(|e| e.to_string())
}

/// Starts a background thread that monitors clipboard changes.
/// Broadcasts a ClipboardUpdate whenever a local clipboard change is detected.
pub fn start_clipboard_monitor(tx: broadcast::Sender<ClipboardUpdate>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(600));
            
            let current_text = match read_clipboard_text() {
                Ok(t) => t,
                Err(_) => continue,
            };

            if current_text.trim().is_empty() {
                continue;
            }

            let mut last_text = LAST_CLIPBOARD_TEXT.lock().unwrap();
            if current_text != *last_text {
                // Clipboard changed! Check if it was written by ourselves (from a sync)
                let mut sync_guard = LAST_SYNCED_CLIP_ID.lock().unwrap();
                if sync_guard.is_some() {
                    // This change was triggered by our own websocket sync writer, so consume the guard and skip broadcast.
                    *sync_guard = None;
                    *last_text = current_text;
                    continue;
                }

                *last_text = current_text.clone();
                
                let update = ClipboardUpdate {
                    id: Uuid::new_v4().to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                    content: current_text,
                };
                
                let _ = tx.send(update);
            }
        }
    });
}
