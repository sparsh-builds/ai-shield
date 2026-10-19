// Backend ka URL.
// Android emulator ke liye: http://10.0.2.2:8000
// Real phone (same WiFi) ke liye: http://<PC-ka-IP>:8000
// Deploy hone ke baad: https://your-domain.com
export const API_URL = 'http://10.0.2.2:8000';

// Google Cloud Console > Credentials > "Web application" OAuth client ID
export const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const INBOX_PAGE_SIZE = 20;
export const REQUEST_TIMEOUT_MS = 20000;
