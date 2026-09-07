const { GoogleGenAI } = require("@google/genai");
const { tools } = require("./tools");

class LLMClient {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async processUtterance(text) {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: text,
        config: {
          systemInstruction: "You are an on-call ops assistant. You help engineers triage incidents by fetching status, runbooks, and deploy history.",
          tools: [{ functionDeclarations: tools }],
        }
      });
      
      const functionCall = response.functionCalls?.[0];
      if (functionCall) {
        return {
          intent: {
            tool: functionCall.name,
            args: functionCall.args
          },
          text: null
        };
      }
      
      return { intent: null, text: response.text || "I didn't understand." };
    } catch (e) {
      console.error(e);
      // Fallback intent parser if API fails or no key
      const lower = text.toLowerCase();
      const serviceMatch = lower.match(/(checkout-api|payments-worker|auth-gateway)/);
      const service = serviceMatch ? serviceMatch[1] : null;
      if (!service) return { intent: null, text: "I didn't catch a service name." };
      if (lower.includes("runbook")) return { intent: { tool: "get_runbook", args: { service } }, text: null };
      if (lower.includes("deploy")) return { intent: { tool: "get_deploy_history", args: { service } }, text: null };
      return { intent: { tool: "get_status", args: { service } }, text: null };
    }
  }

  async summarizeResult(intent, result) {
    try {
      const prompt = `Tool: ${intent.tool}\nArgs: ${JSON.stringify(intent.args)}\nResult: ${JSON.stringify(result)}\n\nSummarize this for a voice response in one short sentence.`;
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      return response.text;
    } catch (e) {
      console.error(e);
      // Fallback summarizer if API fails or no key
      const { service } = intent.args;
      if (intent.tool === "get_status") {
        return `${service} is ${result.status}, error rate ${result.errorRate ?? "unknown"}, region ${result.region ?? "unknown"}.`;
      }
      if (intent.tool === "get_runbook") return result.text;
      if (intent.tool === "get_deploy_history") {
        const last = result.deploys?.[0];
        return last
          ? `Last deploy of ${service} was ${last.version}, ${last.status}, at ${last.deployedAt}.`
          : `No deploy history found for ${service}.`;
      }
      return "Done.";
    }
  }
}

module.exports = LLMClient;
