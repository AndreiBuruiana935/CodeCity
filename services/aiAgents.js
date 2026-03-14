'use strict';

const axios = require('axios');

// ════════════════════════════════════════════════════════════════
// API KEY READ & STARTUP GUARD
// ════════════════════════════════════════════════════════════════
const FEATHERLESS_API_KEY = process.env.FEATHERLESS_API_KEY;
if (!FEATHERLESS_API_KEY) {
  throw new Error('FEATHERLESS_API_KEY environment variable is not set.');
}

// ════════════════════════════════════════════════════════════════
// LLM ENDPOINT & MODEL CONSTANTS
// ════════════════════════════════════════════════════════════════
const FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1/chat/completions';

const CARTOGRAPHER_MODEL = process.env.CARTOGRAPHER_MODEL
  || 'Qwen/Qwen2.5-Coder-32B-Instruct';

const INSPECTOR_MODEL = process.env.INSPECTOR_MODEL
  || 'Qwen/Qwen2.5-Coder-32B-Instruct';

// IMPORTANT: Qwen2.5-72B-Instruct is high-reasoning but significantly
// slower than 32B on Featherless. If Guide responses feel sluggish,
// set GUIDE_MODEL=Qwen/Qwen2.5-32B-Instruct in .env without code changes.
const GUIDE_MODEL = process.env.GUIDE_MODEL
  || 'Qwen/Qwen2.5-72B-Instruct';

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 60000;

// ════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE WITH TTL
// ════════════════════════════════════════════════════════════════
const _cache = new Map();

function _getCacheKey(label, data) {
  const raw = label + ':' + JSON.stringify(data);
  return raw.slice(0, 512);
}

function _fromCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > 10 * 60 * 1000) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function _toCache(key, value) {
  _cache.set(key, { value, ts: Date.now() });
}

// Exported so POST /api/clear-cache can call it during development.
// Clears all cached Cartographer and Inspector results immediately.
function _clearCache() {
  _cache.clear();
}

// ════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════════

function _buildAxiosConfig(url, model, messages, temperature, maxTokens) {
  return {
    method: 'post',
    url: url,
    timeout: LLM_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FEATHERLESS_API_KEY}`
    },
    data: {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    }
  };
}

async function _callLLM(config, agentLabel) {
  try {
    return await axios(config);
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const body = err.response.data?.error?.message
        || JSON.stringify(err.response.data)
        || 'No response body';
      if (status === 401) {
        throw new Error(
          `[${agentLabel}] Auth failed (401): Invalid or missing ` +
          `FEATHERLESS_API_KEY. Detail: ${body}`
        );
      }
      if (status === 429) {
        throw new Error(
          `[${agentLabel}] Rate limited (429): Featherless quota exceeded. ` +
          `Detail: ${body}`
        );
      }
      throw new Error(
        `[${agentLabel}] LLM request failed (${status}): ${body}`
      );
    }
    throw new Error(`[${agentLabel}] Network error: ${err.message}`);
  }
}

function _parseAndValidate(response, requiredKeys, agentLabel) {
  const raw = response.data.choices[0].message.content.trim();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(
      `[${agentLabel}] Returned non-JSON: ${cleaned.slice(0, 300)}`
    );
  }

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`[${agentLabel}] Response missing required key: "${key}"`);
    }
  }

  return parsed;
}

// ════════════════════════════════════════════════════════════════
// AGENT 1: THE CARTOGRAPHER
// ════════════════════════════════════════════════════════════════

const CARTOGRAPHER_SYSTEM_PROMPT = `You are The Cartographer, a senior software architect embedded in CodeAtlas, a 3D codebase visualization platform. Your job is to analyze a full repository file tree and package.json, then produce a single District Map — a JSON object that groups every file into logical architectural neighborhoods. This map is the foundation of the 3D city.

Output raw JSON ONLY. No markdown fences, no prose, no keys beyond those specified. Any extra text breaks the pipeline.

Return EXACTLY this shape:
{
  "districts": [
    {
      "name": string,
      "theme": string,
      "files": [string],
      "description": string,
      "districtRisk": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"
    }
  ],
  "summary": string,
  "entryPoints": [string],
  "riskZones": [
    { "file": string, "reason": string }
  ]
}

Field rules:
districts     — Group files into logical neighborhoods. Examples: "Core Logic", "UI District", "API Gateway", "Data Layer", "Config & Tooling", "Test Suite". Every file in the tree must appear in exactly one district. No file may be omitted.
districts[].theme — One evocative word describing the district's architectural role, e.g. "foundation", "interface", "gateway".
districts[].districtRisk — Derived from the proportion of high-inbound-dependency files in the group.
summary       — 2–4 plain-English sentences describing the project's overall architecture and purpose, inferred from the tree and package.json.
entryPoints   — File paths that are primary entry points (e.g. main, index, app).
riskZones     — Architecturally critical or fragile files based on tree position. One sentence per.
Begin your response with { and end with }.`;

async function mapRepository(repoTree, packageJson = {}) {
  if (!repoTree) {
    throw new Error('[Cartographer] repoTree is required.');
  }

  const cacheKey = _getCacheKey('cartographer', { repoTree, packageJson });
  const cached = _fromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // Payload pruning: truncate repoTree if too large
  let treeStr = typeof repoTree === 'string' ? repoTree : JSON.stringify(repoTree, null, 2);
  if (treeStr.length > 12000) {
    treeStr = treeStr.slice(0, 12000) + '\n[TREE TRUNCATED FOR CONTEXT WINDOW — analyze available portion only]';
  }

  const userMessage = `You are building the District Map for a CodeAtlas 3D visualization.

PACKAGE.JSON:
${JSON.stringify(packageJson, null, 2)}

REPOSITORY FILE TREE:
${treeStr}

Analyze the full structure. Group every file into districts.
Return only the JSON object. Begin with { and end with }.`;

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    CARTOGRAPHER_MODEL,
    [
      { role: 'system', content: CARTOGRAPHER_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    0.3,
    2048
  );

  const response = await _callLLM(config, 'Cartographer');
  const districtMap = _parseAndValidate(
    response,
    ['districts', 'summary', 'entryPoints', 'riskZones'],
    'Cartographer'
  );

  _toCache(cacheKey, districtMap);
  return districtMap;
}

// ════════════════════════════════════════════════════════════════
// AGENT 2: THE INSPECTOR
// ════════════════════════════════════════════════════════════════

const INSPECTOR_SYSTEM_PROMPT = `You are The Inspector, a deep-dive static analysis engine embedded in CodeAtlas, a 3D codebase visualization platform. You are triggered when a user clicks a building in the 3D city. Your job is to produce a precise architectural autopsy of a single source file. Output raw JSON ONLY. No markdown fences, no prose outside the JSON structure.

Return EXACTLY this shape:
{
  "core_purpose": string,
  "functions_breakdown": [
    { "name": string, "description": string, "complexity": "LOW"|"MEDIUM"|"HIGH" }
  ],
  "dependencies_role": [
    { "path": string, "role": string }
  ],
  "system_impact": {
    "risk_level": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
    "architectural_importance": string,
    "reasoning": string
  },
  "architecture_notes": string
}

Field rules:
core_purpose         — 1–3 plain-English sentences on this file's single responsibility.
functions_breakdown  — Every exported function, class, component, or hook. Include complexity per function. Empty array if none.
dependencies_role    — One entry per outbound dependency. "role" is a concise action phrase. Empty array if no outbound deps.
system_impact        — risk_level from inbound count: 0 = LOW, 1–3 = MEDIUM, 4–9 = HIGH, 10+ = CRITICAL. architectural_importance: 1 sentence. reasoning: 1 sentence.
architecture_notes   — 1–3 sentences of senior-engineer observations: coupling concerns, refactor opportunities, or design patterns detected in the file.
Begin your response with { and end with }.`;

async function inspectFile(fileCode, inboundDeps = [], outboundDeps = []) {
  if (!fileCode || typeof fileCode !== 'string') {
    throw new Error('[Inspector] fileCode must be a non-empty string.');
  }

  // Payload pruning: truncate fileCode if too large
  let prunedCode = fileCode;
  if (prunedCode.length > 8000) {
    prunedCode = prunedCode.slice(0, 8000) + '\n[CODE TRUNCATED FOR CONTEXT WINDOW]';
  }

  const cacheKey = _getCacheKey('inspector', { fileCode, inboundDeps, outboundDeps });
  const cached = _fromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const userMessage = `You are performing a deep architectural inspection for CodeAtlas.

OUTBOUND DEPENDENCIES (modules this file imports):
${outboundDeps.length > 0 ? outboundDeps.join('\n') : 'None'}

INBOUND DEPENDENCIES (modules that import this file):
${inboundDeps.length > 0 ? inboundDeps.join('\n') : 'None'}
Total inbound count: ${inboundDeps.length}

SOURCE CODE:
\`\`\`
${prunedCode}
\`\`\`

Return only the JSON object. Begin with { and end with }.`;

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    INSPECTOR_MODEL,
    [
      { role: 'system', content: INSPECTOR_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    0.2,
    1024
  );

  const response = await _callLLM(config, 'Inspector');
  const inspection = _parseAndValidate(
    response,
    ['core_purpose', 'functions_breakdown', 'dependencies_role', 'system_impact', 'architecture_notes'],
    'Inspector'
  );

  // Validate system_impact sub-keys
  const requiredSystemImpactKeys = ['risk_level', 'architectural_importance', 'reasoning'];
  for (const key of requiredSystemImpactKeys) {
    if (!(key in inspection.system_impact)) {
      throw new Error(`[Inspector] system_impact missing sub-key: "${key}"`);
    }
  }

  _toCache(cacheKey, inspection);
  return inspection;
}

// ════════════════════════════════════════════════════════════════
// AGENT 3: THE GUIDE
// ════════════════════════════════════════════════════════════════

const GUIDE_SYSTEM_PROMPT = `You are The Guide, a senior software architect embedded in CodeAtlas, a 3D interactive codebase visualization platform. You have been given a summary of the project's architecture. A developer is exploring the 3D city representation of their codebase and is asking you questions about it.

Your role:
- Answer conversational questions about the codebase in plain, precise English.
- Ground every answer in the project summary provided.
- If the question cannot be answered from the summary, say so honestly and suggest what information would help.
- Never invent file names, function names, or relationships not present in the provided context.
- Keep answers concise: 2–5 sentences unless a longer explanation is explicitly requested.
- Do NOT return JSON. Return plain readable prose ONLY.`;

async function askGuide(userQuery, projectSummary = 'No project summary available.') {
  if (!userQuery || typeof userQuery !== 'string') {
    throw new Error('[Guide] userQuery must be a non-empty string.');
  }

  // Prune projectSummary if too large
  let prunedSummary = projectSummary;
  if (typeof prunedSummary !== 'string') {
    prunedSummary = 'No project summary available.';
  }
  if (prunedSummary.length > 4000) {
    prunedSummary = prunedSummary.slice(0, 4000);
  }

  const userMessage = `PROJECT ARCHITECTURE SUMMARY:
${prunedSummary}

DEVELOPER QUESTION:
${userQuery}`;

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    GUIDE_MODEL,
    [
      { role: 'system', content: GUIDE_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    0.6,
    512
  );

  const response = await _callLLM(config, 'Guide');
  const answer = response.data.choices[0].message.content.trim();

  return { answer };
}

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════
module.exports = { mapRepository, inspectFile, askGuide, _clearCache };
