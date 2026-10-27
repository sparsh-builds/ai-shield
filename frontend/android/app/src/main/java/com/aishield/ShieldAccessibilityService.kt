package com.aishield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class ShieldAccessibilityService : AccessibilityService() {

    companion object {
        var instance: ShieldAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Realtime window changes track karne ke liye
    }

    override fun onInterrupt() {
        instance = null
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    // Is function ko Floating Bubble ke click par call karenge
    fun captureCurrentAppText(): ScreenData {
        val rootNode = rootInActiveWindow ?: return ScreenData("", "", "")
        val allStrings = mutableListOf<String>()

        traverseNode(rootNode, allStrings)

        val fullJoined = allStrings.joinToString(" ")
        val packageName = rootNode.packageName?.toString() ?: ""

        return ScreenData(
            packageName = packageName,
            rawText = fullJoined,
            extractedList = allStrings
        )
    }

    private fun traverseNode(node: AccessibilityNodeInfo?, list: MutableList<String>) {
        if (node == null) return

        if (!node.text.isNullOrBlank()) {
            list.add(node.text.toString().trim())
        } else if (!node.contentDescription.isNullOrBlank()) {
            list.add(node.contentDescription.toString().trim())
        }

        for (i in 0 until node.childCount) {
            traverseNode(node.getChild(i), list)
        }
    }
}

data class ScreenData(
    val packageName: String,
    val rawText: String,
    val extractedList: List<String>
)