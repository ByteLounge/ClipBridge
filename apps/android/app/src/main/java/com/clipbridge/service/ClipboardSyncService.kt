package com.clipbridge.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.clipbridge.MainActivity
import com.clipbridge.data.*
import dagger.hilt.android.AndroidEntryPoint
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

@AndroidEntryPoint
class ClipboardSyncService : Service() {

    private val TAG = "ClipboardSyncService"
    private val NOTIFICATION_CHANNEL_ID = "clipbridge_sync_channel"
    private val NOTIFICATION_ID = 54671

    @Inject lateinit var db: ClipBridgeDatabase
    @Inject lateinit var clipboardHelper: ClipboardManagerHelper
    @Inject lateinit var discoveryManager: DiscoveryManager

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    private val client = HttpClient(OkHttp) {
        install(WebSockets)
    }

    private val activeConnections = mutableMapOf<String, Job>()
    private var lastSyncedClipId: String? = null
    private var deviceId: String = ""
    private var displayName: String = ""

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        createNotificationChannel()
        var hasNotificationPermission = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasNotificationPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        }
        if (hasNotificationPermission) {
            startForeground(NOTIFICATION_ID, buildNotification("ClipBridge is running", "Ready to sync your clipboard"))
        } else {
            Log.d(TAG, "Notification skipped because POST_NOTIFICATIONS permission has not been granted.")
        }

        // Load or generate local Device ID
        val prefs = getSharedPreferences("clipbridge_prefs", Context.MODE_PRIVATE)
        deviceId = prefs.getString("device_id", "") ?: ""
        if (deviceId.isEmpty()) {
            deviceId = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", deviceId).apply()
        }
        displayName = prefs.getString("display_name", "") ?: Build.MODEL
        if (displayName.isEmpty()) {
            displayName = Build.MODEL
            prefs.edit().putString("display_name", displayName).apply()
        }

        // Start clipboard monitor listener
        clipboardHelper.startListening(object : ClipboardManagerHelper.ClipboardListener {
            override fun onClipboardChanged(text: String) {
                if (text.trim().isEmpty()) return
                serviceScope.launch {
                    broadcastClipboardContent(text)
                }
            }
        })

        // Observe network discovery and paired devices from database
        serviceScope.launch {
            combine(
                discoveryManager.discoverServers(),
                db.pairedDeviceDao().getAllDevices()
            ) { servers, pairedList ->
                Pair(servers, pairedList.associateBy { it.id })
            }.collectLatest { (servers, pairedMap) ->
                // Identify servers that are both visible and paired
                val activePairedServerIds = servers.map { it.id }.filter { pairedMap.containsKey(it) }.toSet()
                
                // Disconnect any active connection that is no longer discovered or no longer paired
                activeConnections.keys.toList().forEach { connectedId ->
                    if (!activePairedServerIds.contains(connectedId)) {
                        Log.d(TAG, "Cancelling connection to $connectedId because it was either lost or unpaired")
                        activeConnections[connectedId]?.cancel()
                        activeConnections.remove(connectedId)
                        updateNotificationText("Disconnected from desktop")
                    }
                }

                // Connect to newly discovered paired servers
                servers.forEach { server ->
                    val pairInfo = pairedMap[server.id]
                    if (pairInfo != null && !activeConnections.containsKey(server.id)) {
                        val job = serviceScope.launch {
                            connectToDesktop(server, pairInfo.syncKey)
                        }
                        activeConnections[server.id] = job
                    }
                }
            }
        }
    }

    private suspend fun connectToDesktop(server: DiscoveredServer, syncKey: ByteArray) {
        val url = "ws://${server.ipAddress}:${server.port}/ws"
        Log.d(TAG, "Connecting to desktop: $url")
        
        while (currentCoroutineContext().isActive) {
            try {
                client.webSocket(url) {
                    Log.d(TAG, "WS Connected to desktop: ${server.name}")
                    updateNotificationText("Synced with ${server.name}")

                    // 1. Perform Encrypted Handshake
                    val nonce = CryptoManager.generateNonce()
                    val ts = System.currentTimeMillis()
                    val handshakePayload = HandshakePayload(ts, "clipbridge-auth-challenge")
                    val ptBytes = Json.encodeToString(handshakePayload).toByteArray()
                    val (ct, tag) = CryptoManager.encrypt(syncKey, ptBytes, nonce)

                    val handshakeReq = HandshakeRequest(
                        device_id = deviceId,
                        nonce = hex(nonce),
                        encrypted_handshake = hex(ct) + hex(tag)
                    )
                    
                    send(Frame.Text(Json.encodeToString(handshakeReq)))

                    // 2. Start Read/Write streams
                    val readJob = launch {
                        for (frame in incoming) {
                            if (frame is Frame.Text) {
                                handleReceivedPacket(frame.readText(), syncKey, server.name)
                            }
                        }
                    }

                    val writeJob = launch {
                        SyncChannel.subscribe().collect { event ->
                            send(Frame.Text(event))
                        }
                    }

                    // Await disconnect or cancel
                    joinAll(readJob, writeJob)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection error for ${server.name}: ${e.message}. Retrying in 5s...")
                updateNotificationText("Connecting to ${server.name}...")
            }
            delay(5000) // connection retry loop delay
        }
    }

    private suspend fun handleReceivedPacket(rawJson: String, syncKey: ByteArray, serverName: String) {
        try {
            val env = Json.decodeFromString<SyncEnvelope>(rawJson)
            val nonceBytes = hexToBytes(env.nonce)
            val fullCt = hexToBytes(env.ciphertext)
            val tagBytes = hexToBytes(env.tag)

            // Decrypt AES-GCM
            val decryptedBytes = CryptoManager.decrypt(syncKey, fullCt, nonceBytes, tagBytes)
            val payload = Json.decodeFromString<DecryptedSyncPayload>(String(decryptedBytes))

            // Loop Prevention
            if (payload.origin_device_id == deviceId) {
                return // Loop packet, drop
            }
            if (payload.clip_id == lastSyncedClipId) {
                return // Already processed
            }

            lastSyncedClipId = payload.clip_id
            
            // Save in database history
            db.clipboardHistoryDao().insertItem(
                ClipboardHistoryItem(
                    id = payload.clip_id,
                    content = payload.content,
                    timestamp = payload.timestamp,
                    originDeviceName = serverName
                )
            )

            // Write to local Android OS clipboard
            clipboardHelper.setClipboardText(payload.content)
            Log.d(TAG, "Remote Clipboard synchronized successfully!")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to decrypt/validate incoming clipboard packet", e)
        }
    }

    private suspend fun broadcastClipboardContent(text: String) {
        val paired = db.pairedDeviceDao().getAllDevicesList().associateBy { it.id }
        if (paired.isEmpty()) return

        val clipId = UUID.randomUUID().toString()
        lastSyncedClipId = clipId
        val timestamp = System.currentTimeMillis()

        // Write locally in history database
        db.clipboardHistoryDao().insertItem(
            ClipboardHistoryItem(
                id = clipId,
                content = text,
                timestamp = timestamp,
                originDeviceName = "Local Phone"
            )
        )

        // Iterate over active connection scopes to publish
        activeConnections.forEach { (serverId, _) ->
            val key = paired[serverId]?.syncKey ?: return@forEach
            val payload = DecryptedSyncPayload(
                clip_id = clipId,
                timestamp = timestamp,
                data_type = "text",
                content = text,
                origin_device_id = deviceId,
                ttl = 3
            )

            try {
                val nonce = CryptoManager.generateNonce()
                val ptBytes = Json.encodeToString(payload).toByteArray()
                val (ct, tag) = CryptoManager.encrypt(key, ptBytes, nonce)
                
                val env = SyncEnvelope(
                    sender_id = deviceId,
                    nonce = hex(nonce),
                    ciphertext = hex(ct),
                    tag = hex(tag)
                )

                val envString = Json.encodeToString(env)
                
                // Launch sending frame on matching service job
                serviceScope.launch {
                    // Send over WebSocket (Ktor lets us find the active WS session in our map, or we can broadcast via standard Event flows. For simplicity, we can broadcast via a SharedFlow in memory that connectToDesktop subscribes to)
                    // Let's implement dynamic broadcasting. In our code here, since Ktor connects within the serviceScope of connectToDesktop:
                    // Let's write a simple event loop inside the service, or notify the active Websocket sessions.
                    // Wait, let's write to a global sync EventChannel!
                    SyncChannel.sendEvent(envString)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to encrypt/send clipboard data to $serverId", e)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service onDestroy")
        clipboardHelper.stopListening()
        serviceJob.cancel()
        client.close()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "ClipBridge Background Synchronization",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotificationText(text: String) {
        var hasNotificationPermission = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasNotificationPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        }
        if (!hasNotificationPermission) {
            Log.d(TAG, "Notification skipped because POST_NOTIFICATIONS permission has not been granted.")
            return
        }
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(
            NOTIFICATION_ID,
            buildNotification("ClipBridge Active", text)
        )
    }

    // Helper serialization formats
    @Serializable
    data class HandshakePayload(val timestamp: Long, val challenge: String)

    @Serializable
    data class HandshakeRequest(
        val device_id: String,
        val nonce: String,
        val encrypted_handshake: String
    )

    @Serializable
    data class SyncEnvelope(
        val sender_id: String,
        val nonce: String,
        val ciphertext: String,
        val tag: String
    )

    @Serializable
    data class DecryptedSyncPayload(
        val clip_id: String,
        val timestamp: Long,
        val data_type: String,
        val content: String,
        val origin_device_id: String,
        val ttl: Int
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

/**
 * Event pipe to broadcast outgoing frames to connected websockets
 */
object SyncChannel {
    private val flow = kotlinx.coroutines.flow.MutableSharedFlow<String>(extraBufferCapacity = 64)
    
    suspend fun sendEvent(json: String) {
        flow.emit(json)
    }

    fun subscribe(): kotlinx.coroutines.flow.SharedFlow<String> = flow
}
