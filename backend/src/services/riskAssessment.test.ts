import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessRisk,
  assertValidRiskAssessment,
  createNotEvaluatedAssessment,
  notEvaluatedAssessor,
  validateRiskAssessment,
  NOT_EVALUATED_MODEL_ID,
  NOT_EVALUATED_MODEL_VERSION,
  type RiskAssessment,
  type RiskAssessmentInput,
  type RiskAssessor,
} from "./riskAssessment.ts";
import { AppError } from "../errors/AppError.ts";

function validInput(overrides: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    borrowerId: "GBORROWER_TEST",
    completedLoans: 3,
    defaultedLoans: 0,
    totalLoans: 3,
    requestedLoanAmount: 1000,
    ...overrides,
  };
}

function validCompletedAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    borrowerId: "GBORROWER_TEST",
    status: "COMPLETED",
    category: "LOW",
    score: 12.5,
    modelId: "test-model",
    modelVersion: "1.0.0",
    assessedAt: new Date().toISOString(),
    reasonCodes: ["LOW_DEFAULT_HISTORY"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// 1. NOT_EVALUATED state — no fake/default score ever generated.
// ---------------------------------------------------------------------

test("assessRisk with the default assessor always returns NOT_EVALUATED", async () => {
  const result = await assessRisk(validInput());

  assert.equal(result.status, "NOT_EVALUATED");
  assert.equal(result.category, "NOT_EVALUATED");
  assert.equal(result.score, null);
});

test("the default assessor never fabricates a score or category regardless of input", async () => {
  const inputs = [
    validInput({ completedLoans: 0, defaultedLoans: 0, totalLoans: 0 }),
    validInput({ completedLoans: 50, defaultedLoans: 0, totalLoans: 50 }),
    validInput({ completedLoans: 0, defaultedLoans: 50, totalLoans: 50 }),
    validInput({ requestedLoanAmount: null }),
    validInput({ additionalFeatures: { income: 1_000_000 } }),
  ];

  for (const input of inputs) {
    const result = await assessRisk(input);
    assert.equal(result.status, "NOT_EVALUATED");
    assert.equal(result.category, "NOT_EVALUATED");
    assert.equal(result.score, null);
  }
});

test("createNotEvaluatedAssessment carries the not-evaluated model identity and a reason code", () => {
  const result = createNotEvaluatedAssessment("GBORROWER_TEST");

  assert.equal(result.modelId, NOT_EVALUATED_MODEL_ID);
  assert.equal(result.modelVersion, NOT_EVALUATED_MODEL_VERSION);
  assert.deepEqual(result.reasonCodes, ["NO_VALIDATED_MODEL_CONFIGURED"]);
  assert.equal(validateRiskAssessment(result).length, 0);
});

test("notEvaluatedAssessor.assess ignores input content and always returns NOT_EVALUATED", async () => {
  const result = await notEvaluatedAssessor.assess(validInput({ borrowerId: "GANOTHER" }));

  assert.equal(result.borrowerId, "GANOTHER");
  assert.equal(result.status, "NOT_EVALUATED");
});

// ---------------------------------------------------------------------
// 2. Valid assessment.
// ---------------------------------------------------------------------

test("a well-formed COMPLETED assessment passes validation", () => {
  const issues = validateRiskAssessment(validCompletedAssessment());
  assert.deepEqual(issues, []);
});

test("assessRisk returns a custom assessor's valid COMPLETED result unchanged", async () => {
  const stubAssessment = validCompletedAssessment({ category: "HIGH", score: 88 });
  const stubAssessor: RiskAssessor = {
    modelId: "test-model",
    modelVersion: "1.0.0",
    assess: () => stubAssessment,
  };

  const result = await assessRisk(validInput(), stubAssessor);

  assert.deepEqual(result, stubAssessment);
});

test("a well-formed NOT_EVALUATED assessment with no model metadata passes validation", () => {
  const issues = validateRiskAssessment({
    borrowerId: "GBORROWER_TEST",
    status: "NOT_EVALUATED",
    category: "NOT_EVALUATED",
    score: null,
    modelId: null,
    modelVersion: null,
    assessedAt: null,
    reasonCodes: [],
  });
  assert.deepEqual(issues, []);
});

test("a well-formed FAILED assessment passes validation", () => {
  const issues = validateRiskAssessment({
    borrowerId: "GBORROWER_TEST",
    status: "FAILED",
    category: "NOT_EVALUATED",
    score: null,
    modelId: "test-model",
    modelVersion: "1.0.0",
    assessedAt: new Date().toISOString(),
    reasonCodes: ["INSUFFICIENT_INPUT_DATA"],
  });
  assert.deepEqual(issues, []);
});

// ---------------------------------------------------------------------
// 3. Invalid score/category.
// ---------------------------------------------------------------------

test("a COMPLETED assessment with category NOT_EVALUATED is rejected", () => {
  const issues = validateRiskAssessment(validCompletedAssessment({ category: "NOT_EVALUATED" }));
  assert.ok(issues.some((issue) => issue.field === "category"));
});

test("a NOT_EVALUATED status with a non-NOT_EVALUATED category is rejected", () => {
  const issues = validateRiskAssessment({
    ...createNotEvaluatedAssessment("GBORROWER_TEST"),
    category: "LOW",
  });
  assert.ok(issues.some((issue) => issue.field === "category"));
});

test("a NOT_EVALUATED status carrying a score is rejected", () => {
  const issues = validateRiskAssessment({
    ...createNotEvaluatedAssessment("GBORROWER_TEST"),
    score: 42,
  });
  assert.ok(issues.some((issue) => issue.field === "score"));
});

test("a score outside 0-100 is rejected", () => {
  const tooHigh = validateRiskAssessment(validCompletedAssessment({ score: 150 }));
  const negative = validateRiskAssessment(validCompletedAssessment({ score: -1 }));
  const notFinite = validateRiskAssessment(validCompletedAssessment({ score: Number.NaN }));

  assert.ok(tooHigh.some((issue) => issue.field === "score"));
  assert.ok(negative.some((issue) => issue.field === "score"));
  assert.ok(notFinite.some((issue) => issue.field === "score"));
});

test("an unrecognized status or category value is rejected", () => {
  const badStatus = validateRiskAssessment({
    ...validCompletedAssessment(),
    status: "UNKNOWN" as unknown as RiskAssessment["status"],
  });
  const badCategory = validateRiskAssessment({
    ...validCompletedAssessment(),
    category: "VERY_HIGH" as unknown as RiskAssessment["category"],
  });

  assert.ok(badStatus.some((issue) => issue.field === "status"));
  assert.ok(badCategory.some((issue) => issue.field === "category"));
});

// ---------------------------------------------------------------------
// 4. Missing required fields.
// ---------------------------------------------------------------------

test("an empty borrowerId is rejected", () => {
  const issues = validateRiskAssessment(validCompletedAssessment({ borrowerId: "" }));
  assert.ok(issues.some((issue) => issue.field === "borrowerId"));
});

test("a COMPLETED assessment missing modelId, modelVersion, or assessedAt is rejected", () => {
  const missingModelId = validateRiskAssessment(validCompletedAssessment({ modelId: null }));
  const missingModelVersion = validateRiskAssessment(validCompletedAssessment({ modelVersion: null }));
  const missingAssessedAt = validateRiskAssessment(validCompletedAssessment({ assessedAt: null }));

  // modelId/modelVersion also trip the "both present or both null" check,
  // so assert on the COMPLETED-specific message's field rather than count.
  assert.ok(missingModelId.some((issue) => issue.field === "modelId"));
  assert.ok(missingModelVersion.some((issue) => issue.field === "modelVersion"));
  assert.ok(missingAssessedAt.some((issue) => issue.field === "assessedAt"));
});

test("assessRisk rejects an empty borrowerId before calling the assessor", async () => {
  await assert.rejects(
    () => assessRisk(validInput({ borrowerId: "" })),
    (error: unknown) => error instanceof AppError && error.statusCode === 422,
  );
});

// ---------------------------------------------------------------------
// 5. Model/version handling.
// ---------------------------------------------------------------------

test("modelId present without modelVersion (or vice versa) is rejected", () => {
  const onlyModelId = validateRiskAssessment({
    ...createNotEvaluatedAssessment("GBORROWER_TEST"),
    modelVersion: null,
  });
  const onlyModelVersion = validateRiskAssessment({
    ...createNotEvaluatedAssessment("GBORROWER_TEST"),
    modelId: null,
  });

  assert.ok(onlyModelId.some((issue) => issue.field === "modelVersion"));
  assert.ok(onlyModelVersion.some((issue) => issue.field === "modelVersion"));
});

test("assessRisk rejects a misbehaving assessor's COMPLETED result missing model metadata", async () => {
  const brokenAssessor: RiskAssessor = {
    modelId: "broken-model",
    modelVersion: "0.0.1",
    assess: () => ({
      borrowerId: "GBORROWER_TEST",
      status: "COMPLETED",
      category: "HIGH",
      score: 90,
      modelId: null, // invalid: COMPLETED requires modelId
      modelVersion: null,
      assessedAt: new Date().toISOString(),
      reasonCodes: [],
    }),
  };

  await assert.rejects(
    () => assessRisk(validInput(), brokenAssessor),
    (error: unknown) => error instanceof AppError && error.statusCode === 422,
  );
});

// ---------------------------------------------------------------------
// 6. Deterministic serialization / contract behavior.
// ---------------------------------------------------------------------

test("a valid RiskAssessment round-trips through JSON unchanged", () => {
  const original = validCompletedAssessment();
  const roundTripped = JSON.parse(JSON.stringify(original)) as RiskAssessment;

  assert.deepEqual(roundTripped, original);
  assert.deepEqual(validateRiskAssessment(roundTripped), []);
});

test("assessRisk with the same input and the default assessor is deterministic in shape", async () => {
  const first = await assessRisk(validInput());
  const second = await assessRisk(validInput());

  // assessedAt legitimately differs call-to-call; compare everything else.
  const { assessedAt: _first, ...firstRest } = first;
  const { assessedAt: _second, ...secondRest } = second;
  assert.deepEqual(firstRest, secondRest);
});

// ---------------------------------------------------------------------
// 7. reasonCodes shape.
// ---------------------------------------------------------------------

test("reasonCodes must be an array of non-empty strings", () => {
  const notArray = validateRiskAssessment({
    ...validCompletedAssessment(),
    reasonCodes: "LOW_DEFAULT_HISTORY" as unknown as string[],
  });
  const emptyStringEntry = validateRiskAssessment(
    validCompletedAssessment({ reasonCodes: [""] }),
  );

  assert.ok(notArray.some((issue) => issue.field === "reasonCodes"));
  assert.ok(emptyStringEntry.some((issue) => issue.field === "reasonCodes"));
});

test("assertValidRiskAssessment throws AppError.validationFailed with the issue list as details", () => {
  assert.throws(
    () => assertValidRiskAssessment(validCompletedAssessment({ score: 999 })),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 422);
      assert.ok(Array.isArray(error.details));
      return true;
    },
  );
});
