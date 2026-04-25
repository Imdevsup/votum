// Wire types — shapes that cross between the backend, extension, and web.
// Mirrors `shared/src/index.ts` (which the web bundle still uses); kept
// inline here so the backend has no monorepo-workspace dep at deploy time.

export const ELIGIBILITY = [
  'pending',
  'auto_eligible',
  'manually_eligible',
  'rejected',
  'suspended',
] as const;
export type Eligibility = (typeof ELIGIBILITY)[number];

export const VOUCHER_RELATIONS = ['you_follow', 'notable', 'ecosystem', 'other'] as const;
export type VoucherRelation = (typeof VOUCHER_RELATIONS)[number];

export interface RepoSummary {
  owner: string;
  name: string;
  full_name: string;
}

export interface VoucherEntry {
  login: string;
  avatar_url: string;
  relation: VoucherRelation;
  vouched_at: string;
}

export interface RepoVouchData {
  repo: RepoSummary;
  count: number;
  vouchers: VoucherEntry[];
  viewer_has_vouched: boolean;
  viewer_can_vouch: boolean;
  viewer_eligibility: Eligibility | null;
  viewer_slots_used: number | null;
}

export interface MeResponse {
  login: string;
  github_id: number;
  avatar_url: string;
  eligibility: Eligibility;
  eligibility_reason: string | null;
  is_admin: boolean;
  slots_used: number;
  slots_total: number;
  has_pending_application: boolean;
}

export interface ActiveVouch {
  repo_full_name: string;
  vouched_at: string;
}

export interface ApplicationSummary {
  id: string;
  applicant: { login: string; avatar_url: string };
  reason_text: string;
  links: string[];
  created_at: string;
}

export const SLOTS_PER_USER = 10;
export const VOUCHERS_RETURNED = 5;
