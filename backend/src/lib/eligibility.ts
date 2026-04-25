// Auto-eligibility computation. Runs at sign-in and weekly via cron.
//
// Rule: a viewer is auto_eligible iff
//   - account is at least 365 days old, AND
//   - they authored at least 3 PRs merged into repos they don't own, AND
//   - they pushed in the last 90 days.
import { prisma } from '../db.js';
import { github, GitHubApiError } from './github.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface EligibilityResult {
  eligibility: 'auto_eligible' | 'pending';
  reason: string;
}

export async function computeAutoEligibility(
  login: string,
  token: string,
): Promise<EligibilityResult> {
  let user;
  try {
    user = await github.userByLogin(login, token);
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return { eligibility: 'pending', reason: `Could not fetch GitHub profile (${err.status}).` };
    }
    throw err;
  }

  const accountAgeDays = (Date.now() - new Date(user.created_at).getTime()) / ONE_DAY_MS;
  if (accountAgeDays < 365) {
    return {
      eligibility: 'pending',
      reason: `Account is ${Math.floor(accountAgeDays)} days old; auto-eligibility requires 365.`,
    };
  }

  let mergedPrs = 0;
  try {
    const prs = await github.searchMergedPrs(login, token);
    mergedPrs = prs.total_count;
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return {
        eligibility: 'pending',
        reason: `Could not query merged PRs (${err.status}).`,
      };
    }
    throw err;
  }
  if (mergedPrs < 3) {
    return {
      eligibility: 'pending',
      reason: `Only ${mergedPrs} merged PRs to repos you don't own; need at least 3.`,
    };
  }

  let recentPush = false;
  try {
    const events = await github.events(login, token);
    const cutoff = Date.now() - 90 * ONE_DAY_MS;
    recentPush = events.some(
      (e) => e.type === 'PushEvent' && new Date(e.created_at).getTime() >= cutoff,
    );
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return {
        eligibility: 'pending',
        reason: `Could not read recent activity (${err.status}).`,
      };
    }
    throw err;
  }
  if (!recentPush) {
    return {
      eligibility: 'pending',
      reason: 'No push activity in the last 90 days.',
    };
  }

  return {
    eligibility: 'auto_eligible',
    reason: `Account ${Math.floor(accountAgeDays)} days old; ${mergedPrs} merged PRs; recent activity confirmed.`,
  };
}

/**
 * Persist the result of an eligibility computation, but do NOT downgrade a
 * `manually_eligible` or `suspended` user just because the auto-check failed.
 */
export async function applyEligibilityResult(userId: string, result: EligibilityResult) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) return;

  if (current.eligibility === 'manually_eligible' || current.eligibility === 'suspended') {
    await prisma.user.update({
      where: { id: userId },
      data: { eligibilityCheckedAt: new Date() },
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      eligibility: result.eligibility,
      eligibilityReason: result.reason,
      eligibilityCheckedAt: new Date(),
    },
  });
}
