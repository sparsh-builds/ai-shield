export const colors = {
  bg: '#0F172A',
  header: '#111827',
  card: '#1E293B',
  border: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  primary: '#3B82F6',

  safe: '#22C55E',
  suspicious: '#F59E0B',
  phishing: '#EF4444',
  spam: '#F97316',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
};

export function verdictColor(verdict: string): string {
  switch (verdict) {
    case 'safe':
      return colors.safe;
    case 'suspicious':
      return colors.suspicious;
    case 'spam':
      return colors.spam;
    case 'phishing':
      return colors.phishing;
    default:
      return colors.textMuted;
  }
}

export function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'safe':
      return 'Safe';
    case 'suspicious':
      return 'Suspicious';
    case 'spam':
      return 'Spam';
    case 'phishing':
      return 'Phishing';
    default:
      return 'Unknown';
  }
}
