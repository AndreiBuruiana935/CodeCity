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

const GUIDE_MODEL = process.env.GUIDE_MODEL
  || 'Qwen/Qwen3-32B';

const SUMMARIZER_MODEL = process.env.SUMMARIZER_MODEL
  || 'Qwen/Qwen2.5-Coder-7B-Instruct';

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 90000;

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

async function _callLLM(config, agentLabel, _retryCount = 0) {
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
      if (status === 429 && _retryCount < 2) {
        const wait = ((_retryCount + 1) * 4000) + Math.random() * 1000;
        console.warn(`[${agentLabel}] Rate limited (429), retrying in ${Math.round(wait)}ms (attempt ${_retryCount + 1}/2)...`);
        await new Promise(r => setTimeout(r, wait));
        return _callLLM(config, agentLabel, _retryCount + 1);
      }
      if (status === 429) {
        throw new Error(
          `[${agentLabel}] Rate limited (429): Featherless quota exceeded after retries. ` +
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

const CARTOGRAPHER_SYSTEM_PROMPT = `You are The Cartographer, a senior software architect embedded in CodeAtlas, an interactive codebase visualization platform. Your job is to analyze a full repository file tree and package.json, then produce a single District Map — a JSON object that groups every file into logical architectural modules. This map drives the force-directed architecture graph.

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
  ],
  "fileRoles": [
    { "file": string, "role": string, "layer": "database"|"backend"|"api"|"frontend", "confidence": number }
  ],
  "circularDependencies": [
    { "fileA": string, "fileB": string }
  ],
  "testCoverage": {
    "covered": [string],
    "uncovered": [string]
  }
}

Field rules:
districts     — Group files into logical neighborhoods. Examples: "Core Logic", "UI District", "API Gateway", "Data Layer", "Config & Tooling", "Test Suite". Every file in the tree must appear in exactly one district. No file may be omitted.
districts[].theme — One evocative word describing the district's architectural role, e.g. "foundation", "interface", "gateway".
districts[].districtRisk — Derived from the proportion of high-inbound-dependency files in the group.
summary       — 2–4 plain-English sentences describing the project's overall architecture and purpose, inferred from the tree and package.json.
entryPoints   — File paths that are primary entry points (e.g. main, index, app).
riskZones     — Architecturally critical or fragile files based on tree position. One sentence per.
fileRoles     — Assign EVERY code file an architectural role AND a visualization layer. Allowed roles: "controller", "model", "service", "component", "middleware", "config", "test", "utility", "route", "migration", "hook", "type", "entry". layer MUST be one of: "database", "backend", "api", "frontend". Assign layer based on the file's actual purpose in the architecture — NOT just its folder name. For example: TypeScript type definition files (.d.ts) or interfaces belong to "backend", not "database". ORM models and migration files belong to "database". React/Vue/Svelte components belong to "frontend". Express/FastAPI route handlers belong to "api". Business logic services belong to "backend". confidence is 0–1.
circularDependencies — Pairs of files that likely import each other (bidirectional dependency). Infer from naming and import patterns in the tree. Empty array if none detected.
testCoverage  — "covered": source files that have a corresponding test file; "uncovered": source files with no apparent test. Infer from naming conventions (*.test.*, *.spec.*, __tests__/).
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

  let treeStr = typeof repoTree === 'string' ? repoTree : JSON.stringify(repoTree, null, 2);
  if (treeStr.length > 30000) {
    treeStr = treeStr.slice(0, 30000) + '\n[TREE TRUNCATED FOR CONTEXT WINDOW — analyze available portion only]';
  }

  const userMessage = `You are building the District Map for a CodeAtlas architecture graph visualization.

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
    8000
  );

  const response = await _callLLM(config, 'Cartographer');
  const districtMap = _parseAndValidate(
    response,
    ['districts', 'summary', 'entryPoints', 'riskZones', 'fileRoles'],
    'Cartographer'
  );

  // Ensure optional new fields have defaults
  if (!districtMap.circularDependencies) districtMap.circularDependencies = [];
  if (!districtMap.testCoverage) districtMap.testCoverage = { covered: [], uncovered: [] };

  _toCache(cacheKey, districtMap);
  return districtMap;
}

// ════════════════════════════════════════════════════════════════
// AGENT 2: THE INSPECTOR
// ════════════════════════════════════════════════════════════════

const INSPECTOR_SYSTEM_PROMPT = `You are The Inspector, a deep-dive static analysis engine embedded in CodeAtlas, an interactive codebase visualization platform. You are triggered when a user clicks a node in the architecture graph. Your job is to produce a precise architectural autopsy of a single source file. Output raw JSON ONLY. No markdown fences, no prose outside the JSON structure.

Return EXACTLY this shape:
{
  "core_purpose": string,
  "architecturalRole": string,
  "functions_breakdown": [
    { "name": string, "description": string, "complexity": "LOW"|"MEDIUM"|"HIGH" }
  ],
  "dependencies_role": [
    { "path": string, "role": string }
  ],
  "circularDeps": [string],
  "system_impact": {
    "risk_level": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
    "architectural_importance": string,
    "reasoning": string
  },
  "architecture_notes": string
}

Field rules:
core_purpose         — 1–3 plain-English sentences on this file's single responsibility.
architecturalRole    — Exactly one of: "controller", "model", "service", "component", "middleware", "config", "test", "utility", "route", "migration", "hook", "type", "entry".
functions_breakdown  — Every exported function, class, component, or hook. Include complexity per function. Empty array if none.
dependencies_role    — One entry per outbound dependency. "role" is a concise action phrase. Empty array if no outbound deps.
circularDeps         — File paths from the inbound or outbound dependencies that form a bidirectional import cycle with this file. Empty array if none.
system_impact        — risk_level from inbound count: 0 = LOW, 1–3 = MEDIUM, 4–9 = HIGH, 10+ = CRITICAL. architectural_importance: 1 sentence. reasoning: 1 sentence.
architecture_notes   — 1–3 sentences of senior-engineer observations: coupling concerns, refactor opportunities, or design patterns detected in the file.
Begin your response with { and end with }.`;

async function inspectFile(fileCode, inboundDeps = [], outboundDeps = []) {
  if (!fileCode || typeof fileCode !== 'string') {
    throw new Error('[Inspector] fileCode must be a non-empty string.');
  }

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

  // Ensure new optional fields have defaults
  if (!inspection.architecturalRole) inspection.architecturalRole = 'utility';
  if (!inspection.circularDeps) inspection.circularDeps = [];

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
// AGENT 3: THE NAVIGATOR (multilingual chat guide)
// ════════════════════════════════════════════════════════════════

const NAVIGATOR_SYSTEM_PROMPT = `You are The Navigator, a senior software architect embedded in CodeAtlas, an interactive codebase visualization platform. You have been given a summary of the project's architecture and a rich code map. A developer is exploring the architecture graph of their codebase and is asking you questions about it.

CRITICAL LANGUAGE RULE: Detect the language the developer writes in and ALWAYS reply in that SAME language. If they write in Romanian, answer in Romanian. If in English, answer in English. If in French, answer in French. Match their language exactly.

Your role:
- Answer conversational questions about the codebase in plain, precise language matching the user's.
- Ground every answer in the project summary and code map provided.
- If the question cannot be answered from the context, say so honestly and suggest what information would help.
- Never invent file names, function names, or relationships not present in the provided context.
- When the question asks about locating specific functionality (e.g., "where is auth?"), include building IDs in highlightedBuildings.
- When asked for a tour or flow explanation, return ordered building IDs representing the path.
- When asked for a reading list, return a structured recommendation.

You MUST return valid JSON with this exact shape:
{
  "answer": string,
  "highlightedBuildings": [string],
  "cameraFlyTo": string | null,
  "relatedDistricts": [string],
  "confidence": number,
  "detectedLanguage": string,
  "responseType": "explanation" | "highlight" | "tour" | "readingList"
}

Field rules:
answer               — Your response text in the developer's language. 2–8 sentences unless more is requested.
highlightedBuildings — Array of building IDs to visually highlight on the map. Empty if not applicable.
cameraFlyTo          — Single building ID to fly the camera to, or null.
relatedDistricts     — District names that are relevant. Empty array if not applicable.
confidence           — 0.0–1.0 reflecting how confident you are in the answer given the available context.
detectedLanguage     — ISO 639-1 code of the language you detected (e.g., "en", "ro", "fr", "de").
responseType         — "highlight" when pointing to specific files, "tour" when explaining a flow/path, "readingList" when recommending reading order, "explanation" for general answers.
Begin your response with { and end with }.`;

async function askGuide(userQuery, projectSummary = 'No project summary available.', messages = [], citySchema = null) {
  if (!userQuery || typeof userQuery !== 'string') {
    throw new Error('[Navigator] userQuery must be a non-empty string.');
  }

  let prunedSummary = projectSummary;
  if (typeof prunedSummary !== 'string') {
    prunedSummary = 'No project summary available.';
  }
  if (prunedSummary.length > 12000) {
    prunedSummary = prunedSummary.slice(0, 12000);
  }

  // Build conversation messages for multi-turn context
  const llmMessages = [
    { role: 'system', content: NAVIGATOR_SYSTEM_PROMPT }
  ];

  // Add conversation history (last 10 turns max to fit context window)
  const recentHistory = Array.isArray(messages) ? messages.slice(-10) : [];
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Build the current user message with full context
  let cityContext = '';
  if (citySchema) {
    try {
      const compact = {
        name: citySchema.name,
        language: citySchema.language,
        framework: citySchema.framework,
        architecture: citySchema.architecture,
        districts: (citySchema.districts || []).map(d => d.name),
        entryPoints: citySchema.entryPoints,
        hotspots: citySchema.hotspots,
      };
      cityContext = `\n\nCITY SCHEMA:\n${JSON.stringify(compact)}`;
    } catch {
      // Ignore serialization errors
    }
  }

  const userMessage = `PROJECT ARCHITECTURE SUMMARY:
${prunedSummary}${cityContext}

DEVELOPER QUESTION:
${userQuery}

Return only the JSON object. Begin with { and end with }.`;

  llmMessages.push({ role: 'user', content: userMessage });

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    GUIDE_MODEL,
    llmMessages,
    0.5,
    1200
  );

  const response = await _callLLM(config, 'Navigator');

  // Try to parse as JSON first (new behavior)
  try {
    const parsed = _parseAndValidate(
      response,
      ['answer'],
      'Navigator'
    );
    // Ensure all expected fields have defaults
    return {
      answer: parsed.answer,
      highlightedBuildings: Array.isArray(parsed.highlightedBuildings) ? parsed.highlightedBuildings : [],
      cameraFlyTo: parsed.cameraFlyTo || null,
      relatedDistricts: Array.isArray(parsed.relatedDistricts) ? parsed.relatedDistricts : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      detectedLanguage: parsed.detectedLanguage || 'en',
      responseType: parsed.responseType || 'explanation',
    };
  } catch {
    // Fallback: model returned plain text instead of JSON
    const answer = response.data.choices[0].message.content.trim();
    return {
      answer,
      highlightedBuildings: [],
      cameraFlyTo: null,
      relatedDistricts: [],
      confidence: 0.6,
      detectedLanguage: 'en',
      responseType: 'explanation',
    };
  }
}

// ════════════════════════════════════════════════════════════════
// AGENT 4: THE SUMMARIZER (lightweight per-file summaries)
// ════════════════════════════════════════════════════════════════

async function summarizeFile(building) {
  if (!building || !building.path) {
    throw new Error('[Summarizer] building with path is required.');
  }

  const cacheKey = _getCacheKey('summarizer', { path: building.path });
  const cached = _fromCache(cacheKey);
  if (cached) return cached;

  const compact = {
    path: building.path,
    entryPoint: building.entryPoint,
    securitySensitive: building.securitySensitive,
    riskScore: building.riskScore,
    complexity: building.complexity,
    dependencyCount: building.dependencyCount,
    linesOfCode: building.linesOfCode,
    functions: (building.functions || []).slice(0, 10).map(f => typeof f === 'string' ? f : f.name),
    dependencies: (building.dependencies || []).slice(0, 10),
  };

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    SUMMARIZER_MODEL,
    [
      {
        role: 'system',
        content: 'You are a senior software architect reviewing a file in a codebase. Write a specific, concrete 3-4 sentence summary that covers: (1) What this file DOES — name concrete entities, routes, components, or functions it provides; (2) WHERE it sits in the architecture — what calls it and what it calls; (3) Any notable risk, coupling, or design concern. Be precise: use actual function/class/route names from the metadata. Never be vague like "handles various operations" — say exactly what operations. Return ONLY the summary text, no JSON or formatting.'
      },
      {
        role: 'user',
        content: `File: ${compact.path}\nEntry point: ${compact.entryPoint}\nSecurity sensitive: ${compact.securitySensitive}\nRisk score: ${compact.riskScore}/100\nComplexity: ${compact.complexity}\nDependency count: ${compact.dependencyCount}\nLines of code: ${compact.linesOfCode}\nFunctions: ${(compact.functions || []).join(', ') || 'none detected'}\nDependencies: ${(compact.dependencies || []).join(', ') || 'none detected'}`
      }
    ],
    0.2,
    300
  );

  const response = await _callLLM(config, 'Summarizer');
  const summary = response.data.choices[0].message.content.trim();

  _toCache(cacheKey, summary);
  return summary;
}

// ── Chunked batch summarisation (handles repos up to ~1 000 files) ──

const BATCH_CHUNK_SIZE = 50;
const BATCH_MAX_CONCURRENT = 2;
const BATCH_MAX_BUILDINGS = 500;

async function _summarizeOneChunk(chunkBuildings, repoName, language, chunkIdx) {
  const cacheKey = _getCacheKey(`summarizer-chunk-${chunkIdx}`, {
    repoName,
    paths: chunkBuildings.map(b => b.path).join(','),
  });
  const cached = _fromCache(cacheKey);
  if (cached) return cached;

  const compact = chunkBuildings.map(b => ({
    path: b.path,
    entryPoint: b.entryPoint,
    securitySensitive: b.securitySensitive,
    riskScore: b.riskScore,
    complexity: b.complexity,
    dependencyCount: b.dependencyCount,
    linesOfCode: b.linesOfCode,
    functions: (b.functions || []).slice(0, 8).map(f => typeof f === 'string' ? f : f.name),
  }));

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    SUMMARIZER_MODEL,
    [
      {
        role: 'system',
        content: 'You are a senior software architect. Focus heavily on infrastructure, code topology, coupling, runtime flow, and maintainability risks. Return only valid JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Create concise but detailed infrastructure-focused summaries for each file.',
          format: { summaries: [{ path: 'string', summary: '2-4 sentences: architectural role, call/dependency context, and critical risk or ownership hints' }] },
          repoName,
          language,
          buildings: compact,
          constraints: [
            'Max 500 characters per summary',
            'Name specific functions, classes, routes, or components — never say "handles various things"',
            'Explain where this file sits in architecture: what imports it and what it imports',
            'If security or entry flow applies, mention it explicitly',
            'For type/interface files, list the key exported types and which modules consume them'
          ],
        })
      }
    ],
    0.2,
    Math.min(compact.length * 100, 4096)
  );

  const response = await _callLLM(config, `Summarizer-Batch-${chunkIdx}`);
  const parsed = _parseAndValidate(response, ['summaries'], `Summarizer-Batch-${chunkIdx}`);
  const result = {};
  for (const item of (parsed.summaries || [])) {
    if (item.path && item.summary) {
      result[item.path.trim()] = item.summary.trim();
    }
  }

  _toCache(cacheKey, result);
  return result;
}

async function summarizeBatch(buildings, repoName, language) {
  if (!Array.isArray(buildings) || buildings.length === 0) {
    return {};
  }

  const fullCacheKey = _getCacheKey('summarizer-batch', { repoName, count: buildings.length });
  const fullCached = _fromCache(fullCacheKey);
  if (fullCached) return fullCached;

  const toProcess = buildings.slice(0, BATCH_MAX_BUILDINGS);

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < toProcess.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(toProcess.slice(i, i + BATCH_CHUNK_SIZE));
  }

  const merged = {};

  // Process with limited concurrency
  for (let i = 0; i < chunks.length; i += BATCH_MAX_CONCURRENT) {
    const batch = chunks.slice(i, i + BATCH_MAX_CONCURRENT);
    const settled = await Promise.allSettled(
      batch.map((chunk, ci) => _summarizeOneChunk(chunk, repoName, language, i + ci))
    );
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) {
        Object.assign(merged, s.value);
      }
    }
  }

  _toCache(fullCacheKey, merged);
  return merged;
}

async function generateOnboarding(city, buildings) {
  if (!city) {
    throw new Error('[Onboarding] city is required.');
  }

  const topRisk = [...(buildings || [])]
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .slice(0, 6)
    .map(b => ({
      path: b.path,
      riskScore: b.riskScore,
      entryPoint: b.entryPoint,
      dependencyCount: b.dependencyCount,
      complexity: b.complexity,
    }));

  const config = _buildAxiosConfig(
    FEATHERLESS_BASE_URL,
    SUMMARIZER_MODEL,
    [
      {
        role: 'system',
        content: 'You are a principal engineer writing onboarding notes. Focus on infrastructure and architecture first, then pragmatic next steps. Return ONLY the onboarding text, no JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Write one concise onboarding paragraph.',
          constraints: [
            '4-6 sentences',
            'Mention architecture, key modules, and where to start reading',
            'Mention at least one risk hotspot',
          ],
          city: {
            name: city.name || city.city?.name,
            language: city.language || city.city?.language,
            framework: city.framework || city.city?.framework,
            architecture: city.architecture || city.city?.architecture,
            districts: (city.districts || city.city?.districts || []).map(d => d.name || d),
            entryPoints: city.entryPoints || city.city?.entryPoints || [],
          },
          hotspots: topRisk,
        })
      }
    ],
    0.25,
    700
  );

  const response = await _callLLM(config, 'Onboarding');
  return response.data.choices[0].message.content.trim();
}

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════
module.exports = {
  mapRepository,
  inspectFile,
  askGuide,
  summarizeFile,
  summarizeBatch,
  generateOnboarding,
  _clearCache,
};
