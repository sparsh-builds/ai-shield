// ---- AI Shield config ----
// Web client ID from Google Cloud Console (OAuth client of type "Web application")
export const WEB_CLIENT_ID = '478021555151-shn1mi2m7qtfgmm2snkrek6fbjdsf48d.apps.googleusercontent.com';

// Backend base URL.
//  - Android emulator  -> http://10.0.2.2:8080  (10.0.2.2 = your laptop)
//  - Real phone        -> http://<laptop-wifi-ip>:8080  (same Wi-Fi)
export const API_BASE_URL = 'http://10.0.2.2:8080';

// true  = local placeholder scoring (demo only, NOT the real ML model)
// false = call the Spring Boot backend
export const USE_MOCK_ANALYSIS = true;
