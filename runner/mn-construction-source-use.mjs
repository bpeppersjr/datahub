import { createHash } from 'node:crypto';
import policy from '../config/source-policies/mn-construction-internal-acquisition.json' with { type: 'json' };
import { validateMnConstructionNotices } from './mn-construction-notices.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const POLICY_HASH = '6414af8d16b149d9087ae65cb930556248ce897c0322dd3bf16d003366cdf526';
const check = (value, reason) => { if (!value) throw new Error(`Minnesota source-use binding rejected: ${reason}.`); };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function assertMnConstructionSourceUseConfiguration() {
  check(hash(policy) === POLICY_HASH, 'versioned policy drift');
}

/** Supplied-evidence assessment, not a dispatch token. Native acquisition must
 * invoke this with its actual clock before source rows and again after acquisition.
 */
export function bindMnConstructionSourceUse(notices, options = {}) {
  check(options && typeof options === 'object' && !Array.isArray(options)
    && Object.keys(options).length === 1 && Object.hasOwn(options, 'checkedAt') && time(options.checkedAt), 'explicit canonical check time');
  assertMnConstructionSourceUseConfiguration();
  validateMnConstructionNotices(notices);
  const { checkedAt } = options, now = Date.parse(checkedAt);
  check(checkedAt >= `${policy.reviewed_at}T00:00:00.000Z`, 'check precedes policy review');
  const fresh = at => Date.parse(at) <= now && now - Date.parse(at) <= policy.runtime_requirements.maximum_notice_age_ms;
  check(fresh(notices.started_at) && fresh(notices.finished_at)
    && notices.observations.every(observation => fresh(observation.observed_at)), 'fresh notice evidence required');
  check(notices.observations.every((observation, index) => observation.article_sha256 === policy.notice_article_sha256[index]), 'complete article changed; review required');
  return Object.freeze({
    schema_version: 'mn-construction-source-use@1.0.0', checked_at: checkedAt,
    policy_id: policy.policy_id, policy_version: policy.version, policy_sha256: POLICY_HASH,
    notices_sha256: hash(notices), source_use_status: policy.status, source_use_authorized: true,
    dispatch_authorized: false, app_job_enrolled: false, legal_approval: false,
    agreement_acceptance_performed: false, export_authorized: false, source_authenticity_verified: false,
    limitations: 'Supplied-evidence binding only. Native app enrollment, persisted operation receipt, transport identity checks and before/after acquisition invocation remain required. Article fingerprints do not cover external linked pages or the remainder of each HTML response.',
  });
}
