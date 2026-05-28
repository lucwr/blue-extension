import type { JobSource } from '@/types/jd';

interface HostRule {
  test: (host: string, pathname: string) => boolean;
  source: JobSource;
}

const rules: HostRule[] = [
  { test: (h) => h.endsWith('upwork.com'), source: 'upwork' },
  { test: (h, p) => h.endsWith('linkedin.com') && p.includes('/jobs/'), source: 'linkedin' },
  { test: (h) => h.endsWith('indeed.com'), source: 'indeed' },
  { test: (h) => h.endsWith('freelancer.com'), source: 'freelancer' },
  { test: (h) => h === 'remoteok.com' || h.endsWith('.remoteok.com'), source: 'remoteok' },
  { test: (h) => h.endsWith('wellfound.com'), source: 'wellfound' },
];

export function detectJobSource(url: string): JobSource {
  try {
    const u = new URL(url);
    for (const rule of rules) {
      if (rule.test(u.hostname, u.pathname)) return rule.source;
    }
    return 'generic';
  } catch {
    return 'generic';
  }
}

export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
