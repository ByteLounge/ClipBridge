package com.clipbridge.ui.viewmodel

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.clipbridge.data.*
import com.clipbridge.service.SyncChannel
import com.clipbridge.service.ClipboardSyncService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val db: ClipBridgeDatabase,
    private val clipboardHelper: ClipboardManagerHelper
) : ViewModel() {

    private val TAG = "MainViewModel"
    private val prefs = context.getSharedPreferences("clipbridge_prefs", Context.MODE_PRIVATE)

    val pairedDevices = db.pairedDeviceDao().getAllDevices().stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val clipboardHistory = db.clipboardHistoryDao().getAllHistory().stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    private val _pairingState = MutableStateFlow<PairingStatus>(PairingStatus.Idle)
    val pairingState: StateFlow<PairingStatus> = _pairingState

    val deviceId: String
        get() = prefs.getString("device_id", "") ?: ""

    val displayName: String
        get() = prefs.getString("display_name", "") ?: Build.MODEL

    init {
        // Guarantee device ID is generated
        if (deviceId.isEmpty()) {
            val newId = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", newId).apply()
        }
    }

    fun initiatePairing(qrData: String, ipAddress: String, port: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            _pairingState.value = PairingStatus.Loading
            
            // Expected QR structure: cbpair:<desktop_id>:<desktop_public_key_hex>:<desktop_name>
            val parts = qrData.split(":")
            if (parts.size < 4 || parts[0] != "cbpair") {
                _pairingState.value = PairingStatus.Error("Invalid QR code format")
                return@launch
            }

            val desktopId = parts[1]
            val desktopPublicKeyHex = parts[2]
            val desktopName = parts[3]

            val client = HttpClient(OkHttp) {
                install(WebSockets)
            }

            val url = "ws://$ipAddress:$port/pair"
            Log.d(TAG, "Connecting to pair endpoint: $url")

            try {
                client.webSocket(url) {
                    // 1. Generate local keypair
                    val (privKey, pubKeyBytes) = CryptoManager.generateKeyPair()

                    // 2. Send PAIR_REQUEST
                    val request = RawPairRequest(
                        device_id = deviceId,
                        display_name = displayName,
                        client_public_key = hex(pubKeyBytes)
                    )
                    send(Frame.Text(Json.encodeToString(request)))

                    // 3. Receive PAIR_RESPONSE
                    val responseFrame = incoming.receive() as Frame.Text
                    val response = Json.decodeFromString<RawPairResponse>(responseFrame.readText())

                    // 4. Compute Shared Symmetric Key
                    val desktopPubBytes = hexToBytes(response.server_public_key)
                    val syncKey = CryptoManager.deriveSharedKey(privKey, desktopPubBytes)

                    // 5. Store Paired Device details
                    db.pairedDeviceDao().insertDevice(
                        PairedDevice(
                            id = desktopId,
                            name = desktopName,
                            syncKey = syncKey,
                            lastActive = System.currentTimeMillis()
                        )
                    )

                    _pairingState.value = PairingStatus.Success(desktopName)
                    Log.d(TAG, "Successfully paired with $desktopName!")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Pairing handshake failed", e)
                _pairingState.value = PairingStatus.Error("Failed to pair: ${e.message}")
            } finally {
                client.close()
            }
        }
    }

    fun deleteDevice(device: PairedDevice) {
        viewModelScope.launch {
            db.pairedDeviceDao().deleteDevice(device)
        }
    }

    fun deleteHistoryItem(id: String) {
        viewModelScope.launch {
            db.clipboardHistoryDao().deleteById(id)
        }
    }

    fun clearAllHistory() {
        viewModelScope.launch {
            db.clipboardHistoryDao().clearHistory()
        }
    }

    fun copyToClipboard(text: String) {
        clipboardHelper.setClipboardText(text)
    }

    fun sendClipboardManually(text: String) {
        viewModelScope.launch {
            // Write local history first
            val clipId = UUID.randomUUID().toString()
            val timestamp = System.currentTimeMillis()
            db.clipboardHistoryDao().insertItem(
                ClipboardHistoryItem(
                    id = clipId,
                    content = text,
                    timestamp = timestamp,
                    originDeviceName = "Local Phone"
                )
            )

            // Broadcast payload to all paired sync channels
            val paired = db.pairedDeviceDao().getAllDevicesList()
            paired.forEach { device ->
                try {
                    val nonce = CryptoManager.generateNonce()
                    val payload = ClipboardSyncService.DecryptedSyncPayload(
                        clip_id = clipId,
                        timestamp = timestamp,
                        data_type = "text",
                        content = text,
                        origin_device_id = deviceId,
                        ttl = 3
                    )
                    val ptBytes = Json.encodeToString(payload).toByteArray()
                    val (ct, tag) = CryptoManager.encrypt(device.syncKey, ptBytes, nonce)

                    val env = ClipboardSyncService.SyncEnvelope(
                        sender_id = deviceId,
                        nonce = hex(nonce),
                        ciphertext = hex(ct),
                        tag = hex(tag)
                    )

                    SyncChannel.sendEvent(Json.encodeToString(env))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed manual send encryption", e)
                }
            }
        }
    }

    sealed interface PairingStatus {
        object Idle : PairingStatus
        object Loading : PairingStatus
        data class Success(val name: String) : PairingStatus
        data class Error(val message: String) : PairingStatus
    }

    @Serializable
    data class RawPairRequest(
        val device_id: String,
        val display_name: String,
        val client_public_key: String
    )

    @Serializable
    data class RawPairResponse(
        val device_id: String,
        val display_name: String,
        val server_public_key: String
    )

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
    private fun hexToBytes(hex: String): ByteArray {
        val result = ByteArray(hex.length / 2)
        for (i in 0 until hex.length step 2) {
            result[i / 2] = hex.substring(i, i + 2).toInt(16).toByte()
        }
        return result
    }
}
