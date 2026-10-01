export type EmailSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export type EmailFull = EmailSummary & {
  body: string;
  urls: string[];
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type AnalysisResult = {
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  category: string; // e.g. PHISHING / SUSPICIOUS / SAFE
  scamProbability: number; // 0-1
  reasons: string[];
  recommendedAction: string;
  modelVersion?: string;
  mock?: boolean; // true when produced by the local placeholder
};

export type RootStackParamList = {
  Login: undefined;
  Inbox: undefined;
  EmailDetail: {id: string};
  Result: {email: EmailFull; result: AnalysisResult};
};
