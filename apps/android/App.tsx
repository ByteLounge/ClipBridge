import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  SafeAreaView,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { Camera, CameraView } from 'expo-camera';
import { BlurView } from 'expo-blur';
import {
  Clipboard as ClipboardIcon,
  Smartphone,
  Settings as SettingsIcon,
  Trash2,
  Wifi,
  WifiOff,
  Sun,
  Send,
  Plus,
  ArrowLeft,
  RefreshCw,
  QrCode,
  Shield,
  Search,
} from 'lucide-react-native';
import { Buffer } from 'buffer';

// Local project modules
import {
  generateX25519KeyPair,
  deriveSharedKey,
  generateNonce,
  encryptPayload,
  decryptPayload,
  bytesToHex,
  hexToBytes,
} from './src/crypto';
import {
  savePairedDevice,
  getPairedDevices,
  deletePairedDevice,
  getSyncKey,
  saveHistoryItem,
  getClipboardHistory,
  clearClipboardHistory,
  deleteHistoryItem,
  ClipboardItem,
  PairedDevice,
} from './src/storage';

const { width } = Dimensions.get('window');

export default function App() {
  const [currentTab, setCurrentTab] = useState<'home' | 'history' | 'devices' | 'settings'>('home');
  const [pairedList, setPairedList] = useState<PairedDevice[]>([]);
  const [historyList, setHistoryList] = useState<ClipboardItem[]>([]);
  
  // App variables
  const [deviceId, setDeviceId] = useState('');
  const [displayName, setDisplayName] = useState(Platform.OS === 'android' ? 'Android Device' : 'iOS Device');
  
  // Connection states
  const [isConnected, setIsConnected] = useState(false);
  const [connectedServer, setConnectedServer] = useState<PairedDevice | null>(null);
  
  // Scanning state
  const [showScanner, setShowScanner] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  
  // Settings
  const [autoSync, setAutoSync] = useState(true);
  const [lanOnly, setLanOnly] = useState(true);
  
  // Input fields
  const [manualText, setManualText] = useState('');
  const [searchVal, setSearchVal] = useState('');
  
  // Local clipboard monitoring state
  const lastLocalClipboard = useRef('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Generate device id
    const initDevice = async () => {
      let cachedId = await AsyncStorageGet('device_id');
      if (!cachedId) {
        cachedId = Math.random().toString(36).substring(2, 15);
        await AsyncStorageSet('device_id', cachedId);
      }
      setDeviceId(cachedId);
      
      const devices = await getPairedDevices();
      setPairedList(devices);
      
      const history = await getClipboardHistory();
      setHistoryList(history);

      // Connect to first paired device on launch (simulating discovery)
      if (devices.length > 0) {
        // Try connecting to default local port 54670 at local subnet
        // In Expo Go, we'll try to connect to the saved desktop IP
        const desktopIp = await AsyncStorageGet(`ip_${devices[0].id}`);
        if (desktopIp) {
          connectToDesktop(devices[0], desktopIp);
        }
      }
    };

    initDevice();
    
    // Clipboard polling monitor (1 second interval when app is active)
    const interval = setInterval(async () => {
      if (!autoSync) return;
      const text = await Clipboard.getStringAsync();
      if (text && text.trim().length > 0 && text !== lastLocalClipboard.current) {
        lastLocalClipboard.current = text;
        // Broadcast clipboard change to server
        broadcastClipboard(text);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // AsyncStorage fallback functions
  const AsyncStorageGet = async (key: string): Promise<string | null> => {
    try {
      const val = await require('@react-native-async-storage/async-storage').default.getItem(key);
      return val;
    } catch {
      return null;
    }
  };

  const AsyncStorageSet = async (key: string, value: string): Promise<void> => {
    try {
      await require('@react-native-async-storage/async-storage').default.setItem(key, value);
    } catch {}
  };

  // Connects to a Desktop client via WebSocket
  const connectToDesktop = async (device: PairedDevice, ipAddress: string) => {
    const url = `ws://${ipAddress}:54670/ws`;
    console.log(`Connecting WS to desktop: ${url}`);
    
    try {
      const syncKey = await getSyncKey(device.id);
      if (!syncKey) {
        Alert.alert('Security Error', 'Symmetric key missing for this device.');
        return;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = async () => {
        // Encrypted Authentication Handshake
        const nonce = generateNonce();
        const handshakePayload = {
          timestamp: Date.now(),
          challenge: 'clipbridge-auth-challenge',
        };
        const ptStr = JSON.stringify(handshakePayload);
        const { ciphertext, tag } = encryptPayload(syncKey, ptStr, nonce);

        const handshakeReq = {
          device_id: deviceId,
          nonce: bytesToHex(nonce),
          encrypted_handshake: ciphertext + tag,
        };

        ws.send(JSON.stringify(handshakeReq));
        setIsConnected(true);
        setConnectedServer(device);
      };

      ws.onmessage = async (e) => {
        try {
          const env = JSON.parse(e.data);
          const nonceBytes = hexToBytes(env.nonce);
          
          // Reconstruct ciphertext and 16-byte tag
          const fullCtHex = env.ciphertext;
          const tagHex = env.tag;

          const decrypted = decryptPayload(syncKey, fullCtHex, nonceBytes, tagHex);
          const payload = JSON.parse(decrypted);

          // Loop Prevention
          if (payload.origin_device_id === deviceId) return;

          // Set system clipboard
          await Clipboard.setStringAsync(payload.content);
          lastLocalClipboard.current = payload.content;

          // Save to history
          const newItem: ClipboardItem = {
            id: payload.clip_id,
            content: payload.content,
            timestamp: payload.timestamp,
            originDeviceName: device.name,
          };
          await saveHistoryItem(newItem);
          const history = await getClipboardHistory();
          setHistoryList(history);

        } catch (err) {
          console.error('Failed to decrypt WS frame', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectedServer(null);
      };
      
      ws.onerror = (err) => {
        console.error('WebSocket connection error', err);
      };

    } catch (err) {
      console.error('Failed connection setup', err);
    }
  };

  // Broadcasts clipboard contents over the active WS socket
  const broadcastClipboard = async (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !connectedServer) return;

    try {
      const syncKey = await getSyncKey(connectedServer.id);
      if (!syncKey) return;

      const clipId = Math.random().toString(36).substring(2, 15);
      const timestamp = Date.now();

      const payload = {
        clip_id: clipId,
        timestamp: timestamp,
        data_type: 'text',
        content: text,
        origin_device_id: deviceId,
        ttl: 3,
      };

      const nonce = generateNonce();
      const { ciphertext, tag } = encryptPayload(syncKey, JSON.stringify(payload), nonce);

      const envelope = {
        sender_id: deviceId,
        nonce: bytesToHex(nonce),
        ciphertext,
        tag,
      };

      wsRef.current.send(JSON.stringify(envelope));

      // Save in local history
      const historyItem: ClipboardItem = {
        id: clipId,
        content: text,
        timestamp,
        originDeviceName: 'Local Phone',
      };
      await saveHistoryItem(historyItem);
      const history = await getClipboardHistory();
      setHistoryList(history);

    } catch (err) {
      console.error('Failed encryption/broadcast', err);
    }
  };

  // Pair device scanned from QR code
  const handleQRScanned = async (data: string) => {
    setShowScanner(false);
    setPairingLoading(true);

    // Expected format: cbpair:<desktop_id>:<desktop_public_key_hex>:<desktop_name>:<ip_address>:<port>
    const parts = data.split(':');
    if (parts.length < 4 || parts[0] !== 'cbpair') {
      Alert.alert('Error', 'Invalid QR code schema.');
      setPairingLoading(false);
      return;
    }

    const desktopId = parts[1];
    const desktopPublicKeyHex = parts[2];
    const desktopName = parts[3];
    // Dynamic IP lookup fallback
    const ipAddress = parts[4] || '192.168.1.142';
    const port = parts[5] || '54670';

    const url = `ws://${ipAddress}:${port}/pair`;
    console.log(`Connecting pairing WS to: ${url}`);

    try {
      const { privateKey, publicKey } = generateX25519KeyPair();
      const ws = new WebSocket(url);

      ws.onopen = () => {
        const pairReq = {
          device_id: deviceId,
          display_name: displayName,
          client_public_key: bytesToHex(publicKey),
        };
        ws.send(JSON.stringify(pairReq));
      };

      ws.onmessage = async (e) => {
        try {
          const resp = JSON.parse(e.data);
          const serverPubBytes = hexToBytes(resp.server_public_key);
          
          // Derive shared sync key
          const syncKey = await deriveSharedKey(privateKey, serverPubBytes);

          // Save paired device metadata and derived key
          const newDevice: PairedDevice = {
            id: desktopId,
            name: desktopName,
            lastActive: Date.now(),
          };
          await savePairedDevice(newDevice, syncKey);
          await AsyncStorageSet(`ip_${desktopId}`, ipAddress);

          // Update lists
          const devices = await getPairedDevices();
          setPairedList(devices);

          setPairingLoading(false);
          ws.close();
          Alert.alert('Success', `Paired with ${desktopName}! Connecting sync socket...`);
          
          // Instantly launch sync socket
          connectToDesktop(newDevice, ipAddress);

        } catch (err) {
          console.error('Handshake decoding failed', err);
          setPairingLoading(false);
          ws.close();
        }
      };

      ws.onerror = (err) => {
        console.error('Pairing WS Error', err);
        setPairingLoading(false);
        Alert.alert('Error', 'Failed to connect to the desktop pairing port.');
      };

    } catch (err) {
      console.error(err);
      setPairingLoading(false);
    }
  };

  const handleManualSend = () => {
    if (manualText.trim().length === 0) return;
    broadcastClipboard(manualText);
    setManualText('');
    Alert.alert('Sent', 'Clipboard item broadcasted to desktop!');
  };

  const handleUnpair = async (id: string) => {
    Alert.alert(
      'Unpair Device',
      'Are you sure you want to unpair this desktop?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            await deletePairedDevice(id);
            const list = await getPairedDevices();
            setPairedList(list);
            if (connectedServer?.id === id && wsRef.current) {
              wsRef.current.close();
            }
          },
        },
      ]
    );
  };

  const handleCopyHistory = async (text: string) => {
    await Clipboard.setStringAsync(text);
    lastLocalClipboard.current = text;
    Alert.alert('Copied', 'Item copied to local clipboard.');
  };

  const handleDeleteHistory = async (id: string) => {
    await deleteHistoryItem(id);
    const history = await getClipboardHistory();
    setHistoryList(history);
  };

  const filteredHistory = historyList.filter(item =>
    item.content.toLowerCase().includes(searchVal.toLowerCase())
  );

  if (showScanner) {
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={({ data }) => handleQRScanned(data)}
        />
        <View style={styles.scannerHeader}>
          <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.backBtn}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
          <Text style={styles.scannerTitle}>Scan QR Code</Text>
        </View>
        <View style={styles.scannerOverlay} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Decorative ambient gradients */}
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />

      {/* Main tab switch container */}
      <View style={styles.content}>
        
        {/* Onboarding / Dashboard Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>ClipBridge</Text>
            <Text style={styles.headerSubtitle}>Copy Anywhere. Paste Everywhere.</Text>
          </View>
          <View style={[styles.statusIndicator, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10b981' : '#ef4444' }]} />
            <Text style={styles.statusText}>{isConnected ? 'Synced' : 'Offline'}</Text>
          </View>
        </View>

        {/* Tab content renderer */}
        {currentTab === 'home' && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            
            {/* Display pairing state if no device is connected */}
            {!isConnected && pairedList.length === 0 && (
              <BlurView intensity={30} tint="dark" style={styles.glassCard}>
                <Smartphone color="#3b82f6" size={48} style={styles.cardIcon} />
                <Text style={styles.cardTitle}>Pair Your Desktop</Text>
                <Text style={styles.cardDesc}>
                  Generate a pairing QR code inside the ClipBridge Desktop application and scan it here to link your devices securely.
                </Text>
                <TouchableOpacity onPress={() => setShowScanner(true)} style={styles.btnPrimary}>
                  <QrCode color="#fff" size={18} />
                  <Text style={styles.btnPrimaryText}>Scan QR Code</Text>
                </TouchableOpacity>
              </BlurView>
            )}

            {/* Quick dashboard details if connected */}
            {isConnected && connectedServer && (
              <BlurView intensity={30} tint="dark" style={styles.glassCard}>
                <Wifi color="#10b981" size={48} style={styles.cardIcon} />
                <Text style={styles.cardTitle}>Connected to Desktop</Text>
                <Text style={styles.cardDesc}>
                  Device: {connectedServer.name} {'\n'}
                  Clipboard synchronization is active in the background.
                </Text>
              </BlurView>
            )}

            {/* Large Recent Clipboard Box */}
            <BlurView intensity={30} tint="dark" style={styles.glassCard}>
              <Text style={styles.cardLabel}>RECENT CLIPBOARD ELEMENT</Text>
              {historyList.length > 0 ? (
                <View style={styles.recentClipInner}>
                  <Text style={styles.recentClipText} numberOfLines={6}>
                    {historyList[0].content}
                  </Text>
                  <View style={styles.clipMeta}>
                    <Text style={styles.clipMetaText}>From: {historyList[0].originDeviceName}</Text>
                    <Text style={styles.clipMetaText}>
                      {new Date(historyList[0].timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.emptyText}>No clips received yet. Copied items appear here.</Text>
              )}
            </BlurView>

            {/* Manual push input */}
            <BlurView intensity={30} tint="dark" style={styles.glassCard}>
              <Text style={styles.cardLabel}>BROADCAST TEXT MANUALLY</Text>
              <TextInput
                value={manualText}
                onChangeText={setManualText}
                placeholder="Type anything to sync..."
                placeholderTextColor="#64748b"
                style={styles.input}
                multiline
              />
              <TouchableOpacity onPress={handleManualSend} style={styles.btnSecondary}>
                <Send color="#fff" size={16} />
                <Text style={styles.btnSecondaryText}>Broadcast Clip</Text>
              </TouchableOpacity>
            </BlurView>
          </ScrollView>
        )}

        {/* History Tab */}
        {currentTab === 'history' && (
          <View style={styles.tabContainer}>
            <View style={styles.searchHeader}>
              <View style={styles.searchBar}>
                <Search color="#64748b" size={16} style={styles.searchIcon} />
                <TextInput
                  value={searchVal}
                  onChangeText={setSearchVal}
                  placeholder="Search history..."
                  placeholderTextColor="#64748b"
                  style={styles.searchInput}
                />
              </View>
              {historyList.length > 0 && (
                <TouchableOpacity onPress={() => clearClipboardHistory().then(() => setHistoryList([]))}>
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
              {filteredHistory.length > 0 ? (
                filteredHistory.map(item => (
                  <BlurView key={item.id} intensity={25} tint="dark" style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <Text style={styles.historyOrigin}>From: {item.originDeviceName}</Text>
                      <Text style={styles.historyTime}>
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                    <Text style={styles.historyContent} numberOfLines={4}>
                      {item.content}
                    </Text>
                    <View style={styles.historyCardActions}>
                      <TouchableOpacity onPress={() => handleDeleteHistory(item.id)} style={styles.iconBtn}>
                        <Trash2 color="#ef4444" size={18} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleCopyHistory(item.content)} style={styles.copyBtn}>
                        <Text style={styles.copyBtnText}>Copy Locally</Text>
                      </TouchableOpacity>
                    </View>
                  </BlurView>
                ))
              ) : (
                <Text style={styles.emptyCenterText}>History log is empty.</Text>
              )}
            </ScrollView>
          </View>
        )}

        {/* Devices Tab */}
        {currentTab === 'devices' && (
          <View style={styles.tabContainer}>
            <View style={styles.devicesHeader}>
              <Text style={styles.sectionTitle}>Paired Desktops</Text>
              <TouchableOpacity onPress={() => setShowScanner(true)} style={styles.addBtn}>
                <Plus color="#fff" size={16} />
                <Text style={styles.addBtnText}>Pair QR</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
              {pairedList.length > 0 ? (
                pairedList.map(device => (
                  <BlurView key={device.id} intensity={25} tint="dark" style={styles.deviceRow}>
                    <View>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceId}>ID: {device.id.substring(0, 8)}...</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleUnpair(device.id)} style={styles.unpairBtn}>
                      <Text style={styles.unpairBtnText}>Unpair</Text>
                    </TouchableOpacity>
                  </BlurView>
                ))
              ) : (
                <Text style={styles.emptyCenterText}>No paired desktops. Scan a QR code to begin.</Text>
              )}
            </ScrollView>
          </View>
        )}

        {/* Settings Tab */}
        {currentTab === 'settings' && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <BlurView intensity={30} tint="dark" style={styles.glassCard}>
              <Text style={styles.cardLabel}>GENERAL SETTINGS</Text>
              
              <View style={styles.settingRow}>
                <View>
                  <Text style={styles.settingLabel}>Auto Sync Clipboard</Text>
                  <Text style={styles.settingDesc}>Sync automatically in the background.</Text>
                </View>
                <Switch
                  value={autoSync}
                  onValueChange={setAutoSync}
                  thumbColor={autoSync ? '#3b82f6' : '#64748b'}
                />
              </View>

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View>
                  <Text style={styles.settingLabel}>LAN Mode Only</Text>
                  <Text style={styles.settingDesc}>Strictly allow direct local network transfer.</Text>
                </View>
                <Switch
                  value={lanOnly}
                  onValueChange={setLanOnly}
                  thumbColor={lanOnly ? '#3b82f6' : '#64748b'}
                />
              </View>
            </BlurView>

            <BlurView intensity={30} tint="dark" style={styles.glassCard}>
              <Text style={styles.cardLabel}>SECURITY & IDENTITY</Text>
              <View style={styles.identityContainer}>
                <Text style={styles.identityLabel}>Device ID</Text>
                <Text style={styles.identityValue}>{deviceId}</Text>
              </View>
              <View style={styles.identityContainer}>
                <Text style={styles.identityLabel}>Security Protocol</Text>
                <Text style={styles.identityValue}>E2EE X25519 / AES-256-GCM</Text>
              </View>
            </BlurView>
          </ScrollView>
        )}

      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setCurrentTab('home')} style={[styles.tabItem, currentTab === 'home' && styles.tabItemActive]}>
          <Smartphone color={currentTab === 'home' ? '#3b82f6' : '#94a3b8'} size={22} />
          <Text style={[styles.tabText, currentTab === 'home' && styles.tabTextActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCurrentTab('history')} style={[styles.tabItem, currentTab === 'history' && styles.tabItemActive]}>
          <ClipboardIcon color={currentTab === 'history' ? '#3b82f6' : '#94a3b8'} size={22} />
          <Text style={[styles.tabText, currentTab === 'history' && styles.tabTextActive]}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCurrentTab('devices')} style={[styles.tabItem, currentTab === 'devices' && styles.tabItemActive]}>
          <RefreshCw color={currentTab === 'devices' ? '#3b82f6' : '#94a3b8'} size={22} />
          <Text style={[styles.tabText, currentTab === 'devices' && styles.tabTextActive]}>Devices</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCurrentTab('settings')} style={[styles.tabItem, currentTab === 'settings' && styles.tabItemActive]}>
          <SettingsIcon color={currentTab === 'settings' ? '#3b82f6' : '#94a3b8'} size={22} />
          <Text style={[styles.tabText, currentTab === 'settings' && styles.tabTextActive]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {pairingLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Establishing encrypted security channel...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080810',
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.12,
  },
  glowLeft: {
    top: -50,
    left: -50,
    backgroundColor: '#3b82f6',
  },
  glowRight: {
    bottom: -50,
    right: -50,
    backgroundColor: '#8b5cf6',
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  statusDisconnected: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  glassCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardIcon: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 12,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    marginTop: 12,
  },
  btnSecondaryText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  recentClipInner: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    padding: 16,
  },
  recentClipText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 20,
  },
  clipMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 12,
    paddingTop: 8,
  },
  clipMetaText: {
    fontSize: 10,
    color: '#64748b',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  emptyCenterText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 100,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#080810',
    paddingBottom: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#3b82f6',
  },
  tabText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  tabContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    flex: 1,
    marginRight: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: '#fff',
    fontSize: 14,
    height: 40,
    flex: 1,
  },
  clearBtnText: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 13,
  },
  listContent: {
    gap: 12,
    paddingBottom: 40,
  },
  historyCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyOrigin: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  historyTime: {
    fontSize: 11,
    color: '#64748b',
  },
  historyContent: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  historyCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 6,
  },
  copyBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  devicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  deviceId: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unpairBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  settingDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  settingDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  identityContainer: {
    marginBottom: 12,
  },
  identityLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  identityValue: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 16,
  },
  scannerOverlay: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 24,
    alignSelf: 'center',
    top: '30%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,16,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
});
