package com.clipbridge.ui.screens

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clipbridge.ui.theme.*
import com.clipbridge.ui.viewmodel.MainViewModel

@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("clipbridge_prefs", Context.MODE_PRIVATE) }
    
    var autoSync by remember { mutableStateOf(prefs.getBoolean("auto_sync", true)) }
    var lanOnly by remember { mutableStateOf(prefs.getBoolean("lan_only", true)) }
    var batteryOptimizer by remember { mutableStateOf(prefs.getBoolean("battery_saver", true)) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text(
                text = "Settings",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.padding(top = 16.dp)
            )

            // General Card
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .border(1.dp, BorderGlass, RoundedCornerShape(20.dp)),
                color = GlassDark
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "GENERAL SETTINGS",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary,
                        letterSpacing = 1.sp
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Auto Sync", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            Text("Instantly push clipboard content when copied.", fontSize = 11.sp, color = TextMuted)
                        }
                        Switch(
                            checked = autoSync,
                            onCheckedChange = {
                                autoSync = it
                                prefs.edit().putBoolean("auto_sync", it).apply()
                            },
                            colors = SwitchDefaults.colors(checkedThumbColor = PrimaryBlue)
                        )
                    }

                    Divider(color = BorderGlass)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("LAN Only Mode", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            Text("Restrict communication to local Wi-Fi only.", fontSize = 11.sp, color = TextMuted)
                        }
                        Switch(
                            checked = lanOnly,
                            onCheckedChange = {
                                lanOnly = it
                                prefs.edit().putBoolean("lan_only", it).apply()
                            },
                            colors = SwitchDefaults.colors(checkedThumbColor = PrimaryBlue)
                        )
                    }
                }
            }

            // Security Card
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .border(1.dp, BorderGlass, RoundedCornerShape(20.dp)),
                color = GlassDark
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "SECURITY & IDENTITY",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary,
                        letterSpacing = 1.sp
                    )

                    Column {
                        Text("Device Unique ID", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = viewModel.deviceId,
                            fontSize = 11.sp,
                            color = TextMuted,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                        )
                    }

                    Divider(color = BorderGlass)

                    Column {
                        Text("Encryption Standard", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("E2EE AES-256-GCM wrapped with persistent X25519 identity key validation.", fontSize = 11.sp, color = TextMuted)
                    }
                }
            }
        }
    }
}
