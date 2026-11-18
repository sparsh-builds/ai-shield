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
        'PackageList(this).packages.apply {\n              add(com.aishield.ShieldBridgePackage())'
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

  // 3. Auto-generate res/xml/accessibility_service_config.xml
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmlFile = path.join(xmlDir, 'accessibility_service_config.xml');

      if (!fs.existsSync(xmlFile)) {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/accessibility_service_description"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="100" />
`;
        fs.writeFileSync(xmlFile, xmlContent, 'utf8');
      }
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