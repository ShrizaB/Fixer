const tools = [
  {
    name: "get_status",
    description: "Get the current health status, error rate, and region of a service.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "The name of the service (e.g., checkout-api, payments-worker, auth-gateway)"
        }
      },
      required: ["service"]
    }
  },
  {
    name: "get_runbook",
    description: "Get the runbook and troubleshooting steps for a service.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "The name of the service"
        }
      },
      required: ["service"]
    }
  },
  {
    name: "get_deploy_history",
    description: "Get the recent deployment history for a service.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "The name of the service"
        }
      },
      required: ["service"]
    }
  }
];

module.exports = { tools };
