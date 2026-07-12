package com.clipbridge.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clipbridge.ui.theme.*
import com.clipbridge.ui.viewmodel.MainViewModel

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    modifier: Modifier = Modifier
) {
    val history by viewModel.clipboardHistory.collectAsState()
    val paired by viewModel.pairedDevices.collectAsState()
    var manualText by remember { mutableStateOf("") }
    
    val recentClip = history.firstOrNull()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(BgDark, Color(0xFF0F0E17))
                )
            )
            .padding(16.dp)
    ) {
        // Decorative ambient glows in background
        Box(
            modifier = Modifier
                .size(250.dp)
                .align(Alignment.TopStart)
                .offset(x = (-80).dp, y = (-80).dp)
                .blur(100.dp)
                .background(PrimaryBlue.copy(alpha = 0.15f), RoundedCornerShape(125.dp))
        )
        Box(
            modifier = Modifier
                .size(250.dp)
                .align(Alignment.BottomEnd)
                .offset(x = (80).dp, y = (80).dp)
                .blur(100.dp)
                .background(PurpleAccent.copy(alpha = 0.15f), RoundedCornerShape(125.dp))
        )

        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // App Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "ClipBridge",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "Copy Anywhere. Paste Everywhere.",
                        fontSize = 11.sp,
                        color = TextSecondary,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = if (paired.isNotEmpty()) PrimaryBlue.copy(alpha = 0.15f) else Color.Red.copy(alpha = 0.15f),
                    modifier = Modifier.border(1.dp, if (paired.isNotEmpty()) PrimaryBlue.copy(alpha = 0.3f) else Color.Red.copy(alpha = 0.3f), RoundedCornerShape(20.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(if (paired.isNotEmpty()) Color.Green else Color.Red, RoundedCornerShape(4.dp))
                        )
                        Text(
                            text = if (paired.isNotEmpty()) "Sync Active" else "Disconnected",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }

            // Clipboard Large Preview Card
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1.2f)
                    .clip(RoundedCornerShape(24.dp))
                    .border(1.dp, BorderGlass, RoundedCornerShape(24.dp)),
                color = GlassDark
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "RECENT CLIPBOARD SYNC",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary,
                        letterSpacing = 1.sp
                    )

                    AnimatedContent(
                        targetState = recentClip,
                        transitionSpec = {
                            fadeIn() + scaleIn() togetherWith fadeOut() + scaleOut()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .padding(vertical = 16.dp)
                    ) { clip ->
                        if (clip != null) {
                            Column(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text(
                                    text = clip.content,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Normal,
                                    color = Color.White,
                                    maxLines = 6,
                                    lineHeight = 26.sp
                                )
                            }
                        } else {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No clipboard synchronized yet.\nCopy something on your paired device to sync.",
                                    fontSize = 14.sp,
                                    textAlign = TextAlign.Center,
                                    color = TextMuted
                                )
                            }
                        }
                    }

                    if (recentClip != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "From: ${recentClip.originDeviceName}",
                                fontSize = 11.sp,
                                color = TextMuted
                            )
                            Button(
                                onClick = { viewModel.copyToClipboard(recentClip.content) },
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                            ) {
                                Text("Copy Locally", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Quick Send Card
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.9f)
                    .clip(RoundedCornerShape(24.dp))
                    .border(1.dp, BorderGlass, RoundedCornerShape(24.dp)),
                color = GlassDark
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "MANUAL CLIPBOARD PUSH",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary,
                        letterSpacing = 1.sp
                    )

                    TextField(
                        value = manualText,
                        onValueChange = { manualText = it },
                        placeholder = { Text("Type or paste anything to send...", color = TextMuted) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .padding(vertical = 8.dp),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )

                    Button(
                        onClick = {
                            if (manualText.isNotEmpty()) {
                                viewModel.sendClipboardManually(manualText)
                                manualText = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(14.dp),
                        contentPadding = PaddingValues()
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    Brush.horizontalGradient(
                                        colors = listOf(PrimaryBlue, PurpleAccent)
                                    ),
                                    RoundedCornerShape(14.dp)
                                )
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Send, contentDescription = "Send", tint = Color.White, modifier = Modifier.size(16.dp))
                                Text("Broadcast Clip", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
