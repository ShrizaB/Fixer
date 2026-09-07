const services = {
  "checkout-api": {
    status: "degraded",
    errorRate: "15%",
    region: "us-east-1",
    runbook: "Runbook for checkout-api: 1. Check Redis cluster. 2. Scale up pods.",
    deploys: [{ version: "v1.4.2", status: "success", deployedAt: "2 hours ago" }]
  },
  "payments-worker": {
    status: "healthy",
    errorRate: "0.1%",
    region: "us-west-2",
    runbook: "Runbook for payments-worker: 1. Verify SQS queue depth.",
    deploys: [{ version: "v2.0.1", status: "failed", deployedAt: "10 mins ago" }]
  },
  "auth-gateway": {
    status: "down",
    errorRate: "100%",
    region: "global",
    runbook: "Runbook for auth-gateway: P0 incident! Page the auth team immediately.",
    deploys: []
  }
};

function runTool(toolName, args) {
  const serviceMatch = args.service ? args.service.toLowerCase() : "";
  const serviceKey = Object.keys(services).find(s => serviceMatch.includes(s)) || serviceMatch;
  const service = services[serviceKey];
  
  if (!service) return { error: `Service '${args.service}' not found.` };

  if (toolName === "get_status") return { status: service.status, errorRate: service.errorRate, region: service.region };
  if (toolName === "get_runbook") return { text: service.runbook };
  if (toolName === "get_deploy_history") return { deploys: service.deploys };
  
  return { error: `Unknown tool '${toolName}'` };
}

module.exports = { runTool };
