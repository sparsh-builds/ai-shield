const { withMainApplication, withAndroidManifest, withDangerousMod, withStringsXml } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withShieldBridge(config) {
  // 1. Register ShieldBridgePackage in MainApplication.kt
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('ShieldBridgePackage')) {
      contents = contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n              add(ShieldBridgePackage())'
      );
      config.modResults.contents = contents;
    }
    return config;
  });

  // 2. Add Accessibility description string in strings.xml
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];
    if (!strings.some((s) => s.$.name === 'accessibility_service_description')) {
      strings.push({
        $: { name: 'accessibility_service_description' },
        _: 'AI Shield scans on-screen email and SMS text for phishing and scam indicators.',
      });
    }
    config.modResults.resources.string = strings;
    return config;
  });

  // 3. Auto-generate XML config + All 4 Native Kotlin Files
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.platformProjectRoot;

      // 3a. accessibility_service_config.xml
      const xmlDir = path.join(root, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'accessibility_service_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/accessibility_service_description"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="100" />
`,
        'utf8'
      );

      // 3b. Native Kotlin Files in com/aishield
      const javaDir = path.join(root, 'app', 'src', 'main', 'java', 'com', 'aishield');
      fs.mkdirSync(javaDir, { recursive: true });

      // File 1: ShieldAccessibilityService.kt (Filtered & Deterministic Text Scraper)
      const accessibilityKt = `package com.aishield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

data class ScreenContent(val packageName: String, val rawText: String, val lines: List<String>)

class ShieldAccessibilityService : AccessibilityService() {

    companion object {
        var instance: ShieldAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) instance = null
    }

    fun captureCurrentAppText(): ScreenContent {
        val rootNode = rootInActiveWindow ?: return ScreenContent("", "", emptyList())
        val pkg = rootNode.packageName?.toString() ?: ""

        // Ignore system UI or AI Shield itself
        if (pkg == "com.android.systemui" || pkg == "com.aishield") {
            return ScreenContent(pkg, "", emptyList())
        }

        val collected = LinkedHashSet<String>()
        traverseNode(rootNode, collected)

        val cleanLines = collected.toList()
        val combined = cleanLines.joinToString("\\n").trim()
        return ScreenContent(pkg, combined, cleanLines)
    }

    private fun traverseNode(node: AccessibilityNodeInfo?, collected: LinkedHashSet<String>) {
        if (node == null) return

        val raw = node.text?.toString()?.trim() ?: node.contentDescription?.toString()?.trim()
        if (!raw.isNullOrEmpty()) {
            val isUrlOrEmail = raw.contains("http://", true) || raw.contains("https://", true) || raw.contains("@")
            val isClock = raw.matches(Regex("^\\\\d{1,2}:\\\\d{2}(\\\\s?[APMapm]{2})?$"))
            val isPercent = raw.matches(Regex("^\\\\d{1,3}%$"))

            // Keep meaningful sentences (>12 chars) or any URL/email; drop clocks & tiny nav labels
            if (!isClock && !isPercent && (raw.length > 12 || isUrlOrEmail)) {
                collected.add(raw)
            }
        }

        for (i in 0 until node.childCount) {
            traverseNode(node.getChild(i), collected)
        }
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'ShieldAccessibilityService.kt'), accessibilityKt, 'utf8');

      // File 2: FloatingBubbleService.kt (Extracts Real Subject, Sender & URLs)
      const bubbleKt = `package com.aishield

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class FloatingBubbleService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var bubbleView: View
    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())

    private val BACKEND_URL = "https://ai-shield-backend-6o9v.onrender.com"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

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
            y = 250
        }

        val button = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_dialog_info)
            setBackgroundColor(0xFF05D9E8.toInt())
            setPadding(28, 28, 28, 28)
        }
        bubbleView = button

        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        button.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager.updateViewLayout(bubbleView, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val dx = Math.abs(event.rawX - initialTouchX)
                    val dy = Math.abs(event.rawY - initialTouchY)
                    if (dx < 15 && dy < 15) {
                        triggerLiveAudit()
                    }
                    true
                }
                else -> false
            }
        }

        windowManager.addView(bubbleView, params)
    }

    private fun extractUrls(text: String): JSONArray {
        val urlRegex = Regex("https?://[^\\\\s\\"'>)]+", RegexOption.IGNORE_CASE)
        val urls = JSONArray()
        urlRegex.findAll(text).map { it.value }.distinct().forEach { urls.put(it) }
        return urls
    }

    private fun extractSender(text: String): String {
        val emailRegex = Regex("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}")
        return emailRegex.find(text)?.value ?: ""
    }

    private fun triggerLiveAudit() {
        val accessibility = ShieldAccessibilityService.instance
        if (accessibility == null) {
            Toast.makeText(this, "Enable AI Shield Accessibility in Settings!", Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(this, "Scanning screen...", Toast.LENGTH_SHORT).show()

        val screenData = accessibility.captureCurrentAppText()
        val textToScan = screenData.rawText

        if (textToScan.isBlank()) {
            Toast.makeText(this, "Open an Email or SMS first, then tap bubble", Toast.LENGTH_SHORT).show()
            return
        }

        serviceScope.launch(Dispatchers.IO) {
            try {
                val isGmail = screenData.packageName.contains("gm", ignoreCase = true) ||
                              screenData.packageName.contains("mail", ignoreCase = true)
                val endpoint = if (isGmail) "$BACKEND_URL/predict/email" else "$BACKEND_URL/predict/sms"

                val extractedUrls = extractUrls(textToScan)
                val extractedSender = extractSender(textToScan)
                val extractedSubject = screenData.lines.firstOrNull { !it.contains("@") && !it.startsWith("http") } ?: "On-Screen Email"

                val payload = JSONObject().apply {
                    put("id", "overlay_scan")
                    if (isGmail) {
                        put("subject", extractedSubject)
                        put("sender", extractedSender)
                        put("body", textToScan)
                        put("urls", extractedUrls)
                    } else {
                        put("text", textToScan)
                    }
                }

                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = 45000
                    readTimeout = 45000
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
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(applicationContext, "Server error: HTTP \${conn.responseCode}", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(applicationContext, "Scan Failed: \${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun displayMiniReport(score: Int, category: String, reasons: JSONArray) {
        val firstReason = if (reasons.length() > 0) reasons.getString(0) else "No threats detected"
        val alertBadge = when {
            score >= 70 -> "HIGH RISK"
            score >= 35 -> "SUSPICIOUS"
            else -> "SAFE"
        }

        Toast.makeText(
            this,
            "$alertBadge ($score/100)\\nCategory: $category\\nReason: $firstReason",
            Toast.LENGTH_LONG
        ).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        if (::bubbleView.isInitialized) windowManager.removeView(bubbleView)
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'FloatingBubbleService.kt'), bubbleKt, 'utf8');

      // File 3: ShieldBridgeModule.kt
      const moduleKt = `package com.aishield

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ShieldBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ShieldBridge"

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        try {
            val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(reactContext)
            } else {
                true
            }
            promise.resolve(canDraw)
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_OVERLAY", e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + reactContext.packageName)
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
        }
    }

    @ReactMethod
    fun startFloatingBubble() {
        val intent = Intent(reactContext, FloatingBubbleService::class.java)
        reactContext.startService(intent)
    }

    @ReactMethod
    fun stopFloatingBubble() {
        val intent = Intent(reactContext, FloatingBubbleService::class.java)
        reactContext.stopService(intent)
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'ShieldBridgeModule.kt'), moduleKt, 'utf8');

      // File 4: ShieldBridgePackage.kt
      const packageKt = `package com.aishield

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ShieldBridgePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ShieldBridgeModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'ShieldBridgePackage.kt'), packageKt, 'utf8');

      return config;
    },
  ]);

  // 4. Register Services & Permissions in AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application[0];

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const perms = [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.INTERNET',
    ];
    perms.forEach((perm) => {
      if (!manifest['uses-permission'].some((p) => p.$['android:name'] === perm)) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    });

    app.service = app.service || [];
    if (!app.service.some((s) => s.$['android:name'] === 'com.aishield.FloatingBubbleService')) {
      app.service.push({
        $: { 'android:name': 'com.aishield.FloatingBubbleService', 'android:exported': 'false' },
      });
    }

    if (!app.service.some((s) => s.$['android:name'] === 'com.aishield.ShieldAccessibilityService')) {
      app.service.push({
        $: {
          'android:name': 'com.aishield.ShieldAccessibilityService',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.accessibilityservice',
              'android:resource': '@xml/accessibility_service_config',
            },
          },
        ],
      });
    }

    return config;
  });

  return config;
};