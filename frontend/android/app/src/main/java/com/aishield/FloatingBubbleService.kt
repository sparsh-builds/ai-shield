package com.aishield

import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.*
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class FloatingBubbleService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var bubbleView: View
    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())

    // Backend FastAPI URL (Local network IP ya Tunnel)
    private val BACKEND_URL = "http://10.5.52.240" // PC IP dalna agar real device hai

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        // Bubble Layout inflate ya programmatic view
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 100
            y = 200
        }

        // Simple floating button setup
        val button = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_dialog_info)
            setBackgroundColor(0xFF05D9E8.toInt())
            setPadding(20, 20, 20, 20)
        }
        bubbleView = button

        // Click par scan trigger karna
        button.setOnClickListener {
            triggerLiveAudit()
        }

        windowManager.addView(bubbleView, params)
    }

    private fun triggerLiveAudit() {
        val accessibility = ShieldAccessibilityService.instance
        if (accessibility == null) {
            Toast.makeText(this, "Enable AI Shield Accessibility in Settings!", Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(this, "Scanning email/SMS...", Toast.LENGTH_SHORT).show()

        val screenData = accessibility.captureCurrentAppText()
        val textToScan = screenData.rawText

        if (textToScan.isBlank()) {
            Toast.makeText(this, "No readable content found on screen", Toast.LENGTH_SHORT).show()
            return
        }

        // Background thread me FastAPI call
        serviceScope.launch(Dispatchers.IO) {
            try {
                val isGmail = screenData.packageName.contains("gm")
                val endpoint = if (isGmail) "$BACKEND_URL/predict/email" else "$BACKEND_URL/predict/sms"

                val payload = JSONObject().apply {
                    put("id", "overlay_scan")
                    if (isGmail) {
                        put("subject", "Scraped Screen Content")
                        put("sender", "") // Heuristics raw text me regex se sender dhund lega
                        put("body", textToScan)
                        put("urls", org.json.JSONArray())
                    } else {
                        put("text", textToScan)
                    }
                }

                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = 5000
                    readTimeout = 5000
                    outputStream.use { it.write(payload.toString().toByteArray()) }
                }

                if (conn.responseCode == 200) {
                    val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                    val jsonResponse = JSONObject(responseText)
                    val riskScore = jsonResponse.getInt("riskScore")
                    val category = jsonResponse.getString("category")
                    val reasons = jsonResponse.getJSONArray("reasons")

                    withContext(Dispatchers.Main) {
                        displayMiniReport(riskScore, category, reasons)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(applicationContext, "Scan Failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun displayMiniReport(score: Int, category: String, reasons: org.json.JSONArray) {
        val firstReason = if (reasons.length() > 0) reasons.getString(0) else "Clean"
        val alertColor = when {
            score >= 70 -> "🔴 HIGH RISK"
            score >= 35 -> "🟡 SUSPICIOUS"
            else -> "🟢 SAFE"
        }

        // Screen par chhota Toast ya custom mini card dikhana
        Toast.makeText(
            this,
            "$alertColor ($score/100)\nCategory: $category\nReason: $firstReason",
            Toast.LENGTH_LONG
        ).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        if (::bubbleView.isInitialized) windowManager.removeView(bubbleView)
    }
}