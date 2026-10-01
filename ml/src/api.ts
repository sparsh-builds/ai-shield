import {API_BASE_URL, USE_MOCK_ANALYSIS} from './config';
import {AnalysisResult, EmailFull, RiskLevel} from './types';

const ACTIONS: Record<RiskLevel, string> = {
  HIGH: 'Do not open links or attachments. Do not reply. Report as phishing and delete.',
  MEDIUM: 'Be careful. Verify the sender through the official website or app before clicking anything.',
  LOW: 'No strong warning signs found, but stay alert for unexpected requests.',
};

// ---------- Placeholder scoring (demo only) ----------
// Replace by the real backend (ML + URL analysis + Risk Engine) via USE_MOCK_ANALYSIS=false.
function mockAnalyze(email: EmailFull): AnalysisResult {
  const text = `${email.subject} ${email.body}`.toLowerCase();
  const reasons: string[] = [];
  let score = 10;

  const urgent = ['urgent', 'immediately', 'verify your', 'suspended', 'confirm your',
    'password', 'account will be', 'limited time', 'act now', 'click here', 'security alert'];
  const hits = urgent.filter(w => text.includes(w));
  if (hits.length) {
    score += Math.min(40, hits.length * 12);
    reasons.push('Urgent or pressuring language');
  }
  if (email.urls.length) {
    score += 10;
    if (email.urls.some(u => /https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(u))) {
      score += 30;
      reasons.push('Link uses an IP address');
    }
    if (email.urls.some(u => /(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly)/i.test(u))) {
      score += 20;
      reasons.push('URL shortener detected');
    }
    if (email.urls.some(u => (u.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].match(/\./g) ?? []).length >= 4)) {
      score += 15;
      reasons.push('Unusual domain with many subdomains');
    }
  }
  score = Math.max(0, Math.min(100, score));
  const riskLevel: RiskLevel = score >= 70 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';
  if (!reasons.length) reasons.push('No strong warning signs found');
  return {
    riskScore: score,
    riskLevel,
    category: riskLevel === 'HIGH' ? 'PHISHING' : riskLevel === 'MEDIUM' ? 'SUSPICIOUS' : 'SAFE',
    scamProbability: score / 100,
    reasons,
    recommendedAction: ACTIONS[riskLevel],
    modelVersion: 'mock-heuristic',
    mock: true,
  };
}

export async function analyzeEmail(email: EmailFull): Promise<AnalysisResult> {
  if (USE_MOCK_ANALYSIS) return mockAnalyze(email);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${API_BASE_URL}/api/analyze/email`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: ctrl.signal,
      body: JSON.stringify({
        emailId: email.id,
        subject: email.subject,
        sender: email.from,
        body: email.body.slice(0, 20000),
        urls: email.urls,
      }),
    });
    if (!r.ok) throw new Error(`Backend error ${r.status}`);
    return (await r.json()) as AnalysisResult;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Backend timed out. Is the server running?');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendFeedback(emailId: string, correct: boolean): Promise<void> {
  if (USE_MOCK_ANALYSIS) return;
  await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({emailId, correct}),
  });
}
