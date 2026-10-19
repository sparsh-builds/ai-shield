export type Verdict = 'safe' | 'suspicious' | 'phishing' | 'spam';

export interface ScanResult {
  verdict: Verdict;
  confidence: number; // 0 se 1
  reasons: string[];
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  result?: ScanResult;
}

export type ScanKind = 'Email' | 'SMS' | 'URL';

export type RootStackParamList = {
  Login: undefined;
  Inbox: undefined;
  EmailDetail: { email: Email };
  Result: { result: ScanResult; kind: ScanKind; preview: string };
  Scan: undefined;
};
