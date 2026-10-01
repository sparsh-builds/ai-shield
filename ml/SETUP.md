# AI Shield - Gmail module (React Native) - Setup

## 1. Google Cloud (about 30-40 min)
1. console.cloud.google.com -> create project "AI Shield".
2. APIs & Services -> Library -> enable **Gmail API**.
3. OAuth consent screen: User type **External**, keep status **Testing**.
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - **Test users**: add all 4 team members' Gmail IDs (+ guide / evaluator IDs). Only these can log in.
4. Credentials -> Create OAuth client ID:
   - Type **Web application** -> copy its Client ID (this is WEB_CLIENT_ID in src/config.ts).
   - Type **Android** -> package name (e.g. com.aishield) + SHA-1 of your debug keystore.
     Each developer's laptop has a different debug SHA-1, so create one Android client per person (or share one debug.keystore).

Get SHA-1:
    cd android && ./gradlew signingReport        (use the "debug" variant SHA1)
    or: keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

## 2. Create the app
    npx @react-native-community/cli@latest init AIShield
    cd AIShield
    npm i @react-native-google-signin/google-signin @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context buffer

Copy `App.tsx` (replace the existing one) and the `src/` folder into the project root.
Set `WEB_CLIENT_ID` in `src/config.ts`.

Run (emulator MUST be a "Google Play" image, or use a real phone):
    npx react-native run-android

## 3. Backend switch (later)
`USE_MOCK_ANALYSIS = true` uses simple placeholder rules so the whole flow works today.
When Vanshdeep's API is ready: set it to `false` and set `API_BASE_URL`.
Expected response JSON: riskScore, riskLevel, category, scamProbability, reasons[], recommendedAction, modelVersion.

## Common errors
- DEVELOPER_ERROR / code 10 -> package name, SHA-1 or Web Client ID mismatch.
- "Access blocked / not verified" -> your Gmail is not added as a Test user.
- Gmail 403 -> Gmail API not enabled, or the Gmail permission was not granted at login.
- Login stops working after ~7 days -> normal for apps in Testing mode; sign in again.
- Network request failed -> wrong API_BASE_URL (emulator: 10.0.2.2, phone: laptop Wi-Fi IP).
