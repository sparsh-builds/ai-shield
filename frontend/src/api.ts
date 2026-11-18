import { Platform } from 'react-native';

// Production Render Cloud Backend URL
const BASE_URL = 'https://ai-shield-backend-6o9v.onrender.com';

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