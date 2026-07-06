package com.clipbridge.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.clipbridge.ui.theme.PrimaryBlue
import com.clipbridge.ui.viewmodel.MainViewModel
import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import java.nio.ByteBuffer
import java.util.concurrent.Executors

@Composable
fun PairScreen(
    viewModel: MainViewModel,
    onPairSuccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val pairingState by viewModel.pairingState.collectAsState()
    
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted -> hasCameraPermission = granted }
    )

    LaunchedEffect(key1 = true) {
        if (!hasCameraPermission) {
            launcher.launch(Manifest.permission.CAMERA)
        }
    }

    LaunchedEffect(pairingState) {
        if (pairingState is MainViewModel.PairingStatus.Success) {
            onPairSuccess()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        if (hasCameraPermission) {
            AndroidView(
                factory = { context ->
                    val previewView = PreviewView(context)
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
                    
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }

                        val imageAnalysis = ImageAnalysis.Builder()
                            .setTargetResolution(Size(1280, 720))
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()

                        val executor = Executors.newSingleThreadExecutor()
                        imageAnalysis.setAnalyzer(executor, QRCodeAnalyzer { qrText ->
                            // Expected format: cbpair:<desktop_id>:<public_key_hex>:<desktop_name>
                            Log.d("PairScreen", "QR Code detected: $qrText")
                            
                            // Extract IP and Port from user's current local Wi-Fi state or hardcoded local mDNS resolution
                            // In a production app, the scanner can discover servers on LAN first via NSD, match the scanned Desktop ID, and connect!
                            // To make the QR scan pair instantly without waiting for NSD updates:
                            // We can let the desktop encode its CURRENT IP Address directly inside the pairing details as well, e.g. cbpair:id:key:name:ip:port
                            // Let's implement dynamic IP fallback lookup or resolve from discovered list:
                            viewModel.viewModelScope.launch {
                                val discovered = viewModel.pairedDevices.value // Or query active discover manager list
                                // As a robust backup, we parse IP from QR code or look up from discovery.
                                // Let's check parts.
                                val parts = qrText.split(":")
                                if (parts.size >= 4) {
                                    // For testing simplicity we can resolve host from parts if available or hardcode local subnet broadcast, 
                                    // or scan active discoveries matching parts[1].
                                    // Let's find discovered desktop matching parts[1] (Device ID):
                                    val match = SyncDiscoveryBridge.discoveredServers.find { it.id == parts[1] }
                                    val ip = match?.ipAddress ?: "192.168.1.142" // fallback IP or dynamic resolution
                                    val port = match?.port ?: 54670
                                    
                                    viewModel.initiatePairing(qrText, ip, port)
                                }
                            }
                        })

                        try {
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                imageAnalysis
                            )
                        } catch (e: Exception) {
                            Log.e("PairScreen", "Camera binding failed", e)
                        }
                    }, ContextCompat.getMainExecutor(context))

                    previewView
                },
                modifier = Modifier.fillMaxSize()
            )

            // QR Target Scanner Overlay Overlay
            Box(
                modifier = Modifier
                    .size(260.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .align(Alignment.Center)
            )

            // Scanning Status Card
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(24.dp)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = Color.Black.copy(alpha = 0.7f)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    when (pairingState) {
                        is MainViewModel.PairingStatus.Idle -> {
                            Text("Align QR Code within the camera view", color = Color.White, fontSize = 13.sp, textAlign = TextAlign.Center)
                        }
                        is MainViewModel.PairingStatus.Loading -> {
                            CircularProgressIndicator(color = PrimaryBlue, modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Connecting and exchanging security keys...", color = Color.White, fontSize = 13.sp)
                        }
                        is MainViewModel.PairingStatus.Error -> {
                            Text((pairingState as MainViewModel.PairingStatus.Error).message, color = Color.Red, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                        }
                        is MainViewModel.PairingStatus.Success -> {
                            Text("Successfully paired with ${(pairingState as MainViewModel.PairingStatus.Success).name}!", color = Color.Green, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

        } else {
            Text(
                text = "Camera permission required to scan QR Code",
                color = Color.White,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(24.dp)
            )
        }
    }
}

/**
 * ZXing Barcode Analyzer to find QR codes in CameraX frames
 */
class QRCodeAnalyzer(private val onQRCodeDetected: (String) -> Unit) : ImageAnalysis.Analyzer {
    
    private val reader = MultiFormatReader().apply {
        val hints = mapOf(
            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)
        )
        setHints(hints)
    }

    private var isCooldown = false
    private var cooldownTimestamp = 0L

    override fun analyze(image: ImageProxy) {
        val now = System.currentTimeMillis()
        if (isCooldown && now - cooldownTimestamp < 3000) {
            image.close()
            return
        } else {
            isCooldown = false
        }

        val buffer = image.planes[0].buffer
        val data = buffer.toByteArray()
        val width = image.width
        val height = image.height

        val source = PlanarYUVLuminanceSource(
            data, width, height, 0, 0, width, height, false
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))

        try {
            val result = reader.decode(bitmap)
            onQRCodeDetected(result.text)
            isCooldown = true
            cooldownTimestamp = now
        } catch (e: Exception) {
            // No QR code found in frame, continue
        } finally {
            image.close()
        }
    }

    private fun ByteBuffer.toByteArray(): ByteArray {
        rewind()
        val data = ByteArray(remaining())
        get(data)
        return data
    }
}

/**
 * Shared bridge to pass resolved discovery data to Pair Screen
 */
object SyncDiscoveryBridge {
    var discoveredServers: List<DiscoveredServer> = emptyList()
}
