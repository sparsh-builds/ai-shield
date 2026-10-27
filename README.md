# AI Shield / PhishGuard

Android app jo aapki **Gmail emails** (aur aage chalkar SMS) ko NLP model se scan karke list screen par hi
**SAFE / SUSPICIOUS / PHISHING** dikhati hai. Sath mein sender-domain (SPF/DKIM/DMARC, brand spoof, lookalike),
hidden links (text kuch, href kuch aur) aur URL rule-checks.

```
Android app (React Native)  --HTTP/JSON-->  FastAPI backend  -->  aapke trained .joblib models + rules
        |                                          ^
        +-- Gmail API (Google Sign-In) -----------+ (sirf email ka content backend ko jata hai)
```

## Folder structure

```
<repo>/
├── ml/          training scripts + datasets (aapka)   -> models yahin se banti hain
├── backend/     FastAPI server (models/ folder isi ke andar)
├── frontend/    React Native app (TypeScript)
└── README.md    ye file
```

> `ml/` repo mein na ho to bhi chalega, bas `backend/models/` mein 6 model files chahiye.
> `datasets/` aur `*.joblib` bade/sensitive ho sakte hain, unhe `.gitignore` mein rakho.

## 1. Clone

```bash
git clone <REPO_URL> ai-shield
cd ai-shield
```

## 2. Prerequisites

| Cheez | Version | Kiske liye |
|---|---|---|
| Python | **3.10** (3.11 bhi theek) | backend + training |
| Node.js | 18 ya 20 LTS | app |
| JDK | 17 | Android build |
| Android phone | USB debugging ON (ya emulator) | app chalane ke liye |
| Google account + Google Cloud project | free | Gmail login |
| Git | koi bhi | clone |

**Android Studio zaroori nahi hai** agar aap GitHub Actions se APK banwate ho (section 7). Local build chahiye
to sirf Android command-line SDK + JDK 17 kaafi hai.

## 3. Models (sabse zaroori)

Backend ko **6 files** chahiye `backend/models/` mein (naam bilkul aise):

```
email-v1.0_vectorizer.joblib
email-v1.0_model.joblib
email-v1.0_meta.json
sms-v1.0_vectorizer.joblib
sms-v1.0_model.joblib
sms-v1.0_meta.json
```

- Email: TF-IDF + Calibrated LinearSVC (2 class).
- SMS: TF-IDF + Logistic Regression (3 class: HAM / SPAM / SMISHING).
- **scikit-learn 1.6.1** se hi train aur load karo (joblib pickle version-sensitive hai).
- `.joblib` pickle hote hain, load par code chal sakta hai: **sirf apni banayi files** rakho.

### Option A: pehle se trained files hain
Bas 6 files `backend/models/` mein copy karo.

### Option B: khud train karo (`ml/` folder se)
```bash
cd ml
python -m venv venv && venv\Scripts\activate        # Linux/Mac: source venv/bin/activate
pip install -r requirements.txt                      # scikit-learn==1.6.1 wala set

# datasets rakho:
#   ml/datasets/email/raw/Phishing_Email.csv
#   ml/datasets/sms/raw/Dataset_5971.zip

python preprocess.py            # email: clean + train/val/test split
python preprocess_sms.py        # sms: same
python train_email_final.py     # -> ml/models/email-v1.0_*  (+ ml/reports/)
python train_sms_final.py       # -> ml/models/sms-v1.0_*

copy models\* ..\backend\models\                     # Linux/Mac: cp models/* ../backend/models/
```
(`ml/requirements.txt` mein agar `<<<<<<<` jaise git conflict markers dikhein to unhe hata kar sirf pinned
wala hissa rakho.)

### Models check karo
```bash
cd backend
python -m scripts.check_models
```
Ye versions aur kuch sample probabilities print karta hai. Models na hon to server phir bhi chalta hai
(`/health` = `DEGRADED`, email/sms `503`, `/predict/url` kaam karta hai).

## 4. Backend chalana

```bash
cd backend
python -m venv venv
venv\Scripts\activate                                 # Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
python -m scripts.check_models
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
- `--host 0.0.0.0` zaroori hai, nahi to phone connect nahi hoga.
- Docs: http://127.0.0.1:8000/docs, Health: http://127.0.0.1:8000/health
- Tests: `pip install -r requirements-dev.txt && pytest` (stub models par, 49 tests).

### Settings (environment variables)
Naam `AISHIELD_<NAAM>` (bina prefix bhi chalta hai). Sab `backend/app/config.py` mein.

| Variable | Default | Matlab |
|---|---|---|
| `AISHIELD_MODELS_DIR` | `backend/models` | model files ka folder |
| `AISHIELD_API_KEY` | (khaali) | set karo to har `/predict/*` par `X-API-Key` header chahiye |
| `AISHIELD_W_ML / W_URL / W_SENDER` | 0.50 / 0.30 / 0.20 | fusion weights |
| `AISHIELD_HIGH_CUTOFF / MEDIUM_CUTOFF` | 70 / 35 | PHISHING / SUSPICIOUS limit |
| `AISHIELD_MAX_BATCH` | 50 | ek batch mein max emails |
| `AISHIELD_CORS_ORIGINS` | `*` | allowed origins |

## 5. Frontend (app) setup

### 5.1 Google Cloud (Gmail login ke liye, ek baar)
1. https://console.cloud.google.com par naya project banao.
2. **APIs & Services -> Library -> Gmail API -> Enable**.
3. **OAuth consent screen**: External, app ka naam, apna email; scope `.../auth/gmail.readonly` add karo;
   **Test users** mein apna Gmail add karo (testing mode mein 100 users tak).
4. **Credentials -> Create credentials -> OAuth client ID**:
   - **Web application** -> iska Client ID app ke `GOOGLE_WEB_CLIENT_ID` mein jayega.
   - **Android** -> package name (`android/app/build.gradle` ka `applicationId`) + **SHA-1** fingerprint.
     Debug SHA-1: `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android`
5. Gmail `readonly` ek *restricted scope* hai: public Play Store release ke liye Google verification chahiye;
   college/demo ke liye testing mode kaafi hai.

### 5.2 Config
`frontend/src/config.ts` kholo:

```ts
export const API_URL = 'http://10.0.2.2:8000';   // emulator. Asli phone: PC ka LAN IP, jaise http://192.168.1.10:8000
export const API_KEY = '';                        // backend par AISHIELD_API_KEY set ki ho to wahi
export const GOOGLE_WEB_CLIENT_ID = 'xxxx.apps.googleusercontent.com';
```

Phone ke liye URL options:
- Same Wi-Fi: PC ka IP (`ipconfig` / `ifconfig`) + Windows firewall mein port 8000 allow.
- Alag network: `ngrok http 8000` ya `cloudflared tunnel --url http://localhost:8000`, jo `https` URL mile wo `API_URL` mein.

### 5.3 Install aur run
```bash
cd frontend
npm install
npm start                    # Metro bundler
npm run android              # dusre terminal mein (phone/emulator connected ho)
```

## 6. Kaise kaam karta hai (short)

1. App Google Sign-In se `gmail.readonly` token leti hai, Inbox ke emails Gmail API se padhti hai
   (body, From, Reply-To, SPF/DKIM/DMARC `Authentication-Results`, links ke text/href).
2. 20-20 ki chunk mein `POST /predict/email/batch` bhejti hai, natije cache (AsyncStorage) mein rakhti hai.
3. Backend: `score = ml*50 + max(url, hiddenLinks)*30 + sender*20`. Link ya sender bahut kharab ho aur model
   >= 0.25 de to kam se kam 82; CRITICAL link/brand-spoof sender ho to kam se kam 40 (kabhi SAFE nahi).
   `>=70` PHISHING, `>=35` SUSPICIOUS, baaki SAFE.
4. Inbox list mein har email par badge; detail screen par reasons, hidden links aur recommended action.

### API (sab POST, JSON)
| Endpoint | Body |
|---|---|
| `/predict/email` | `{id, subject, sender, replyTo, auth{spf,dkim,dmarc}, body, urls[], links[{href,text,hasImage}]}` |
| `/predict/email/batch` | `{emails: [ ...upar jaisa... ]}` (order wahi, kharab email = `UNKNOWN`) |
| `/predict/sms` | `{id?, text}` |
| `/predict/url` | `{id?, url}` |
| `GET /health` | status + model versions |

Response: `riskScore, riskLevel, category, mlProbability, reasons[], recommendedAction, sortedThreatUrls[],
hiddenLinks[{href,text,hasImage,reason,severity}], senderDomain, signals, modelVersion`.
Poora detail `backend/README.md` mein.

## 7. APK banana (Android Studio ke bina)

`.github/workflows/` mein GitHub Actions workflow lagao jo JDK 17 + `./gradlew assembleRelease` chalaye aur
APK artifact upload kare; phone par APK sideload karo. (Workflow abhi is repo mein add hona baaki hai.)
Local alternative: Android command-line tools + `cd frontend/android && ./gradlew assembleDebug`.

## 8. Troubleshooting

| Problem | Hal |
|---|---|
| App "Network request failed" | `API_URL` galat; phone par `http://<IP>:8000/health` browser mein kholo. Server `--host 0.0.0.0` se chala? |
| Android par http block | dev ke liye `usesCleartextTraffic` ON hai; release mein https tunnel/host use karo |
| `/health` = DEGRADED | `models/` mein 6 files nahi mili ya `meta.json` ka `model_version` galat |
| `InconsistentVersionWarning` / load error | scikit-learn 1.6.1 install karo |
| `401` | backend par `AISHIELD_API_KEY` hai, app ke `API_KEY` mein wahi daalo |
| Google login `DEVELOPER_ERROR` | SHA-1 / package name galat, ya Web client ID ki jagah Android ID daal di |
| Login ke baad "access blocked" | OAuth consent screen mein apna Gmail **Test user** add karo |
| `numpy==1.26.2` install fail | Python 3.10/3.11 use karo (3.13 ke liye wheel nahi) |

## 9. Seemayein

- Rules sirf structure dekhte hain: URL-reputation database, domain age, WHOIS nahi. Image ke andar text (OCR) / QR nahi.
- Brand list chhoti hai (`backend/app/analysis/domains.py` mein badhao).
- Email content aapke server par jata hai (log nahi hota): public deploy par https + API key + privacy policy zaroori.
- SMS auto-read (native module) abhi baaki hai. Play Store par `READ_SMS` sirf default SMS app ko milta hai,
  isliye SMS auto-scan ke liye APK sideload hi realistic hai.
- Thresholds asli emails par tune karo: `python -m scripts.score_eml path/to/eml_folder`.