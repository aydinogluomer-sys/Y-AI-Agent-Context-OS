import { Connector } from "@y/shared";

// CONN module - Stub oauth and endpoint sync
export function runOAuthCredentialHealthCheck(connector: Connector): { health: "ok" | "refresh_needed" | "revoked" } {
  // Read-only minimal default policy checked server-side
  if (connector.healthStatus === "error") {
    return { health: "revoked" };
  }
  
  if (connector.metadataJson.needsRefresh === true) {
    return { health: "refresh_needed" };
  }
  
  return { health: "ok" };
}
