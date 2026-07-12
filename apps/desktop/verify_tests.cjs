const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Configs
const PORT = 54670;
const CLIENT_DEVICE_ID = 'test-phone-uuid-' + Math.random().toString(36).substring(2, 7);
const CLIENT_DISPLAY_NAME = 'Simulated Android Phone';
const DESKTOP_IP = '127.0.0.1';

// Helper to convert byte arrays to hex and back
function bytesToHex(buf) {
  return buf.toString('hex');
}
function hexToBytes(hex) {
  return Buffer.from(hex, 'hex');
}

// HKDF-SHA256 implementation using Node.js built-in hkdfSync
function deriveSharedKey(clientPrivateKey, serverPublicKeyBytes) {
  // Reconstruct server public key SPKI DER
  const spkiHeader = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00]);
  const serverPublicKeyDer = Buffer.concat([spkiHeader, serverPublicKeyBytes]);
  const serverPublicKey = crypto.createPublicKey({
    key: serverPublicKeyDer,
    format: 'der',
    type: 'spki'
  });
  
  const sharedSecret = crypto.diffieHellman({
    privateKey: clientPrivateKey,
    publicKey: serverPublicKey
  });
  
  return crypto.hkdfSync(
    'sha256',
    sharedSecret,
    Buffer.alloc(32), // 32-byte zero salt
    Buffer.from('clipbridge-sync-key'), // info
    32 // key length
  );
}

// AES-256-GCM encryption & decryption
function encryptPayload(key, plaintext, nonce) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('hex'),
    tag: tag.toString('hex')
  };
}

function decryptPayload(key, ciphertextHex, nonce, tagHex) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(Buffer.from(ciphertextHex, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

// Helper to generate X25519 keypair
function generateX25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  // DER format of X25519 SPKI is 44 bytes, the last 32 bytes are public key
  const pubBytes = publicKey.export({ format: 'der', type: 'spki' }).slice(12);
  return { privateKey, publicKeyBytes: pubBytes };
}

async function runTests() {
  console.log('=== ClipBridge End-to-End Integration Verification ===\n');

  // Step 1: Fetch pairing information from desktop test server
  console.log('[Test Setup] Fetching pairing config from desktop server...');
  let qrInfo;
  try {
    const response = await fetch(`http://${DESKTOP_IP}:${PORT}/test/qr`);
    qrInfo = await response.json();
    console.log('[Test Setup] Server QR Info received:', JSON.stringify(qrInfo, null, 2));
  } catch (e) {
    console.error('[FAIL] Could not connect to desktop server at port 54670. Make sure Tauri server is running.', e);
    process.exit(1);
  }

  const serverPublicKeyBytes = hexToBytes(qrInfo.public_key);
  const serverDeviceId = qrInfo.device_id;
  const serverDisplayName = qrInfo.name;

  // Generate client keypair
  const { privateKey, publicKeyBytes } = generateX25519KeyPair();

  // Test 1: Pairing Flow
  console.log('\n--- TEST 1: PAIRING FLOW ---');
  const pairUrl = `ws://${DESKTOP_IP}:${PORT}/pair`;
  console.log(`Connecting to pairing WebSocket: ${pairUrl}`);
  
  const pairSocket = new WebSocket(pairUrl);
  let syncKey;

  await new Promise((resolve, reject) => {
    pairSocket.on('open', () => {
      console.log('[ClipBridge Pair] Connected. Sending PAIR_REQUEST...');
      const pairReq = {
        type: 'PAIR_REQUEST',
        device_id: CLIENT_DEVICE_ID,
        display_name: CLIENT_DISPLAY_NAME,
        client_public_key: bytesToHex(publicKeyBytes)
      };
      pairSocket.send(JSON.stringify(pairReq));
    });

    pairSocket.on('message', (data) => {
      console.log('[ClipBridge Pair] Received message:', data.toString());
      try {
        const resp = JSON.parse(data.toString());
        if (resp.type === 'PAIR_RESPONSE' && resp.device_id === serverDeviceId) {
          console.log('[ClipBridge Pair] Pairing handshake response validated.');
          // Compute sync key
          syncKey = deriveSharedKey(privateKey, serverPublicKeyBytes);
          console.log('[ClipBridge Pair] HKDF-SHA256 Sync key derived:', bytesToHex(syncKey));
          pairSocket.close();
          resolve();
        } else {
          reject(new Error('Invalid pair response payload'));
        }
      } catch (err) {
        reject(err);
      }
    });

    pairSocket.on('error', (err) => {
      reject(err);
    });
  });

  console.log('[PASS] Test 1: Pairing completed successfully.');

  // Test 2: Live Sync Socket & Handshake
  console.log('\n--- TEST 2: LIVE SYNC SESSION & HANDSHAKE ---');
  const wsUrl = `ws://${DESKTOP_IP}:${PORT}/ws`;
  console.log(`Connecting to live sync WebSocket: ${wsUrl}`);
  
  const syncSocket = new WebSocket(wsUrl);
  
  await new Promise((resolve, reject) => {
    syncSocket.on('open', () => {
      console.log('[ClipBridge Connect] Socket open. Sending encrypted Handshake...');
      const nonce = crypto.randomBytes(12);
      
      const handshakePayload = {
        timestamp: Date.now(),
        challenge: 'clipbridge-auth-challenge'
      };
      
      const { ciphertext, tag } = encryptPayload(syncKey, JSON.stringify(handshakePayload), nonce);
      
      const handshakeReq = {
        device_id: CLIENT_DEVICE_ID,
        nonce: bytesToHex(nonce),
        encrypted_handshake: ciphertext + tag
      };
      
      syncSocket.send(JSON.stringify(handshakeReq));
    });

    // Wait a brief period to ensure the server accepts connection and doesn't drop it
    setTimeout(() => {
      if (syncSocket.readyState === WebSocket.OPEN) {
        console.log('[ClipBridge Connect] Handshake accepted. WebSocket remains active.');
        resolve();
      } else {
        reject(new Error('Connection dropped after handshake'));
      }
    }, 1500);

    syncSocket.on('error', (err) => {
      reject(err);
    });
    syncSocket.on('close', (code, reason) => {
      reject(new Error(`Connection closed. Code: ${code}, Reason: ${reason}`));
    });
  });

  console.log('[PASS] Test 2: Secure live session handshake completed.');

  // Test 3: Heartbeat (PING/PONG) Exchange
  console.log('\n--- TEST 3: HEARTBEAT (PING/PONG) EXCHANGE ---');
  await new Promise((resolve, reject) => {
    console.log('[ClipBridge Heartbeat] Sending PING...');
    syncSocket.send('PING');
    
    syncSocket.once('message', (data) => {
      const msg = data.toString();
      console.log('[ClipBridge Heartbeat] Received from server:', msg);
      if (msg === 'PONG') {
        console.log('[ClipBridge Heartbeat] Heartbeat validation success.');
        resolve();
      } else {
        reject(new Error('Expected PONG, received ' + msg));
      }
    });

    setTimeout(() => {
      reject(new Error('Heartbeat PING timed out'));
    }, 5000);
  });
  console.log('[PASS] Test 3: Heartbeat exchange successful.');

  // Test 4: Phone -> Desktop Clipboard Sync
  console.log('\n--- TEST 4: PHONE -> DESKTOP CLIPBOARD SYNC ---');
  const testContent = 'ClipBridge Verification Test String - ' + Math.random().toString(36).substring(2, 8);
  console.log(`Simulating clipboard copy on phone: "${testContent}"`);
  
  await new Promise((resolve, reject) => {
    const clipId = 'test-clip-id-' + Math.random().toString(36).substring(2, 6);
    const payload = {
      clip_id: clipId,
      timestamp: Date.now(),
      data_type: 'text',
      content: testContent,
      origin_device_id: CLIENT_DEVICE_ID,
      ttl: 3
    };

    const nonce = crypto.randomBytes(12);
    const { ciphertext, tag } = encryptPayload(syncKey, JSON.stringify(payload), nonce);

    const envelope = {
      sender_id: CLIENT_DEVICE_ID,
      nonce: bytesToHex(nonce),
      ciphertext,
      tag
    };

    console.log('[ClipBridge Sync] Sending encrypted sync envelope...');
    syncSocket.send(JSON.stringify(envelope));

    // Wait for file write on server side
    setTimeout(() => {
      // Check history.json
      const appData = process.env.APPDATA;
      const historyPath = path.join(appData, 'ClipBridge', 'history.json');
      if (fs.existsSync(historyPath)) {
        try {
          const historyContent = fs.readFileSync(historyPath, 'utf8');
          const historyList = JSON.parse(historyContent);
          const found = historyList.find(item => item.content === testContent);
          if (found) {
            console.log(`[ClipBridge Sync] Found synchronized clipboard item in desktop history.json!`);
            console.log('Synchronized item detail:', JSON.stringify(found, null, 2));
            resolve();
          } else {
            reject(new Error('Synchronized item not found in history.json'));
          }
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`history.json does not exist at ${historyPath}`));
      }
    }, 2000);
  });
  console.log('[PASS] Test 4: Phone -> Desktop Clipboard sync validated end-to-end.');

  // Test 5: Device Unpairing & Error Frame Propagation
  console.log('\n--- TEST 5: DEVICE UNPAIRING & RECONNECT LOOP PREVENTION ---');
  
  // 1. Programmatically trigger unpairing on backend
  console.log('[ClipBridge Test] Requesting backend to unpair device...');
  try {
    const unpairResp = await fetch(`http://${DESKTOP_IP}:${PORT}/test/unpair?id=${CLIENT_DEVICE_ID}`);
    const unpairResult = await unpairResp.json();
    console.log('[ClipBridge Test] Backend unpair response:', JSON.stringify(unpairResult));
  } catch (e) {
    console.error('[FAIL] Failed to request unpair from backend', e);
  }

  // 2. Wait for socket closure
  await new Promise((resolve) => {
    if (syncSocket.readyState === WebSocket.CLOSED) {
      console.log('[ClipBridge Test] Active socket was closed automatically upon unpair.');
      resolve();
    } else {
      syncSocket.once('close', () => {
        console.log('[ClipBridge Test] Active socket closed successfully by server.');
        resolve();
      });
    }
  });

  // 3. Attempt to reconnect to /ws and verify it returns UNPAIRED error
  console.log('[ClipBridge Test] Attempting to reconnect to live ws with deleted device ID...');
  const reconnectSocket = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    reconnectSocket.on('open', () => {
      console.log('[ClipBridge Connect] Reconnect socket open. Sending Handshake...');
      const nonce = crypto.randomBytes(12);
      const handshakePayload = {
        timestamp: Date.now(),
        challenge: 'clipbridge-auth-challenge'
      };
      const { ciphertext, tag } = encryptPayload(syncKey, JSON.stringify(handshakePayload), nonce);
      const handshakeReq = {
        device_id: CLIENT_DEVICE_ID,
        nonce: bytesToHex(nonce),
        encrypted_handshake: ciphertext + tag
      };
      reconnectSocket.send(JSON.stringify(handshakeReq));
    });

    reconnectSocket.on('message', (data) => {
      console.log('[ClipBridge Connect] Received message on reconnect socket:', data.toString());
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ERROR' && msg.code === 'UNPAIRED') {
          console.log('[ClipBridge Connect] Handshake successfully rejected with UNPAIRED code!');
          reconnectSocket.close();
          resolve();
        } else {
          reject(new Error('Expected UNPAIRED error, received: ' + data.toString()));
        }
      } catch (err) {
        reject(err);
      }
    });

    reconnectSocket.on('close', (code, reason) => {
      console.log(`[ClipBridge Connect] Reconnect socket closed by server. Code: ${code}, Reason: ${reason}`);
      resolve();
    });

    reconnectSocket.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      reject(new Error('Handshake rejection response timeout'));
    }, 5000);
  });

  console.log('[PASS] Test 5: Device unpairing and reconnect loop prevention validated.');

  console.log('\n=== ALL END-TO-END INTEGRATION TESTS PASSED ===');
}

runTests().catch(e => {
  console.error('\n[FAIL] Test suite failed:', e.message);
  process.exit(1);
});
