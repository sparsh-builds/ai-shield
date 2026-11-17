# 🛡️ AI Shield (PhishGuard) — Real-Time Android Phishing & Smishing Defense

**AI Shield** is a real-time mobile threat detection system that protects Android users from **Phishing (Emails)** and **Smishing (SMS)** attacks directly on their screen. Using an Android **Accessibility Service** paired with a system-wide **Floating Overlay Bubble**, users can scan suspicious messages with a single tap—without copying text or switching apps.

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    ANDROID APP (React Native + Kotlin)          │
│  ┌─────────────────────────┐    ┌────────────────────────────┐  │
│  │ ShieldAccessibilitySvc  │───▶│   FloatingBubbleService    │  │
│  │ (Live Screen Scraper)   │    │ (1-Tap Overlay & Alert UI) │  │
│  └─────────────────────────┘    └─────────────┬──────────────┘  │
└───────────────────────────────────────────────┼─────────────────┘
                                                │ HTTP / JSON (REST)
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FASTAPI ML ENGINE (Python)                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Sender Spoofing  │  │  URL Heuristics  │  │ TF-IDF + SVM/ │  │
│  │  Domain Check    │  │ (IP, TLD, Short) │  │ LogReg Models │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           └─────────────────────┼────────────────────┘          │
│                                 ▼                               │
│                  Multimodal Risk Score (0 - 100)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 Repository Structure

```text
ai-shield/
├── .github/workflows/       # Automated CI/CD cloud APK build (build-apk.yml)
├── ml/                      # Active ML inference server, models & training scripts
│   ├── models/              # Serialized .joblib vectorizers, classifiers & meta.json
│   ├── main.py              # Active FastAPI server & multimodal risk fusion engine
│   ├── preprocess.py        # Text normalization & feature cleaning pipeline
│   └── requirements.txt     # Pinned Python dependencies (scikit-learn==1.6.1)
├── backend/                 # Modular FastAPI structure & Gmail MIME parser
│   └── app/parser.py        # Base64 & HTML MIME-part extractor
├── frontend/                # React Native (TypeScript) + Custom Kotlin Modules
│   ├── App.tsx              # Main Dashboard & Permission Control UI
│   ├── src/                 # API client & backend IP configuration
│   └── android/app/src/main/
│       ├── AndroidManifest.xml
│       ├── res/xml/accessibility_service_config.xml
│       └── java/com/aishield/
│           ├── MainApplication.kt
│           ├── ShieldPackage.kt
│           ├── ShieldBridgeModule.kt
│           ├── ShieldAccessibilityService.kt
│           └── FloatingBubbleService.kt
├── README.md                # Project Architecture & Overview
└── SETUP.md                 # Step-by-Step Installation, Build & Testing Guide
```

---

## 🧠 Multimodal Risk Scoring Engine

The FastAPI backend (`ml/main.py`) evaluates every scanned message across three independent threat signals:

$$\text{Final Score} = (\text{ML\_Probability} \times 50) + (\text{Worst\_URL\_Score} \times 30) + (\text{Sender\_Penalty} \times 20)$$

1. **NLP Classifier (`50%` weight):** TF-IDF vectorization paired with trained Linear/SVM classifiers (`email-v1.0` & `sms-v1.0`) trained on phishing and spam corpora.
2. **URL & Domain Heuristics (`30%` weight):** Flags raw IP URLs, suspicious TLDs (`.xyz`, `.top`, `.tk`, `.click`), URL shorteners (`bit.ly`, `tinyurl`), and credential-harvesting paths.
3. **Sender Spoofing Check (`20%` weight):** Cross-checks brand mentions (SBI, HDFC, ICICI, Paytm, Amazon, etc.) against official sender domains.
   * **Hard Override Rule:** If sender spoofing or a critical malicious URL is detected alongside an ML probability $\ge 0.25$, the final risk score automatically escalates to $\ge 82$ (**HIGH RISK**).

---

## ⚡ Quick Start

For complete step-by-step installation, APK generation, and mobile testing instructions, see **[SETUP.md](./SETUP.md)**.

---

## 📋 Team Roadmap & Pending Enhancements

- [ ] **Custom Floating Alert Card:** Upgrade `FloatingBubbleService.kt` from native Android `Toast` alerts to an interactive floating XML card overlay with **Dismiss** and **View Full Breakdown** actions.
- [ ] **Gmail OAuth Full Inbox Sync:** Connect `frontend/src/api.ts` with Google Sign-In (`gmail.readonly` scope) for automated batch inbox scanning.
- [ ] **Expanded Brand Dictionary:** Add additional Indian banking, UPI, and government portal domains to `PROTECTED_BRANDS` in `ml/main.py`.
- [ ] **Cloud Backend Deployment:** Host the `ml/` FastAPI server on Render, Railway, or AWS EC2 so the mobile app works over cellular data without needing a local Wi-Fi IP.