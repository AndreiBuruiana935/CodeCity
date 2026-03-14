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
const ANALYSIS_LLM_URL = process.env.ANALYSIS_LLM_URL
  || 'https://api.featherless.ai/v1/chat/completions';

const ANALYSIS_LLM_MODEL = process.env.ANALYSIS_LLM_MODEL
  || 'Qwen/Qwen2.5-Coder-32B-Instruct';

const TRANSLATION_LLM_URL = process.env.TRANSLATION_LLM_URL
  || 'https://api.featherless.ai/v1/chat/completions';

const TRANSLATION_LLM_MODEL = process.env.TRANSLATION_LLM_MODEL
  || 'Qwen/Qwen2.5-7B-Instruct';

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 60000;

// ════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ════════════════════════════════════════════════════════════════
const analysisCache = new Map();

function _getCacheKey(fileCode, targetLanguage) {
  // Create a simple cache key combining fileCode hash and targetLanguage
  return `${fileCode.length}:${fileCode.slice(0, 50)}:${targetLanguage}`;
}

function _getCachedAnalysis(fileCode, targetLanguage) {
  const key = _getCacheKey(fileCode, targetLanguage);
  return analysisCache.get(key);
}

function _setCachedAnalysis(fileCode, targetLanguage, result) {
  const key = _getCacheKey(fileCode, targetLanguage);
  analysisCache.set(key, result);
}

// ════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ════════════════════════════════════════════════════════════════
const ANALYSIS_SYSTEM_PROMPT = `You are CodeAtlas Analyzer, a precision static-analysis engine embedded in a 3D codebase visualization platform. Your ONLY output must be a single, minified, valid JSON object. Output raw JSON exclusively — zero markdown fences, zero prose, zero keys beyond those specified. Any deviation corrupts the downstream pipeline.

Return EXACTLY this shape:
{
  "core_purpose": string,
  "functions_breakdown": [
    { "name": string, "description": string }
  ],
  "dependencies_role": [
    { "path": string, "role": string }
  ],
  "system_impact": {
    "risk_level": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
    "architectural_importance": string,
    "reasoning": string
  }
}

Field rules:
core_purpose         — 1–3 plain-English sentences describing the file's sole job.
functions_breakdown  — Every exported function, class, React component, or custom hook. Empty array if none exist.
dependencies_role    — One entry per outbound dependency path provided. "role" must be a concise action phrase, e.g. "Validates incoming request body against a Zod schema." Empty array if no outbound deps provided.
system_impact        — Derive risk_level from inbound dependency COUNT:
                        0       → "LOW"
                        1–3     → "MEDIUM"
                        4–9     → "HIGH"
                        10+     → "CRITICAL"
                      architectural_importance — 1 sentence on this file's role in the overall system design.
                      reasoning — 1 sentence justifying the assigned risk_level.`;

const TRANSLATION_SYSTEM_PROMPT = `You are CodeAtlas Translator, a precision JSON localization engine. You receive a JSON object and a target language tag. You return the IDENTICAL JSON structure with ONLY the human-readable text values translated. Your output must be raw JSON — no markdown fences, no prose, no commentary.

STRICT translation rules:
1. Translate ONLY these fields:
   core_purpose (string)
   functions_breakdown[].description (string)
   dependencies_role[].role (string)
   system_impact.architectural_importance (string)
   system_impact.reasoning (string)
2. NEVER translate or alter:
   functions_breakdown[].name
   dependencies_role[].path
   system_impact.risk_level
   Any key name in the object
   File paths, variable names, identifiers, or any string that looks like code
3. Preserve the EXACT JSON shape. Do not add, remove, reorder, or rename any key.
4. If translation to the target language is not possible for a value, leave that value in English unchanged.
5. Begin your response with { and end with }.`;

// ════════════════════════════════════════════════════════════════
// ANALYSIS LLM HELPER
// ════════════════════════════════════════════════════════════════
async function _callAnalysisLLM(fileCode, inboundDeps, outboundDeps) {
  const userMessage = `You are analyzing a single source file for the CodeAtlas platform.

OUTBOUND DEPENDENCIES (modules this file imports):
${outboundDeps.length > 0 ? outboundDeps.join('\n') : 'None'}

INBOUND DEPENDENCIES (modules that import this file):
${inboundDeps.length > 0 ? inboundDeps.join('\n') : 'None'}
Total inbound count: ${inboundDeps.length}

SOURCE CODE:
\`\`\`
${fileCode}
\`\`\`

Return only the JSON object. Begin your response with { and end with }.`;

  try {
    const response = await axios.post(
      ANALYSIS_LLM_URL,
      {
        model: ANALYSIS_LLM_MODEL,
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.2,
        max_tokens: 1024,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${FEATHERLESS_API_KEY}`
        },
        timeout: LLM_TIMEOUT_MS
      }
    );

    // Extract and clean response
    const raw = response.data.choices[0].message.content.trim();
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    // Parse JSON
    let analysisObject;
    try {
      analysisObject = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(
        `Analysis LLM returned non-JSON: ${cleaned.slice(0, 300)}`
      );
    }

    // Validate top-level keys
    const requiredTopKeys = ['core_purpose', 'functions_breakdown', 'dependencies_role', 'system_impact'];
    for (const key of requiredTopKeys) {
      if (!(key in analysisObject)) {
        throw new Error(`Analysis response missing required key: "${key}"`);
      }
    }

    // Validate system_impact sub-keys
    const requiredSystemImpactKeys = ['risk_level', 'architectural_importance', 'reasoning'];
    for (const key of requiredSystemImpactKeys) {
      if (!(key in analysisObject.system_impact)) {
        throw new Error(`Analysis response missing required key: "${key}"`);
      }
    }

    return analysisObject;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const body = err.response.data?.error?.message
        || JSON.stringify(err.response.data)
        || 'No response body';
      if (status === 401) {
        throw new Error(
          `Analysis LLM auth failed (401): Invalid or missing ` +
          `FEATHERLESS_API_KEY. Detail: ${body}`
        );
      }
      if (status === 429) {
        throw new Error(
          `Analysis LLM rate limited (429): Featherless quota exceeded. ` +
          `Detail: ${body}`
        );
      }
      throw new Error(
        `Analysis LLM request failed (${status}): ${body}`
      );
    }
    throw new Error(`Analysis LLM network error: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════════
// TRANSLATION LLM HELPER
// ════════════════════════════════════════════════════════════════
async function _callTranslationLLM(analysisObject, targetLanguage) {
  const userMessage = `Translate the human-readable text values in the following JSON object into ${targetLanguage}. Apply the rules from your system prompt exactly.

INPUT JSON:
${JSON.stringify(analysisObject)}

Return only the translated JSON object.`;

  try {
    const response = await axios.post(
      TRANSLATION_LLM_URL,
      {
        model: TRANSLATION_LLM_MODEL,
        messages: [
          { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 1024,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${FEATHERLESS_API_KEY}`
        },
        timeout: LLM_TIMEOUT_MS
      }
    );

    // Extract and clean response
    const raw = response.data.choices[0].message.content.trim();
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    // Parse JSON
    let translatedObject;
    try {
      translatedObject = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(
        `Translation LLM returned non-JSON: ${cleaned.slice(0, 300)}`
      );
    }

    // Validate top-level keys
    const requiredTopKeys = ['core_purpose', 'functions_breakdown', 'dependencies_role', 'system_impact'];
    for (const key of requiredTopKeys) {
      if (!(key in translatedObject)) {
        throw new Error(`Translation response missing required key: "${key}"`);
      }
    }

    // Validate system_impact sub-keys
    const requiredSystemImpactKeys = ['risk_level', 'architectural_importance', 'reasoning'];
    for (const key of requiredSystemImpactKeys) {
      if (!(key in translatedObject.system_impact)) {
        throw new Error(`Translation response missing required key: "${key}"`);
      }
    }

    return translatedObject;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const body = err.response.data?.error?.message
        || JSON.stringify(err.response.data)
        || 'No response body';
      if (status === 401) {
        throw new Error(
          `Translation LLM auth failed (401): Invalid or missing ` +
          `FEATHERLESS_API_KEY. Detail: ${body}`
        );
      }
      if (status === 429) {
        throw new Error(
          `Translation LLM rate limited (429): Featherless quota exceeded. ` +
          `Detail: ${body}`
        );
      }
      throw new Error(
        `Translation LLM request failed (${status}): ${body}`
      );
    }
    throw new Error(`Translation LLM network error: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORTED ANALYSIS SERVICE FUNCTION
// ════════════════════════════════════════════════════════════════
async function analyzeFile(fileCode, inboundDeps = [], outboundDeps = [], targetLanguage = 'en') {
  try {
    // Validate fileCode
    if (!fileCode || typeof fileCode !== 'string') {
      throw new Error('analyzeFile: fileCode must be a non-empty string.');
    }

    // Check cache for previously analyzed code
    const cached = _getCachedAnalysis(fileCode, targetLanguage);
    if (cached) {
      return cached;
    }

    // Call analysis
    const analysisObject = await _callAnalysisLLM(fileCode, inboundDeps, outboundDeps);

    // If English, return immediately; otherwise translate
    let result;
    if (targetLanguage.toLowerCase() === 'en') {
      result = analysisObject;
    } else {
      // Translate
      result = await _callTranslationLLM(analysisObject, targetLanguage);
    }

    // Cache the result for future identical requests
    _setCachedAnalysis(fileCode, targetLanguage, result);

    return result;
  } catch (err) {
    throw err;
  }
}

module.exports = { analyzeFile };
