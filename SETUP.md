# 🛠️ AI Shield — Complete Setup, Build & Testing Guide

Follow this guide in exact order to run the ML backend, configure the Android frontend, generate the APK, and perform live device testing.

---

## 1️⃣ Prerequisites

| Requirement | Recommended Version | Notes |
| :--- | :--- | :--- |
| **Python** | `3.10` or `3.11` | Avoid Python 3.13 due to `scikit-learn==1.6.1` wheel compatibility |
| **Node.js** | `18 LTS` or `20 LTS` | Required for React Native CLI & JS bundling |
| **JDK (Java)** | `17` | Required for Android Gradle builds |
| **Git** | Latest | Version control & GitHub Actions APK triggers |

---

## 2️⃣ Clone Repository

```bash
git clone [https://github.com/sparsh-builds/ai-shield.git](https://github.com/sparsh-builds/ai-shield.git)
cd ai-shield
```

---

## 3️⃣ Start Backend & ML Inference Server (Terminal 1)

```bash
cd ml
python -m venv venv

# Activate virtual environment (Windows):
venv\Scripts\activate
# Activate virtual environment (Mac / Linux):
source venv/bin/activate

pip install -r requirements.txt
```

> **Model Verification:** Ensure `ml/models/` contains all 6 model artifacts (`email-v1.0_vectorizer.joblib`, `email-v1.0_model.joblib`, `email-v1.0_meta.json`, `sms-v1.0_vectorizer.joblib`, `sms-v1.0_model.joblib`, `sms-v1.0_meta.json`). If missing, run `python train_email_final.py` and `python train_sms_final.py`.

**Launch FastAPI Server:**
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
* **Verify Local Health:** Open `http://127.0.0.1:8000/health` $\rightarrow$ Must return `{"status": "OPERATIONAL", ...}`.
* **API Documentation:** Open `http://127.0.0.1:8000/docs`.

---

## 4️⃣ Network & Backend IP Configuration (Terminal 2)

Connect your **Android phone and PC to the same Wi-Fi network or Mobile Hotspot**, then find your PC's local IPv4 address:

```bash
# Windows:
ipconfig
# Mac / Linux:
ifconfig
```
*(Copy your **IPv4 Address**, e.g., `192.168.43.105`).*

**Update this IP address in 2 files:**

1. **`frontend/src/config.ts`**:
   ```ts
   export const API_URL = '[http://192.168.](http://192.168.)X.X:8000'; // Replace with your PC's IPv4
   ```

2. **`frontend/android/app/src/main/java/com/aishield/FloatingBubbleService.kt`**:
   ```kotlin
   private val BACKEND_URL = "[http://192.168.](http://192.168.)X.X:8000" // Replace with your PC's IPv4
   ```

> **Phone Reachability Check:** Open Chrome on your phone and visit `http://192.168.X.X:8000/health`. Confirm `OPERATIONAL` loads before building the APK.

---

## 5️⃣ Frontend Dependencies & Offline JS Bundle (Terminal 2)

```bash
cd frontend
npm install
mkdir -p android/app/src/main/assets
npx react-native bundle --platform android --dev false --entry-file index.ts --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res
```

---

## 6️⃣ Build & Install Android APK (Choose Any 1 Method)

### Method A: Cloud APK Build via GitHub Actions (No Android Studio Needed — Recommended)
`.github/workflows/build-apk.yml` is already configured in this repo. Push your IP changes to trigger a cloud build:
```bash
git add .
git commit -m "configure backend IP and trigger APK build"
git push origin main
```
1. Go to `https://github.com/sparsh-builds/ai-shield/actions`.
2. Open the latest completed workflow run and download **`ai-shield-apk`** under **Artifacts**.
3. Unzip the file, transfer `app-debug.apk` to your Android device, and install it.

### Method B: Local Build via Android Studio
1. Open **Android Studio** $\rightarrow$ **File $\rightarrow$ Open** $\rightarrow$ Select `ai-shield/frontend/android`.
2. Wait for Gradle sync to finish.
3. Click **Build $\rightarrow$ Build Bundle(s) / APK(s) $\rightarrow$ Build APK(s)**.
4. Locate the APK at: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

### Method C: Direct USB Debugging (CLI)
1. Enable **Developer Options** and **USB Debugging** on your Android device.
2. Connect via USB and run:
   ```bash
   adb devices
   adb reverse tcp:8000 tcp:8000
   cd frontend
   npm run android
   ```

---

## 7️⃣ Live Device Testing & Post-Test Reset

### Live Testing Steps
1. Open **AI Shield** on your phone.
2. Tap **ENABLE ACCESSIBILITY SERVICE** $\rightarrow$ Locate **AI Shield** in Android Accessibility Settings and turn it **ON**.
3. Tap **ENABLE FLOATING BUBBLE** $\rightarrow$ Grant **Allow display over other apps** permission.
4. Minimize AI Shield (a cyan floating bubble will remain on screen).
5. Open **Gmail** or **Messages (SMS)**, view any suspicious message, and **tap the Floating Bubble**:
   * **Score $\ge 70$ (`HIGH`):** 🔴 **PHISHING / SMISHING** alert with specific flagged indicators.
   * **Score $35 - 69$ (`MEDIUM`):** 🟡 **SUSPICIOUS** warning.
   * **Score $< 35$ (`LOW`):** 🟢 **SAFE**.

### Resetting Phone After Testing
1. **Uninstall AI Shield** normally from your phone (automatically revokes Accessibility and Overlay permissions).
2. If USB debugging was enabled, go to **Settings $\rightarrow$ Developer Options** and toggle it **OFF**.
3. Press `Ctrl + C` in Terminal 1 to stop the FastAPI server.