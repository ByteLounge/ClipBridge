import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export interface PairedDevice {
  id: string;
  name: string;
  lastActive: number;
}

export interface ClipboardItem {
  id: string;
  content: string;
  timestamp: number;
  originDeviceName: string;
}

const DEVICES_KEY = 'clipbridge_paired_devices';
const HISTORY_KEY = 'clipbridge_clipboard_history';

/**
 * Saves paired device metadata, storing the sync key inside hardware-backed SecureStore.
 */
export async function savePairedDevice(
  device: PairedDevice,
  syncKey: Uint8Array
): Promise<void> {
  // 1. Save metadata to AsyncStorage
  const devicesStr = await AsyncStorage.getItem(DEVICES_KEY);
  const devices: PairedDevice[] = devicesStr ? JSON.parse(devicesStr) : [];
  
  // Remove duplicate if exists
  const filtered = devices.filter(d => d.id !== device.id);
  filtered.push(device);
  
  await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(filtered));

  // 2. Save Key to SecureStore (hex encoded)
  const hexKey = Array.from(syncKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  await SecureStore.setItemAsync(`synckey_${device.id}`, hexKey);
}

/**
 * Retrieves the derived shared sync key for a device.
 */
export async function getSyncKey(deviceId: string): Promise<Uint8Array | null> {
  const hexKey = await SecureStore.getItemAsync(`synckey_${deviceId}`);
  if (!hexKey) return null;

  const result = new Uint8Array(hexKey.length / 2);
  for (let i = 0; i < hexKey.length; i += 2) {
    result[i / 2] = parseInt(hexKey.substring(i, i + 2), 16);
  }
  return result;
}

/**
 * Returns list of all paired devices.
 */
export async function getPairedDevices(): Promise<PairedDevice[]> {
  const devicesStr = await AsyncStorage.getItem(DEVICES_KEY);
  return devicesStr ? JSON.parse(devicesStr) : [];
}

/**
 * Unpairs a device and removes its key.
 */
export async function deletePairedDevice(deviceId: string): Promise<void> {
  const devicesStr = await AsyncStorage.getItem(DEVICES_KEY);
  if (devicesStr) {
    const devices: PairedDevice[] = JSON.parse(devicesStr);
    const filtered = devices.filter(d => d.id !== deviceId);
    await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(filtered));
  }
  await SecureStore.deleteItemAsync(`synckey_${deviceId}`);
}

/**
 * Saves clipboard items to history.
 */
export async function saveHistoryItem(item: ClipboardItem): Promise<void> {
  const historyStr = await AsyncStorage.getItem(HISTORY_KEY);
  const history: ClipboardItem[] = historyStr ? JSON.parse(historyStr) : [];
  
  // Keep size capped at 50
  if (history.length >= 50) {
    history.pop();
  }
  
  history.unshift(item);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/**
 * Fetches the clipboard history log.
 */
export async function getClipboardHistory(): Promise<ClipboardItem[]> {
  const historyStr = await AsyncStorage.getItem(HISTORY_KEY);
  return historyStr ? JSON.parse(historyStr) : [];
}

/**
 * Clears the clipboard history log.
 */
export async function clearClipboardHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

/**
 * Deletes a single item from the history.
 */
export async function deleteHistoryItem(id: string): Promise<void> {
  const historyStr = await AsyncStorage.getItem(HISTORY_KEY);
  if (historyStr) {
    const history: ClipboardItem[] = JSON.parse(historyStr);
    const filtered = history.filter(item => item.id !== id);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  }
}
