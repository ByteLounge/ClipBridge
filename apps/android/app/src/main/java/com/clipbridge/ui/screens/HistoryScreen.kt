package com.clipbridge.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clipbridge.data.ClipboardHistoryItem
import com.clipbridge.ui.theme.*
import com.clipbridge.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    viewModel: MainViewModel,
    modifier: Modifier = Modifier
) {
    val history by viewModel.clipboardHistory.collectAsState()
    var searchVal by remember { mutableStateOf("") }
    
    val filteredHistory = history.filter {
        it.content.contains(searchVal, ignoreCase = true)
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header with clear button
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Clipboard History",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                if (history.isNotEmpty()) {
                    TextButton(onClick = { viewModel.clearAllHistory() }) {
                        Text("Clear All", color = Color.Red, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Search Bar
            OutlinedTextField(
                value = searchVal,
                onValueChange = { searchVal = it },
                placeholder = { Text("Search history...", color = TextMuted) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search", tint = TextMuted) },
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, BorderGlass, RoundedCornerShape(16.dp)),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Color.Transparent,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedContainerColor = GlassDark,
                    unfocusedContainerColor = GlassDark
                ),
                shape = RoundedCornerShape(16.dp)
            )

            // History Log List
            if (filteredHistory.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize().weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "History is empty",
                        color = TextMuted,
                        fontSize = 14.sp
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredHistory, key = { it.id }) { item ->
                        HistoryCard(
                            item = item,
                            onCopy = { viewModel.copyToClipboard(item.content) },
                            onDelete = { viewModel.deleteHistoryItem(item.id) },
                            modifier = Modifier.animateItemPlacement()
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HistoryCard(
    item: ClipboardHistoryItem,
    onCopy: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val timeString = remember(item.timestamp) {
        val sdf = SimpleDateFormat("MMM d, h:mm a", Locale.getDefault())
        sdf.format(Date(item.timestamp))
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, BorderGlass, RoundedCornerShape(18.dp)),
        color = GlassDark
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "From: ${item.originDeviceName}",
                    fontSize = 11.sp,
                    color = TextSecondary,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = timeString,
                    fontSize = 11.sp,
                    color = TextMuted
                )
            }

            Text(
                text = item.content,
                fontSize = 14.sp,
                color = Color.White,
                maxLines = 4,
                lineHeight = 20.sp
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onDelete) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete",
                        tint = Color.Red.copy(alpha = 0.8f),
                        modifier = Modifier.size(18.dp)
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = onCopy,
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text("Copy", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
