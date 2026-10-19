# PhishGuard Frontend (React Native + TypeScript)

Email, SMS aur URL ko scan karke **Safe / Suspicious / Spam / Phishing** batane wali Android app ka frontend.

## Folder structure

```
frontend/
├── App.tsx
├── package.json
├── README.md
└── src/
    ├── api.ts            # backend calls
    ├── auth.ts           # Google sign-in
    ├── config.ts         # API URL, Google client ID
    ├── gmail.ts          # Gmail API se emails fetch + parse
    ├── theme.ts          # colors
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── InboxScreen.tsx
    │   ├── EmailDetailScreen.tsx
    │   ├── ResultScreen.tsx
    │   └── ScanScreen.tsx      # SMS / URL paste karke scan
    └── utils/
        ├── sound.ts
        └── types.ts
```

## Setup

1. `npm install`  // to install package fies and node modules 
2. `src/config.ts` mein `API_URL` aur `GOOGLE_WEB_CLIENT_ID` badlo.
3. Google Cloud Console mein:
   - Gmail API enable karo
   - OAuth consent screen banao, scope `gmail.readonly` add karo
   - Credentials mein **Web client ID** (config mein dalo) aur **Android client ID** (package name + SHA-1) banao
4. (Optional) alert awaaz ke liye `android/app/src/main/res/raw/alert.mp3` rakho. Na ho to sirf vibration hoga.
5. `npx react-native run-android`

## Backend API contract

Frontend yeh endpoints expect karta hai. Sab `POST`, JSON body, aur yeh response:

```json
{ "verdict": "safe | suspicious | spam | phishing", "confidence": 0.93, "reasons": ["Urgent language", "Suspicious link"] }
```

| Endpoint | Body |
|---|---|
| `/predict/email` | `{ "from": "", "subject": "", "body": "" }` |
| `/predict/sms` | `{ "text": "" }` |
| `/predict/url` | `{ "url": "" }` |
| `GET /health` | optional |

## Notes

- Android emulator se PC ka localhost: `http://10.0.2.2:8000`
- Real phone: PC ka local IP use karo (same WiFi). Plain `http` ke liye `AndroidManifest.xml` mein `android:usesCleartextTraffic="true"` chahiye hoga (sirf development ke liye).
- SMS auto-read nahi kiya gaya (Google Play ki `READ_SMS` policy strict hai). Isliye SMS ko paste karke scan karte hain.
