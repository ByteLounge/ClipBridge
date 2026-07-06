package com.clipbridge.data

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ClipboardManagerHelper @Inject constructor(
    private val context: Context
) {
    private val clipboard: ClipboardManager by lazy {
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    }
    
    private val mainHandler = Handler(Looper.getMainLooper())

    interface ClipboardListener {
        fun onClipboardChanged(text: String)
    }

    private var activeListener: ClipboardManager.OnPrimaryClipChangedListener? = null

    fun getClipboardText(): String {
        val primaryClip = clipboard.primaryClip
        if (primaryClip != null && primaryClip.itemCount > 0) {
            val item = primaryClip.getItemAt(0)
            return item.text?.toString() ?: ""
        }
        return ""
    }

    fun setClipboardText(text: String, onComplete: () -> Unit = {}) {
        mainHandler.post {
            val clip = ClipData.newPlainText("Synced Content", text)
            // Temporarily remove listener to avoid echoing our own sync
            val cachedListener = activeListener
            if (cachedListener != null) {
                clipboard.removeOnPrimaryClipChangedListener(cachedListener)
            }

            clipboard.setPrimaryClip(clip)

            if (cachedListener != null) {
                // Delay readding listener slightly to allow the OS to complete write
                mainHandler.postDelayed({
                    clipboard.addOnPrimaryClipChangedListener(cachedListener)
                }, 500)
            }
            onComplete()
        }
    }

    fun startListening(listener: ClipboardListener) {
        mainHandler.post {
            if (activeListener != null) {
                clipboard.removeOnPrimaryClipChangedListener(activeListener)
            }
            
            activeListener = ClipboardManager.OnPrimaryClipChangedListener {
                val text = getClipboardText()
                if (text.isNotEmpty()) {
                    listener.onClipboardChanged(text)
                }
            }
            
            clipboard.addOnPrimaryClipChangedListener(activeListener)
        }
    }

    fun stopListening() {
        mainHandler.post {
            activeListener?.let {
                clipboard.removeOnPrimaryClipChangedListener(it)
                activeListener = null
            }
        }
    }
}
