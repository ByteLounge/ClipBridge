import { useState, useEffect } from "react";
import {
  Clipboard,
  Smartphone,
  Settings as SettingsIcon,
  Info,
  Search,
  Copy,
  Trash2,
  Pin,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Tv,
  ArrowRight,
  Shield,
  RefreshCw,
  Plus,
  QrCode
} from "lucide-react";

// Fallback check to avoid crash if running in browser
const isTauri = () => {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// Lazy-loaded tauri invoke helper
const callTauri = async (cmd: string, args: any = {}): Promise<any> => {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
  }
  // Browser preview mode stub responses
  return mockTauriResponse(cmd, args);
};

// Mock data generator for browser sandbox
const mockTauriResponse = (cmd: string, args: any): any => {
  console.log(`[Tauri Mock] Called command: ${cmd}`, args);
  switch (cmd) {
    case "get_device_id":
      return "cb-desktop-9f23-a123";
    case "get_network_status":
      return {
        ip_address: "192.168.1.142",
        port: 54670,
        is_advertising: true,
        connected_clients: 1
      };
    case "generate_pairing_qr":
      return {
        qr_data: "cbpair:cb-desktop-9f23-a123:6c2a86842a62421b853110c538ab82cf:My-Macbook-Pro",
        qr_svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="transparent"/>
          <path d="M10,10 h30 v30 h-30 z M15,15 h20 v20 h-20 z M10,60 h30 v30 h-30 z M15,65 h20 v20 h-20 z M60,10 h30 v30 h-30 z M65,15 h20 v20 h-20 z" fill="currentColor"/>
          <rect x="20" y="20" width="10" height="10" fill="currentColor"/>
          <rect x="70" y="20" width="10" height="10" fill="currentColor"/>
          <rect x="20" y="70" width="10" height="10" fill="currentColor"/>
          <rect x="50" y="50" width="15" height="15" fill="currentColor"/>
          <rect x="70" y="70" width="15" height="15" fill="currentColor"/>
          <rect x="55" y="75" width="10" height="10" fill="currentColor"/>
        </svg>`
      };
    case "get_paired_devices":
      return [
        {
          id: "android-pixel8-99ac",
          name: "Pixel 8 Pro",
          public_key: "3a84f3e...c238",
          last_active: Date.now() - 45000
        }
      ];
    case "get_clipboard_history":
      return [
        {
          id: "clip-1",
          timestamp: Date.now() - 120000,
          data_type: "text",
          content: "https://github.com/gemini-hl/clipbridge",
          origin_device_name: "Pixel 8 Pro",
          is_pinned: true
        },
        {
          id: "clip-2",
          timestamp: Date.now() - 600000,
          data_type: "text",
          content: "npm run tauri build --release",
          origin_device_name: "Local Desktop",
          is_pinned: false
        },
        {
          id: "clip-3",
          timestamp: Date.now() - 3600000,
          data_type: "text",
          content: "Meeting notes: Secure mDNS service configuration is online.",
          origin_device_name: "Pixel 8 Pro",
          is_pinned: false
        }
      ];
    default:
      return null;
  }
};

interface ClipboardItem {
  id: string;
  timestamp: number;
  data_type: string;
  content: string;
  origin_device_name: string;
  is_pinned: boolean;
}

interface PairedDevice {
  id: string;
  name: string;
  public_key: string;
  last_active: number;
}

interface NetworkStatus {
  ip_address: string;
  port: number;
  is_advertising: boolean;
  connected_clients: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "devices" | "history" | "settings" | "about">("dashboard");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [clipboardList, setClipboardList] = useState<ClipboardItem[]>([]);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingQR, setPairingQR] = useState<{ qr_data: string; qr_svg: string } | null>(null);

  // Settings states
  const [autoStart, setAutoStart] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [lanOnly, setLanOnly] = useState(true);

  // Stats
  const [latency, setLatency] = useState(12); // ms
  const [speed, setSpeed] = useState(2.4); // MB/s

  useEffect(() => {
    // Initial fetches
    fetchData();
    // Setup listeners or poll
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const history = await callTauri("get_clipboard_history");
      if (history) setClipboardList(history);
      
      const devices = await callTauri("get_paired_devices");
      if (devices) setPairedDevices(devices);

      const net = await callTauri("get_network_status");
      if (net) setNetworkStatus(net);
    } catch (err) {
      console.error("Failed to fetch data from Tauri backend", err);
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (nextTheme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  };

  const handleCopy = async (text: string) => {
    await callTauri("set_clipboard", { content: text });
  };

  const handleDeleteClip = async (id: string) => {
    await callTauri("delete_clipboard_item", { id });
    setClipboardList(prev => prev.filter(c => c.id !== id));
  };

  const handleTogglePin = async (id: string) => {
    await callTauri("toggle_pin_item", { id });
    setClipboardList(prev => prev.map(c => c.id === id ? { ...c, is_pinned: !c.is_pinned } : c));
  };

  const handleUnpair = async (id: string) => {
    await callTauri("delete_paired_device", { device_id: id });
    setPairedDevices(prev => prev.filter(d => d.id !== id));
  };

  const startPairing = async () => {
    setShowPairingModal(true);
    const qrInfo = await callTauri("generate_pairing_qr");
    if (qrInfo) {
      setPairingQR(qrInfo);
    }
  };

  const filteredClips = clipboardList.filter(clip =>
    clip.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh" }}>
      {/* Sidebar Panel */}
      <aside className="glass-panel" style={{ width: "260px", margin: "16px", padding: "24px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", height: "calc(100vh - 32px)", zIndex: 10 }}>
        <div>
          {/* Logo Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px", padding: "0 8px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)" }}>
              <Clipboard size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.5px" }}>ClipBridge</h1>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 500 }}>Copy anywhere. Paste everywhere.</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <button onClick={() => setActiveTab("dashboard")} className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}>
              <Tv size={18} />
              <span>Dashboard</span>
            </button>
            <button onClick={() => setActiveTab("devices")} className={`nav-btn ${activeTab === "devices" ? "active" : ""}`}>
              <Smartphone size={18} />
              <span>Devices</span>
              {pairedDevices.length > 0 && <span className="badge">{pairedDevices.length}</span>}
            </button>
            <button onClick={() => setActiveTab("history")} className={`nav-btn ${activeTab === "history" ? "active" : ""}`}>
              <Clipboard size={18} />
              <span>History</span>
            </button>
            <button onClick={() => setActiveTab("settings")} className={`nav-btn ${activeTab === "settings" ? "active" : ""}`}>
              <SettingsIcon size={18} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div>
          <button onClick={() => setActiveTab("about")} className={`nav-btn ${activeTab === "about" ? "active" : ""}`} style={{ marginBottom: "12px", width: "100%" }}>
            <Info size={18} />
            <span>About</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-glass)", paddingTop: "12px", paddingLeft: "8px", paddingRight: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: networkStatus?.is_advertising ? "#10b981" : "#ef4444" }}></div>
              <span className="text-meta" style={{ fontSize: "11px" }}>{networkStatus?.is_advertising ? "LAN Server Active" : "Offline"}</span>
            </div>
            <button onClick={toggleTheme} className="theme-toggle">
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, height: "calc(100vh - 32px)", margin: "16px 16px 16px 0", overflowY: "auto", position: "relative" }} className="fade-in">
        {/* Onboarding View if no devices paired */}
        {activeTab === "dashboard" && pairedDevices.length === 0 && (
          <div className="glass-panel" style={{ padding: "48px", textAlign: "center", maxWidth: "600px", margin: "40px auto 0 auto" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", margin: "0 auto 24px auto" }}>
              <Smartphone size={32} />
            </div>
            <h2 className="title-medium" style={{ marginBottom: "12px" }}>Pair Your Android Device</h2>
            <p className="text-body" style={{ marginBottom: "32px", maxWidth: "400px", margin: "0 auto 32px auto" }}>
              Pair your phone using a secure, local QR scan. Once paired, clipboard content will sync instantly over Wi-Fi without any cloud server.
            </p>
            <button onClick={startPairing} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 24px", fontSize: "14px", fontWeight: 600 }}>
              <QrCode size={18} />
              Pair Phone Now
            </button>
          </div>
        )}

        {/* Dashboard View */}
        {activeTab === "dashboard" && pairedDevices.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Connection Banner */}
            <div className="glass-panel" style={{ padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 className="title-medium" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Wifi size={20} color="var(--accent)" />
                  ClipBridge Active
                </h2>
                <p className="text-body">Local Address: <code style={{ background: "rgba(0,0,0,0.1)", padding: "2px 6px", borderRadius: "4px" }}>{networkStatus?.ip_address}:{networkStatus?.port}</code></p>
              </div>
              <button onClick={startPairing} className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Plus size={16} />
                Pair Another Device
              </button>
            </div>

            {/* Live Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
              <div className="glass-panel" style={{ padding: "20px" }}>
                <p className="text-meta" style={{ marginBottom: "6px" }}>Latency</p>
                <p className="stat-value">{latency} <span style={{ fontSize: "14px", fontWeight: 500 }}>ms</span></p>
                <div style={{ fontSize: "11px", color: "#10b981", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <RefreshCw size={10} className="spin" /> Near-instant sync (LAN)
                </div>
              </div>
              <div className="glass-panel" style={{ padding: "20px" }}>
                <p className="text-meta" style={{ marginBottom: "6px" }}>Transfer Speed</p>
                <p className="stat-value">{speed} <span style={{ fontSize: "14px", fontWeight: 500 }}>MB/s</span></p>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Adaptive Wi-Fi optimization</span>
              </div>
              <div className="glass-panel" style={{ padding: "20px" }}>
                <p className="text-meta" style={{ marginBottom: "6px" }}>Paired Devices</p>
                <p className="stat-value">{pairedDevices.length}</p>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Listening for incoming connections</span>
              </div>
            </div>

            {/* Quick clipboard box */}
            <div className="glass-panel" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>Recent Clipped Payload</h3>
              {clipboardList.length > 0 ? (
                <div className="glass-panel" style={{ padding: "16px", background: "rgba(0,0,0,0.15)", position: "relative" }}>
                  <div style={{ position: "absolute", top: "12px", right: "12px", display: "flex", gap: "8px" }}>
                    <button onClick={() => handleCopy(clipboardList[0].content)} className="action-btn" title="Copy to clipboard"><Copy size={14} /></button>
                  </div>
                  <div className="text-body" style={{ wordBreak: "break-all", paddingRight: "40px", fontFamily: "monospace", fontSize: "13px" }}>
                    {clipboardList[0].content}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-glass)", marginTop: "12px", paddingTop: "8px" }}>
                    <span className="text-meta">From: {clipboardList[0].origin_device_name}</span>
                    <span className="text-meta">{new Date(clipboardList[0].timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ) : (
                <p className="text-body" style={{ fontStyle: "italic" }}>No synchronized clips yet. Copied items will appear here.</p>
              )}
            </div>
          </div>
        )}

        {/* Paired Devices View */}
        {activeTab === "devices" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="title-medium">My Paired Devices</h2>
              <button onClick={startPairing} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Plus size={16} />
                Pair New Device
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {pairedDevices.length > 0 ? (
                pairedDevices.map(device => (
                  <div key={device.id} className="glass-panel" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                        <Smartphone size={24} />
                      </div>
                      <div>
                        <h4 style={{ fontWeight: 600, fontSize: "15px" }}>{device.name}</h4>
                        <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                          <span className="text-meta">ID: {device.id}</span>
                          <span className="text-meta">Active: {new Date(device.last_active).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleUnpair(device.id)} className="btn btn-danger">Unpair</button>
                  </div>
                ))
              ) : (
                <p className="text-body" style={{ fontStyle: "italic", textAlign: "center", padding: "40px" }}>No paired devices yet. Click "Pair New Device" to connect.</p>
              )}
            </div>
          </div>
        )}

        {/* Clipboard History View */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="title-medium">Clipboard History</h2>
              <div style={{ position: "relative", width: "240px" }}>
                <input
                  type="text"
                  placeholder="Search history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <Search size={14} style={{ position: "absolute", left: "10px", top: "11px", color: "var(--text-muted)" }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredClips.length > 0 ? (
                filteredClips.map(clip => (
                  <div key={clip.id} className={`glass-panel ${clip.is_pinned ? "pinned" : ""}`} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                      <div className="text-body" style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: "13px" }}>
                        {clip.content}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => handleTogglePin(clip.id)} className={`action-btn ${clip.is_pinned ? "active" : ""}`} title="Pin item"><Pin size={14} /></button>
                        <button onClick={() => handleCopy(clip.content)} className="action-btn" title="Copy to OS clipboard"><Copy size={14} /></button>
                        <button onClick={() => handleDeleteClip(clip.id)} className="action-btn delete" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-glass)", paddingTop: "8px" }}>
                      <span className="text-meta">From: {clip.origin_device_name}</span>
                      <span className="text-meta">{new Date(clip.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-body" style={{ fontStyle: "italic", textAlign: "center", padding: "40px" }}>No history entries matching your query.</p>
              )}
            </div>
          </div>
        )}

        {/* Settings View */}
        {activeTab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <h2 className="title-medium">Settings</h2>
            
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, borderBottom: "1px solid var(--border-glass)", paddingBottom: "8px" }}>General Settings</h3>
              
              <div className="setting-row">
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 500 }}>Launch on Startup</h4>
                  <p className="text-meta" style={{ marginTop: "2px" }}>Automatically start ClipBridge when your computer boots up.</p>
                </div>
                <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} className="switch" />
              </div>

              <div className="setting-row">
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 500 }}>Auto Synchronize</h4>
                  <p className="text-meta" style={{ marginTop: "2px" }}>Automatically push local clipboard updates to paired devices.</p>
                </div>
                <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="switch" />
              </div>

              <div className="setting-row">
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 500 }}>Push Notifications</h4>
                  <p className="text-meta" style={{ marginTop: "2px" }}>Show operating system notifications when the clipboard is updated remotely.</p>
                </div>
                <input type="checkbox" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} className="switch" />
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, borderBottom: "1px solid var(--border-glass)", paddingBottom: "8px" }}>Security & Network</h3>
              
              <div className="setting-row">
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 500 }}>End-to-End Encryption</h4>
                  <p className="text-meta" style={{ marginTop: "2px" }}>Enforce AES-256-GCM payload encryption (Cannot be disabled).</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontSize: "12px", fontWeight: 600 }}>
                  <Shield size={14} /> Enabled (Secure)
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 500 }}>LAN Connection Only</h4>
                  <p className="text-meta" style={{ marginTop: "2px" }}>Restrict communication to local network. Do not attempt internet relay mode.</p>
                </div>
                <input type="checkbox" checked={lanOnly} onChange={(e) => setLanOnly(e.target.checked)} className="switch" />
              </div>
            </div>
          </div>
        )}

        {/* About View */}
        {activeTab === "about" && (
          <div className="glass-panel" style={{ padding: "32px", maxWidth: "600px", margin: "20px auto 0 auto" }}>
            <h2 className="title-medium" style={{ marginBottom: "8px" }}>ClipBridge Desktop</h2>
            <p className="text-meta" style={{ marginBottom: "20px" }}>Version 1.0.0 (Release Build)</p>
            <p className="text-body" style={{ lineHeight: 1.6, marginBottom: "20px" }}>
              ClipBridge is a next-generation clipboard synchronization system. It uses hardware-accelerated local networks, end-to-end asymmetric cryptography (X25519) and zero-login pairing to deliver an seamless, secure, Apple-style clipboard experience across OS boundaries.
            </p>
            <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: "20px", marginTop: "20px" }}>
              <h4 style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>Technology Stack</h4>
              <ul style={{ paddingLeft: "18px", color: "var(--text-secondary)", fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <li>Tauri v2 Core Desktop engine (Rust)</li>
                <li>React, Vite & TypeScript UI Layer</li>
                <li>Ring Security Engine (X25519 / AES-256-GCM)</li>
                <li>mDNS local device discovery service</li>
              </ul>
            </div>
            <p className="text-meta" style={{ textAlign: "center", marginTop: "32px" }}>Built with care by the ClipBridge Open Source Team.</p>
          </div>
        )}
      </main>

      {/* QR Pairing Modal */}
      {showPairingModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="glass-panel modal-spring" style={{ width: "420px", padding: "32px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            <h3 className="title-medium" style={{ marginBottom: "8px" }}>Scan to Pair</h3>
            <p className="text-body" style={{ textAlign: "center", marginBottom: "24px", fontSize: "13px" }}>
              Open ClipBridge on your Android device and scan this QR code to establish secure pairing.
            </p>

            <div style={{ width: "200px", height: "200px", background: "#fff", padding: "12px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px", color: "#000" }}>
              {pairingQR ? (
                <div dangerouslySetInnerHTML={{ __html: pairingQR.qr_svg }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <RefreshCw size={32} className="spin" style={{ color: "var(--text-muted)" }} />
              )}
            </div>

            <div style={{ fontSize: "11px", color: "var(--text-muted)", background: "rgba(0,0,0,0.1)", padding: "8px 12px", borderRadius: "6px", width: "100%", textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "24px" }}>
              {pairingQR?.qr_data || "Generating..."}
            </div>

            <button onClick={() => setShowPairingModal(false)} className="btn btn-secondary" style={{ width: "100%" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Embedded CSS Style overrides for UI Elements */}
      <style>{`
        .nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          position: relative;
        }
        .nav-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }
        .nav-btn.active {
          background: var(--accent-gradient);
          color: #ffffff;
          box-shadow: 0 4px 12px var(--accent-glow);
        }
        .badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 6px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          margin-left: auto;
        }
        .theme-toggle {
          background: var(--border-glass);
          border: 1px solid var(--border-glass);
          color: var(--text-primary);
          padding: 6px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .theme-toggle:hover {
          background: var(--border-glass-glow);
        }
        .btn {
          padding: 8px 16px;
          border-radius: 10px;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }
        .btn-primary {
          background: var(--accent-gradient);
          color: #fff;
          box-shadow: 0 4px 12px var(--accent-glow);
        }
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px var(--accent-glow);
        }
        .btn-secondary {
          background: var(--border-glass);
          border: 1px solid var(--border-glass);
          color: var(--text-primary);
        }
        .btn-secondary:hover {
          background: var(--border-glass-glow);
        }
        .btn-danger {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .btn-danger:hover {
          background: #ef4444;
          color: #fff;
        }
        .stat-value {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -1px;
          margin-top: 4px;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .spin {
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .action-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: var(--border-glass);
          border: 1px solid var(--border-glass);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .action-btn:hover {
          background: var(--border-glass-glow);
          color: var(--text-primary);
        }
        .action-btn.active {
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.1);
          border-color: rgba(245, 158, 11, 0.2);
        }
        .action-btn.delete:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.1);
        }
        .search-input {
          width: 100%;
          background: var(--border-glass);
          border: 1px solid var(--border-glass);
          border-radius: 10px;
          padding: 8px 12px 8px 32px;
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 13px;
          outline: none;
          transition: all 0.2s ease;
        }
        .search-input:focus {
          border-color: var(--accent);
          background: rgba(0,0,0,0.1);
        }
        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--border-glass);
        }
        .setting-row:last-child {
          border-bottom: none;
        }
        .switch {
          appearance: none;
          width: 44px;
          height: 24px;
          border-radius: 20px;
          background: var(--border-glass);
          position: relative;
          cursor: pointer;
          outline: none;
          transition: all 0.2s ease;
        }
        .switch::before {
          content: '';
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          top: 3px;
          left: 3px;
          transition: all 0.2s ease;
        }
        .switch:checked {
          background: var(--accent);
        }
        .switch:checked::before {
          transform: translateX(20px);
        }
        .pinned {
          border-color: rgba(245, 158, 11, 0.3) !important;
          background: radial-gradient(circle at 100% 0, rgba(245, 158, 11, 0.05) 0%, transparent 40%), var(--bg-glass);
        }
      `}</style>
    </div>
  );
}
