// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  DomainError} from "../../../server/utils/domain-errors";
import {
  inUse,
  invalidTransition,
  permissionPrerequisites,
  phoneInUse,
  staleVersion,
  tooManyRequests,
  validationFailed,
} from "../../../server/utils/domain-errors";
import { toApiErrorBody } from "../../../server/utils/api-error";

describe("domain errors", () => {
  const cases: Array<[string, DomainError, number]> = [
    ["in_use", inUse(), 409],
    ["invalid_transition", invalidTransition(), 409],
    ["stale_version", staleVersion({ id: "t1" }), 409],
    ["permission_prerequisites", permissionPrerequisites([{ key: "manage-roles", needs: "view-roles" }]), 422],
    ["phone_in_use", phoneInUse("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"), 409],
    ["validation_failed", validationFailed({ title: ["required"] }), 400],
    ["rate_limited", tooManyRequests("rate_limited", 30), 429],
  ];

  it.each(cases)("%s renders as the standard body", (code, error, statusCode) => {
    const body = toApiErrorBody(error);
    expect(body.statusCode).toBe(statusCode);
    expect(body.data.code).toBe(code);
  });

  it("carries its payload through to the body", () => {
    expect(toApiErrorBody(inUse(3)).data).toEqual({ code: "in_use", memberCount: 3 });
    expect(toApiErrorBody(staleVersion({ id: "t1" })).data.current).toEqual({ id: "t1" });
    expect(toApiErrorBody(tooManyRequests("rate_limited", 30)).data.retryAfter).toBe(30);
    expect(toApiErrorBody(permissionPrerequisites([{ key: "manage-roles", needs: "view-roles" }])).data.missing).toEqual([{ key: "manage-roles", needs: "view-roles" }]);
  });
});
