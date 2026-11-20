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

$$\text{Score} = (\text{ML\_Probability} \times 45) + (\text{Worst\_URL\_Score} \times 35) + (\text{Sender\_Penalty} \times 20) + (\text{Intent\_Rule\_Boost} \times 40)$$

1. **NLP Classifier (`45` points):** TF-IDF vectorization paired with trained Linear/SVM classifiers (`email-v1.0` & `sms-v1.0`) trained on phishing and spam corpora.
2. **URL & Domain Heuristics (`35` points):** Flags raw IP URLs, suspicious TLDs (`.xyz`, `.top`, `.tk`, `.click`), URL shorteners (`bit.ly`, `tinyurl`), and credential-harvesting paths.
3. **Sender Spoofing Check (`20` points):** Cross-checks brand mentions (SBI, HDFC, ICICI, Paytm, Amazon, etc.) against official sender domains.
4. **Intent Rules (`40` points, capped at `0.60`):** Phrase rules for KYC/account pressure, OTP or credential requests, prize lures and APK-install prompts. Each reason names the phrase that matched.
   * **Hard Override Rules:** A spoofed sender or a critical URL together with an ML probability or rule boost $\ge 0.25$ raises the score to at least $84$ (**HIGH RISK**). A high-risk URL with a rule boost $\ge 0.25$ raises it to at least $72$.
   * **Event Cap:** Event or newsletter wording with no URL, sender or rule signals is capped at $24$.
   * **Tiers:** `HIGH` $\ge 70$ (PHISHING), `MEDIUM` $35$–$69$ (SUSPICIOUS), `LOW` $< 35$ (SAFE).
   * **Reasons:** Each result returns up to 4 message-specific reasons. SAFE results list what was checked and passed (sender domain, links, absence of OTP/KYC pressure). Risky results list the signals that fired, with the link or phrase quoted.

## 🔐 Permissions

- **Display over other apps** (`SYSTEM_ALERT_WINDOW`): needed for the floating bubble.
- **Accessibility Service:** reads on-screen text only in Gmail, Google Messages and Samsung Messages (restricted with `packageNames` in `accessibility_service_config.xml`).
- **Internet** and **Vibrate:** normal permissions, granted at install.

The app also supports manual copy-paste scanning, which needs none of the accessibility or overlay permissions.

---

## ⚡ Quick Start

For complete step-by-step installation, APK generation, and mobile testing instructions, see **[SETUP.md](./SETUP.md)**.

---

## 📋 Team Roadmap & Pending Enhancements

- [ ] **Custom Floating Alert Card:** Upgrade `FloatingBubbleService.kt` from native Android `Toast` alerts to an interactive floating XML card overlay with **Dismiss** and **View Full Breakdown** actions.
- [ ] **Gmail OAuth Full Inbox Sync:** Connect `frontend/src/api.ts` with Google Sign-In (`gmail.readonly` scope) for automated batch inbox scanning.
- [ ] **Expanded Brand Dictionary:** Add additional Indian banking, UPI, and government portal domains to `PROTECTED_BRANDS` in `ml/main.py`.
- [ ] **Cloud Backend Deployment:** Host the `ml/` FastAPI server on Render, Railway, or AWS EC2 so the mobile app works over cellular data without needing a local Wi-Fi IP.