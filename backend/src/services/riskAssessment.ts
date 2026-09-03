/**
 * Application-layer risk assessment abstraction (L3-P10).
 *
 * # Why this module exists
 *
 * A P2P lending product eventually wants to categorize borrower risk
 * to inform lender decisions and loan terms
 * (`02_PROJECT_BRAIN.md`'s "risk assessment"/"personalized loan
 * terms" feature). That eventually means a real model — logistic
 * regression, XGBoost, a random forest, or an external risk-scoring
 * vendor — trained and validated on real outcome data. None of that
 * exists yet, and this module does not pretend otherwise: it defines
 * the *shape* a risk assessment takes and *how* the application would
 * ask for one, so that whichever real model eventually gets built
 * can be plugged in behind the same `RiskAssessor` interface without
 * the rest of the application changing. Nothing in this file computes
 * an actual risk level from borrower data.
 *
 * # The one assessor this module ships
 *
 * `notEvaluatedAssessor` is the only concrete `RiskAssessor`
 * implementation here. It always returns a `NOT_EVALUATED` result,
 * regardless of input — because that is the truthful answer today: no
 * validated model exists to produce a `LOW`/`MEDIUM`/`HIGH` category.
 * `assessRisk`'s default parameter uses it, so calling `assessRisk`
 * anywhere in the application today is guaranteed to return
 * `NOT_EVALUATED`, never a fabricated category or score. A future
 * task would add a second `RiskAssessor` implementation (e.g. backed
 * by a trained model or an external risk engine) and pass it
 * explicitly — this module's shape does not need to change for that
 * to happen.
 *
 * # Why `status` and `category` are separate fields
 *
 * `status` records what happened when an assessment was attempted
 * (`NOT_EVALUATED`: never attempted / no model configured;
 * `COMPLETED`: a validated model produced a category; `FAILED`: an
 * attempt was made but could not produce a trustworthy result — e.g.
 * insufficient input data). `category` records the actual risk
 * level, and — enforced by `validateRiskAssessment` below — can only
 * be `LOW`/`MEDIUM`/`HIGH` when `status` is `COMPLETED`. This keeps a
 * failed or skipped assessment from ever being mistaken for a real
 * "low risk" or "high risk" determination.
 *
 * # No blockchain enforcement, no lending decisions
 *
 * This is a plain TypeScript module with no database table, no HTTP
 * route, and no Soroban contract. It is not called by any lending
 * decision anywhere in the application yet, and no loan approval,
 * eligibility, or funding logic depends on its output. Per this
 * task's scope, wiring a real risk assessment into any actual
 * decision is separate, future, not-yet-approved work.
 */

import { AppError } from "../errors/AppError.ts";

/**
 * A borrower's risk category. `LOW`/`MEDIUM`/`HIGH` must only ever be
 * produced by a `RiskAssessor` whose `status` for that result is
 * `COMPLETED` — see `validateRiskAssessment`. `NOT_EVALUATED` is the
 * only valid category for any other status; a missing or failed
 * assessment must never be interpreted as, or reported as, a
 * particular risk level.
 */
export type RiskCategory = "NOT_EVALUATED" | "LOW" | "MEDIUM" | "HIGH";

/**
 * What happened when a risk assessment was requested.
 * - `NOT_EVALUATED` — no validated model was available/configured to
 *   assess this borrower. This is `notEvaluatedAssessor`'s only
 *   possible result.
 * - `COMPLETED` — a validated model produced a category. Not
 *   currently reachable — no such model exists yet.
 * - `FAILED` — an assessment was attempted but could not produce a
 *   trustworthy result (e.g. insufficient input data, a downstream
 *   model/engine error). Distinct from `NOT_EVALUATED` so a caller
 *   can tell "no one has tried" apart from "someone tried and it
 *   didn't work" — both still yield `category: "NOT_EVALUATED"`.
 */
export type AssessmentStatus = "NOT_EVALUATED" | "COMPLETED" | "FAILED";

/**
 * The result of a risk assessment request. See the module-level docs
 * above for the `status`/`category` relationship, and
 * `validateRiskAssessment` for the full set of invariants this shape
 * must satisfy.
 */
export interface RiskAssessment {
  /** Identifies which borrower this assessment is about. */
  borrowerId: string;
  status: AssessmentStatus;
  /** Only `LOW`/`MEDIUM`/`HIGH` when `status === "COMPLETED"`. */
  category: RiskCategory;
  /**
   * A numeric risk score on a normalized 0–100 scale, when the
   * assessor produces one — not every model necessarily does (a
   * purely categorical model might not). `null` whenever `status`
   * is not `COMPLETED`: a missing or failed assessment must never
   * carry a score.
   */
  score: number | null;
  /**
   * Identifies which model/engine produced this result (e.g.
   * `"not-evaluated"`, or a future `"xgboost-borrower-risk"`).
   * `modelId` and `modelVersion` are always both present or both
   * `null` together — see `validateRiskAssessment`.
   */
  modelId: string | null;
  /** The specific version of `modelId` that produced this result. */
  modelVersion: string | null;
  /** ISO-8601 timestamp of when this assessment was made, or `null`. */
  assessedAt: string | null;
  /**
   * Machine-readable explanation codes for the result (e.g. a future
   * model might return `["LOW_DEFAULT_HISTORY", "LIMITED_HISTORY"]`).
   * Always an array, possibly empty; never free-form prose, so
   * callers can rely on a stable vocabulary.
   */
  reasonCodes: string[];
}

/**
 * What a future risk model would consume to produce a `RiskAssessment`.
 *
 * This is a **data contract only** — defining what information would
 * be available to a model, not a claim that any of it is currently
 * being scored, weighted, or otherwise analyzed. `completedLoans`/
 * `defaultedLoans`/`totalLoans` intentionally mirror the on-chain
 * `reputation_registry` contract's counters (L3-P09) — a natural
 * future input, though nothing here reads from that contract yet;
 * wiring an actual data pipeline is separate, future work.
 */
export interface RiskAssessmentInput {
  borrowerId: string;
  /** From `reputation_registry.get_reputation`, if/when wired up. */
  completedLoans: number;
  /** From `reputation_registry.get_reputation`, if/when wired up. */
  defaultedLoans: number;
  /** From `reputation_registry.get_reputation`, if/when wired up. */
  totalLoans: number;
  /** The amount of the loan currently being requested, if any. */
  requestedLoanAmount: number | null;
  /**
   * Additional verified financial/application features a future
   * model may consume. Deliberately untyped — the real feature set
   * depends entirely on which model eventually gets plugged in, and
   * is not defined by this task.
   */
  additionalFeatures?: Record<string, unknown>;
}

/**
 * How the application requests a risk assessment. Implement this
 * interface once a real model or external risk engine exists;
 * `assessRisk` accepts any implementation, so swapping
 * `notEvaluatedAssessor` for a real one requires no change anywhere
 * else that calls `assessRisk`.
 */
export interface RiskAssessor {
  /** Stable identifier for this assessor, used as `RiskAssessment.modelId`. */
  readonly modelId: string;
  /** This assessor's version, used as `RiskAssessment.modelVersion`. */
  readonly modelVersion: string;
  assess(input: RiskAssessmentInput): RiskAssessment | Promise<RiskAssessment>;
}

export const NOT_EVALUATED_MODEL_ID = "not-evaluated";
export const NOT_EVALUATED_MODEL_VERSION = "n/a";

/**
 * Builds a `NOT_EVALUATED` result for `borrowerId`. Exported
 * separately from `notEvaluatedAssessor` so callers/tests can build
 * one without going through the full `assessRisk` flow.
 */
export function createNotEvaluatedAssessment(
  borrowerId: string,
  reasonCodes: string[] = ["NO_VALIDATED_MODEL_CONFIGURED"],
): RiskAssessment {
  return {
    borrowerId,
    status: "NOT_EVALUATED",
    category: "NOT_EVALUATED",
    score: null,
    modelId: NOT_EVALUATED_MODEL_ID,
    modelVersion: NOT_EVALUATED_MODEL_VERSION,
    assessedAt: new Date().toISOString(),
    reasonCodes,
  };
}

/**
 * The only `RiskAssessor` this module ships. Always returns
 * `NOT_EVALUATED`, regardless of `input` — see the module-level docs
 * above for why.
 */
export const notEvaluatedAssessor: RiskAssessor = {
  modelId: NOT_EVALUATED_MODEL_ID,
  modelVersion: NOT_EVALUATED_MODEL_VERSION,
  assess(input: RiskAssessmentInput): RiskAssessment {
    return createNotEvaluatedAssessment(input.borrowerId);
  },
};

interface FieldIssue {
  field: string;
  message: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

const VALID_STATUSES: readonly AssessmentStatus[] = ["NOT_EVALUATED", "COMPLETED", "FAILED"];
const VALID_CATEGORIES: readonly RiskCategory[] = ["NOT_EVALUATED", "LOW", "MEDIUM", "HIGH"];

/**
 * Validates a `RiskAssessment` against every invariant this module
 * relies on. Pure — never throws, never touches the network/database;
 * returns a list of issues (empty means valid). `assessRisk` calls
 * this on every assessor's output before returning it, so even a
 * future real assessor's result is checked here, not just this
 * module's own `notEvaluatedAssessor`.
 *
 * Enforced invariants:
 * - `borrowerId` is a non-empty string.
 * - `status` is one of `NOT_EVALUATED`/`COMPLETED`/`FAILED`.
 * - `category` is one of `NOT_EVALUATED`/`LOW`/`MEDIUM`/`HIGH`.
 * - When `status === "COMPLETED"`: `category` must not be
 *   `NOT_EVALUATED` (a completed assessment must produce a category),
 *   and `modelId`/`modelVersion`/`assessedAt` must all be present.
 * - When `status !== "COMPLETED"`: `category` must be `NOT_EVALUATED`
 *   and `score` must be `null` — a missing or failed assessment must
 *   never claim a risk level or a score.
 * - `score`, when not `null`, must be a finite number in `[0, 100]`.
 * - `modelId`/`modelVersion` must both be present or both be `null`
 *   — never one without the other — and non-empty strings when
 *   present.
 * - `assessedAt`, when not `null`, must be a valid ISO-8601 timestamp.
 * - `reasonCodes` must be an array of non-empty strings.
 */
export function validateRiskAssessment(assessment: RiskAssessment): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (!isNonEmptyString(assessment.borrowerId)) {
    issues.push({ field: "borrowerId", message: "is required and must be a non-empty string" });
  }

  if (!VALID_STATUSES.includes(assessment.status)) {
    issues.push({ field: "status", message: `must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  if (!VALID_CATEGORIES.includes(assessment.category)) {
    issues.push({ field: "category", message: `must be one of: ${VALID_CATEGORIES.join(", ")}` });
  }

  if (assessment.status === "COMPLETED") {
    if (assessment.category === "NOT_EVALUATED") {
      issues.push({
        field: "category",
        message:
          "must be LOW, MEDIUM, or HIGH when status is COMPLETED — a completed assessment must produce a category",
      });
    }
    if (!isNonEmptyString(assessment.modelId)) {
      issues.push({ field: "modelId", message: "is required when status is COMPLETED" });
    }
    if (!isNonEmptyString(assessment.modelVersion)) {
      issues.push({ field: "modelVersion", message: "is required when status is COMPLETED" });
    }
    if (!isValidTimestamp(assessment.assessedAt)) {
      issues.push({
        field: "assessedAt",
        message: "is required and must be a valid ISO-8601 timestamp when status is COMPLETED",
      });
    }
  } else {
    if (assessment.category !== "NOT_EVALUATED") {
      issues.push({
        field: "category",
        message:
          "must be NOT_EVALUATED when status is not COMPLETED — a missing or failed assessment must never claim a risk level",
      });
    }
    if (assessment.score !== null) {
      issues.push({
        field: "score",
        message: "must be null when status is not COMPLETED — a missing or failed assessment must never carry a score",
      });
    }
  }

  if (assessment.score !== null) {
    if (
      typeof assessment.score !== "number" ||
      !Number.isFinite(assessment.score) ||
      assessment.score < 0 ||
      assessment.score > 100
    ) {
      issues.push({ field: "score", message: "must be a finite number between 0 and 100 when present" });
    }
  }

  const hasModelId = assessment.modelId !== null;
  const hasModelVersion = assessment.modelVersion !== null;
  if (hasModelId !== hasModelVersion) {
    issues.push({
      field: "modelVersion",
      message: "modelId and modelVersion must both be present or both be null — partial model metadata is not allowed",
    });
  }
  if (hasModelId && !isNonEmptyString(assessment.modelId)) {
    issues.push({ field: "modelId", message: "must be a non-empty string when present" });
  }
  if (hasModelVersion && !isNonEmptyString(assessment.modelVersion)) {
    issues.push({ field: "modelVersion", message: "must be a non-empty string when present" });
  }

  if (assessment.assessedAt !== null && !isValidTimestamp(assessment.assessedAt)) {
    issues.push({ field: "assessedAt", message: "must be a valid ISO-8601 timestamp when present" });
  }

  if (
    !Array.isArray(assessment.reasonCodes) ||
    assessment.reasonCodes.some((code) => !isNonEmptyString(code))
  ) {
    issues.push({ field: "reasonCodes", message: "must be an array of non-empty strings" });
  }

  return issues;
}

/** Throws `AppError.validationFailed` if `validateRiskAssessment` finds any issue. */
export function assertValidRiskAssessment(assessment: RiskAssessment): void {
  const issues = validateRiskAssessment(assessment);
  if (issues.length > 0) {
    throw AppError.validationFailed("Risk assessment result failed validation.", issues);
  }
}

/**
 * Requests a risk assessment for `input.borrowerId`, via `assessor`
 * (defaulting to `notEvaluatedAssessor` — see the module-level docs
 * above for why that default can never fabricate a score or
 * category). Validates `assessor`'s output against every invariant in
 * `validateRiskAssessment` before returning it, so a misbehaving
 * assessor (including a future real one) cannot cause an invalid
 * result to propagate further into the application.
 */
export async function assessRisk(
  input: RiskAssessmentInput,
  assessor: RiskAssessor = notEvaluatedAssessor,
): Promise<RiskAssessment> {
  if (!isNonEmptyString(input.borrowerId)) {
    throw AppError.validationFailed("Risk assessment input failed validation.", [
      { field: "borrowerId", message: "is required and must be a non-empty string" },
    ]);
  }

  const result = await assessor.assess(input);
  assertValidRiskAssessment(result);
  return result;
}
