package com.clipbridge

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewmodel.compose.viewModel
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.clipbridge.data.DiscoveryManager
import com.clipbridge.service.ClipboardSyncService
import com.clipbridge.ui.screens.*
import com.clipbridge.ui.theme.ClipBridgeTheme
import com.clipbridge.ui.theme.PrimaryBlue
import com.clipbridge.ui.viewmodel.MainViewModel
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var discoveryManager: DiscoveryManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Start local network sync service
        val correctIntent = Intent(this, ClipboardSyncService::class.java)
        startForegroundService(correctIntent)

        // Bind discovery servers list to pairing screen bridge
        lifecycleScope.launch {
            discoveryManager.discoverServers().collectLatest { servers ->
                SyncDiscoveryBridge.discoveredServers = servers
            }
        }

        setContent {
            ClipBridgeTheme {
                val viewModel: MainViewModel = viewModel()
                var currentTab by remember { mutableStateOf("home") }
                var showPairOverlay by remember { mutableStateOf(false) }

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    if (showPairOverlay) {
                        PairScreen(
                            viewModel = viewModel,
                            onPairSuccess = { showPairOverlay = false }
                        )
                    } else {
                        Scaffold(
                            bottomBar = {
                                BottomNavigationBar(
                                    currentTab = currentTab,
                                    onTabSelected = { currentTab = it }
                                )
                            }
                        ) { innerPadding ->
                            val modifier = Modifier.padding(innerPadding)
                            when (currentTab) {
                                "home" -> HomeScreen(viewModel, modifier)
                                "history" -> HistoryScreen(viewModel, modifier)
                                "devices" -> DevicesScreen(viewModel, onPairClick = { showPairOverlay = true }, modifier)
                                "settings" -> SettingsScreen(viewModel, modifier)
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun BottomNavigationBar(
        currentTab: String,
        onTabSelected: (String) -> Unit
    ) {
        NavigationBar(
            containerColor = MaterialTheme.colorScheme.background,
            tonalElevation = 8.dp
        ) {
            NavigationBarItem(
                selected = currentTab == "home",
                onClick = { onTabSelected("home") },
                icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                label = { Text("Home", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                colors = NavigationBarItemDefaults.colors(selectedIconColor = PrimaryBlue)
            )
            NavigationBarItem(
                selected = currentTab == "history",
                onClick = { onTabSelected("history") },
                icon = { Icon(Icons.Default.List, contentDescription = "History") },
                label = { Text("History", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                colors = NavigationBarItemDefaults.colors(selectedIconColor = PrimaryBlue)
            )
            NavigationBarItem(
                selected = currentTab == "devices",
                onClick = { onTabSelected("devices") },
                icon = { Icon(Icons.Default.Refresh, contentDescription = "Devices") },
                label = { Text("Devices", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                colors = NavigationBarItemDefaults.colors(selectedIconColor = PrimaryBlue)
            )
            NavigationBarItem(
                selected = currentTab == "settings",
                onClick = { onTabSelected("settings") },
                icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                label = { Text("Settings", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                colors = NavigationBarItemDefaults.colors(selectedIconColor = PrimaryBlue)
            )
        }
    }
}
