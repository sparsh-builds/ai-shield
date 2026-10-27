import { Platform } from 'react-native';

// Laptop's local network IP jo Expo detect kar raha hai
const BASE_URL = 'http://10.5.52.59:8000';

export interface ThreatUrlReport {
  url: string;
  hostname: string;
  riskScore: number;
  threatLevel: 'CRITICAL' | 'WARNING' | 'CLEAN';
  indicators: string[];
}

export interface SecurityAnalysisResult {
  id: string;
  riskScore: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'PHISHING' | 'SUSPICIOUS' | 'SAFE';
  mlProbability: number;
  reasons: string[];
  sortedThreatUrls: ThreatUrlReport[];
  urlCount: number;
  modelVersion: string;
}

export async function scanEmail(data: {
  id: string;
  subject: string;
  sender: string;
  body: string;
  urls?: string[];
}): Promise<SecurityAnalysisResult> {
  const res = await fetch(`${BASE_URL}/predict/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Scan rejected with status ${res.status}`);
  }
  return res.json();
}