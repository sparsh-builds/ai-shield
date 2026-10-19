import { API_URL, REQUEST_TIMEOUT_MS } from './config';
import { ScanResult } from './utils/types';

async function post(path: string, body: object): Promise<ScanResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Server error (${res.status})`);
    }

    const data = await res.json();
    return {
      verdict: data.verdict,
      confidence: Number(data.confidence ?? 0),
      reasons: Array.isArray(data.reasons) ? data.reasons : [],
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Server ne time par jawab nahi diya. Backend chal raha hai?');
    }
    throw new Error(e?.message ?? 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export const scanEmail = (from: string, subject: string, body: string) =>
  post('/predict/email', { from, subject, body });

export const scanSms = (text: string) => post('/predict/sms', { text });

export const scanUrl = (url: string) => post('/predict/url', { url });

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
