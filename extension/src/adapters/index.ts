import { genericAdapter } from './generic.adapter';
import { indeedAdapter } from './indeed.adapter';
import { linkedinAdapter } from './linkedin.adapter';
import type { SiteAdapter } from './types';
import { upworkAdapter } from './upwork.adapter';

/**
 * Adapter chain. Order matters: site-specific first, generic always last.
 * New adapters (freelancer, remoteok, wellfound) plug in here.
 */
export const adapters: readonly SiteAdapter[] = [
  upworkAdapter,
  linkedinAdapter,
  indeedAdapter,
  genericAdapter,
];

export { genericAdapter, upworkAdapter, linkedinAdapter, indeedAdapter };
export type { SiteAdapter } from './types';
