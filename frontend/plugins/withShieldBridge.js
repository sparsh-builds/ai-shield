const { withMainApplication, withAndroidManifest } = require('@expo/config-plugins');

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

  // 2. Register Services & Permissions in AndroidManifest.xml
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