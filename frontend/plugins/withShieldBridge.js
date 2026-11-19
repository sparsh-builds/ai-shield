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

      // File 1: ShieldAccessibilityService.kt
      const accessibilityKt = `package com.aishield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

data class ScreenContent(val packageName: String, val rawText: String)

class ShieldAccessibilityService : AccessibilityService() {

    companion object {
        var instance: ShieldAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Passive mode: reads only when user taps the floating bubble
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) instance = null
    }

    fun captureCurrentAppText(): ScreenContent {
        val rootNode = rootInActiveWindow ?: return ScreenContent("", "")
        val pkg = rootNode.packageName?.toString() ?: ""
        val sb = StringBuilder()
        traverseNode(rootNode, sb)
        return ScreenContent(pkg, sb.toString().trim())
    }

    private fun traverseNode(node: AccessibilityNodeInfo?, sb: StringBuilder) {
        if (node == null) return
        node.text?.let {
            val txt = it.toString().trim()
            if (txt.isNotEmpty()) sb.append(txt).append("\\n")
        }
        for (i in 0 until node.childCount) {
            traverseNode(node.getChild(i), sb)
        }
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'ShieldAccessibilityService.kt'), accessibilityKt, 'utf8');

      // File 2: FloatingBubbleService.kt (Connected to live Render URL)
      const bubbleKt = `package com.aishield

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

    private val BACKEND_URL = "https://ai-shield-backend-6o9v.onrender.com"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

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

        val button = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_dialog_info)
            setBackgroundColor(0xFF05D9E8.toInt())
            setPadding(24, 24, 24, 24)
        }
        bubbleView = button

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

        serviceScope.launch(Dispatchers.IO) {
            try {
                val isGmail = screenData.packageName.contains("gm")
                val endpoint = if (isGmail) "$BACKEND_URL/predict/email" else "$BACKEND_URL/predict/sms"

                val payload = JSONObject().apply {
                    put("id", "overlay_scan")
                    if (isGmail) {
                        put("subject", "Scraped Screen Content")
                        put("sender", "")
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

    private fun displayMiniReport(score: Int, category: String, reasons: org.json.JSONArray) {
        val firstReason = if (reasons.length() > 0) reasons.getString(0) else "Clean"
        val alertColor = when {
            score >= 70 -> "🔴 HIGH RISK"
            score >= 35 -> "🟡 SUSPICIOUS"
            else -> "🟢 SAFE"
        }

        Toast.makeText(
            this,
            "$alertColor ($score/100)\\nCategory: $category\\nReason: $firstReason",
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
    fun openAccessibilitySettings(promise: Promise? = null) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_ACCESSIBILITY", e)
        }
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise? = null) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + reactContext.packageName)
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
            } else {
                startBubbleService(null)
            }
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_OVERLAY", e)
        }
    }

    @ReactMethod
    fun startBubbleService(promise: Promise? = null) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                openOverlaySettings(promise)
                return
            }
            val intent = Intent(reactContext, FloatingBubbleService::class.java)
            reactContext.startService(intent)
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_BUBBLE", e)
        }
    }

    @ReactMethod
    fun stopBubbleService(promise: Promise? = null) {
        try {
            val intent = Intent(reactContext, FloatingBubbleService::class.java)
            reactContext.stopService(intent)
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_STOP_BUBBLE", e)
        }
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