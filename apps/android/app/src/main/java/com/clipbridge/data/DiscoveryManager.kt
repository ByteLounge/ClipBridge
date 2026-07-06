package com.clipbridge.data

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.net.InetAddress
import javax.inject.Inject
import javax.inject.Singleton

data class DiscoveredServer(
    val id: String,
    val name: String,
    val ipAddress: String,
    val port: Int
)

@Singleton
class DiscoveryManager @Inject constructor(
    private val context: Context
) {
    private val TAG = "DiscoveryManager"
    private val SERVICE_TYPE = "_clipbridge._tcp."

    fun discoverServers(): Flow<List<DiscoveredServer>> = callbackFlow {
        val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val discoveredMap = mutableMapOf<String, DiscoveredServer>()

        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.e(TAG, "Resolve failed: $errorCode")
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "Resolve Succeeded. $serviceInfo")
                val host: InetAddress = serviceInfo.host
                val port = serviceInfo.port
                
                // Parse TXT records
                val attributes = serviceInfo.attributes
                val deviceId = attributes["id"]?.let { String(it) } ?: ""
                val displayName = attributes["name"]?.let { String(it) } ?: "Desktop PC"

                if (deviceId.isNotEmpty()) {
                    val server = DiscoveredServer(deviceId, displayName, host.hostAddress ?: "", port)
                    discoveredMap[deviceId] = server
                    trySend(discoveredMap.values.toList())
                }
            }
        }

        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "Discovery failed to start: $errorCode")
                nsdManager.stopServiceDiscovery(this)
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "Discovery failed to stop: $errorCode")
                nsdManager.stopServiceDiscovery(this)
            }

            override fun onDiscoveryStarted(regType: String) {
                Log.d(TAG, "Service discovery started")
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.d(TAG, "Discovery stopped: $serviceType")
                discoveredMap.clear()
                trySend(emptyList())
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "Service discovery success: $serviceInfo")
                if (serviceInfo.serviceType == SERVICE_TYPE) {
                    nsdManager.resolveService(serviceInfo, resolveListener)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                Log.e(TAG, "service lost: $serviceInfo")
                // Resolve device ID if matching
                val name = serviceInfo.serviceName
                discoveredMap.entries.removeIf { entry ->
                    entry.value.name == name || name.contains(entry.value.id.take(8))
                }
                trySend(discoveredMap.values.toList())
            }
        }

        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)

        awaitClose {
            try {
                nsdManager.stopServiceDiscovery(discoveryListener)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping discovery", e)
            }
        }
    }
}
