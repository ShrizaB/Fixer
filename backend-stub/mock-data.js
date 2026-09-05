// Fake incident data for the backend stub. Person 2's real backend will
// replace this with real status/runbook/deploy-history services; the
// shape (tool name -> args -> result) is what matters for the protocol.

const SERVICES = {
  "checkout-api": { status: "degraded", errorRate: "4.2%", region: "us-east-1" },
  "payments-worker": { status: "healthy", errorRate: "0.1%", region: "us-east-1" },
  "auth-gateway": { status: "outage", errorRate: "61%", region: "us-west-2" },
};

const RUNBOOKS = {
  "checkout-api": "Runbook CX-14: check downstream payments-worker latency before restarting pods.",
  "auth-gateway": "Runbook AU-02: rotate the signing key, then flush the JWKS cache on all edges.",
};

const DEPLOYS = {
  "checkout-api": [
    { version: "v2.14.1", deployedAt: "2026-09-05T08:02:00Z", status: "success" },
    { version: "v2.14.0", deployedAt: "2026-09-04T19:40:00Z", status: "rolled_back" },
  ],
  "auth-gateway": [
    { version: "v1.9.3", deployedAt: "2026-09-05T07:10:00Z", status: "success" },
  ],
};

function runTool(tool, args) {
  const service = args?.service;
  switch (tool) {
    case "get_status":
      return SERVICES[service] || { status: "unknown", errorRate: null, region: null };
    case "get_runbook":
      return { text: RUNBOOKS[service] || "No runbook on file for this service." };
    case "get_deploy_history":
      return { deploys: DEPLOYS[service] || [] };
    default:
      return { error: `unknown tool: ${tool}` };
  }
}

module.exports = { SERVICES, RUNBOOKS, DEPLOYS, runTool };
