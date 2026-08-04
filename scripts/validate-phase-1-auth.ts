import assert from "node:assert/strict";
import {
  authenticateBearerHeader,
  createApiAuthRuntime,
  principalCanAccessProject,
} from "../apps/api/src/auth";

const runtime = createApiAuthRuntime("test", true, {
  Y_API_AUTH_TOKEN: "configured-token-which-is-long-enough",
  Y_API_AUTH_ACTOR: "ci-operator",
  Y_API_AUTH_ROLE: "reviewer",
  Y_API_AUTH_PROJECTS: "project-a,project-b",
});

assert.equal(
  authenticateBearerHeader(undefined, runtime).status,
  401,
  "Headerless requests must be rejected."
);
assert.equal(
  authenticateBearerHeader("Bearer invalid", runtime).status,
  401,
  "Invalid tokens must be rejected."
);

const configured = authenticateBearerHeader(
  "Bearer configured-token-which-is-long-enough",
  runtime
);
assert.equal(configured.ok, true);
assert.equal(configured.principal?.actorId, "ci-operator");
assert.equal(configured.principal?.role, "reviewer");
assert.equal(
  principalCanAccessProject(configured.principal!, "project-a"),
  true
);
assert.equal(
  principalCanAccessProject(configured.principal!, "project-c"),
  false
);

const development = authenticateBearerHeader(
  `Bearer ${runtime.developmentToken}`,
  runtime
);
assert.equal(development.ok, true);
assert.equal(
  principalCanAccessProject(development.principal!, "any-project"),
  true
);

const production = createApiAuthRuntime("production", false, {});
assert.equal(production.developmentToken, null);
assert.equal(
  authenticateBearerHeader("Bearer anything", production).status,
  503,
  "Production without configured auth must fail closed."
);

console.log("Phase 1 authentication boundary: PASS");

