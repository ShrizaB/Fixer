// scripts/preflight_check.js
//
// Validates the RIME_MODEL_ID / RIME_SPEAKER / RIME_LANGUAGE combo in .env
// against Rime's live public catalog (no API key needed for this endpoint),
// per the "use a current production configuration" build rule and the
// "preflight check that validates the chosen Rime model/voice/language
// combo against the live catalog" deliverable.
//
// Usage: node preflight_check.js
// Reads .env from repo root if present (simple parser, no dependency).
// Exit code 0 = combo is valid today, 1 = invalid or catalog unreachable.

const fs = require("fs");
const path = require("path");

const CATALOG_URL = "https://users.rime.ai/data/voices/all-v2.json";

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const env = { ...process.env };
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const modelId = env.RIME_MODEL_ID || "coda";
  const speaker = env.RIME_SPEAKER || "astra";
  const lang = env.RIME_LANGUAGE || "eng";

  console.log(`[preflight] checking modelId=${modelId} speaker=${speaker} lang=${lang}`);
  console.log(`[preflight] fetching live catalog: ${CATALOG_URL}`);

  let catalog;
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    catalog = await res.json();
  } catch (err) {
    console.error(`[preflight] FAIL — could not reach live catalog: ${err.message}`);
    process.exit(1);
  }

  const modelBlock = catalog[modelId];
  if (!modelBlock) {
    console.error(`[preflight] FAIL — modelId "${modelId}" not present in live catalog.`);
    console.error(`[preflight] available models: ${Object.keys(catalog).join(", ")}`);
    process.exit(1);
  }

  const langBlock = modelBlock[lang];
  if (!langBlock) {
    console.error(`[preflight] FAIL — language "${lang}" not offered on model "${modelId}".`);
    console.error(`[preflight] available languages for ${modelId}: ${Object.keys(modelBlock).join(", ")}`);
    process.exit(1);
  }

  if (!langBlock.includes(speaker)) {
    console.error(`[preflight] FAIL — speaker "${speaker}" not found for ${modelId}/${lang}.`);
    console.error(`[preflight] sample of available speakers: ${langBlock.slice(0, 10).join(", ")}${langBlock.length > 10 ? ", ..." : ""}`);
    process.exit(1);
  }

  console.log(`[preflight] PASS — ${modelId}/${lang}/${speaker} is live and valid right now.`);
  console.log(`[preflight] checked at ${new Date().toISOString()}`);
  process.exit(0);
}

main();
