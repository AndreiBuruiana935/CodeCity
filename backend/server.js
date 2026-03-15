const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const zlib = require('zlib');
const { mapRepository, inspectFile, askGuide, summarizeFile, summarizeBatch, generateOnboarding, _clearCache } =
  require('./services/aiAgents');

const app = express();
app.use(cors());
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '2mb';
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// ════════════════════════════════════════════════════════════════
// PERFORMANCE OPTIMIZATIONS
// ════════════════════════════════════════════════════════════════

// REQUEST THROTTLING MIDDLEWARE
const requestThrottleMap = new Map();
const THROTTLE_WINDOW_MS = 1000; // 1 second window
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 requests per second per IP

function throttleMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!requestThrottleMap.has(ip)) {
    requestThrottleMap.set(ip, []);
  }

  const timestamps = requestThrottleMap.get(ip);

  // Remove old timestamps outside the window
  const recentTimestamps = timestamps.filter(t => now - t < THROTTLE_WINDOW_MS);

  if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Too many requests. Please wait before sending another request.'
    });
  }

  recentTimestamps.push(now);
  requestThrottleMap.set(ip, recentTimestamps);

  next();
}

const PORT = process.env.PORT || 3001;

// 1. Basic Health Check
app.get('/', (req, res) => {
    res.json({ message: "CodeAtlas API is running! 🚀" });
});

// 2. Tri-Agent AI System Routes

// ── AGENT 1: CARTOGRAPHER ──────────────────────────────────────
app.post('/api/map-repository', throttleMiddleware, async (req, res) => {
  const { repoTree, packageJson = {} } = req.body;

  if (!repoTree) {
    return res.status(400).json({
      error: 'repoTree is required in the request body.'
    });
  }

  try {
    const districtMap = await mapRepository(repoTree, packageJson);
    return res.status(200).json({ success: true, districtMap });
  } catch (err) {
    console.error('[POST /api/map-repository]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── AGENT 2: INSPECTOR ─────────────────────────────────────────
app.post('/api/inspect-file', throttleMiddleware, async (req, res) => {
  const {
    fileCode,
    inboundDeps  = [],
    outboundDeps = []
  } = req.body;

  if (!fileCode || typeof fileCode !== 'string' || !fileCode.trim()) {
    return res.status(400).json({
      error: 'fileCode is required and must be a non-empty string.'
    });
  }

  if (!Array.isArray(inboundDeps) || !Array.isArray(outboundDeps)) {
    return res.status(400).json({
      error: 'inboundDeps and outboundDeps must be arrays.'
    });
  }

  try {
    const inspection = await inspectFile(fileCode, inboundDeps, outboundDeps);
    return res.status(200).json({ success: true, inspection });
  } catch (err) {
    console.error('[POST /api/inspect-file]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── AGENT 3: NAVIGATOR (multilingual chat guide) ───────────────
app.post('/api/chat-guide', throttleMiddleware, async (req, res) => {
  const { userQuery, projectSummary = '', messages = [], citySchema = null } = req.body;

  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    return res.status(400).json({
      error: 'userQuery is required and must be a non-empty string.'
    });
  }

  try {
    const result = await askGuide(userQuery, projectSummary, messages, citySchema);
    return res.status(200).json({
      success: true,
      answer: result.answer,
      highlightedBuildings: result.highlightedBuildings,
      cameraFlyTo: result.cameraFlyTo,
      relatedDistricts: result.relatedDistricts,
      confidence: result.confidence,
      detectedLanguage: result.detectedLanguage,
      responseType: result.responseType,
    });
  } catch (err) {
    console.error('[POST /api/chat-guide]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── AGENT 4: SUMMARIZER ────────────────────────────────────────
app.post('/api/summarize-file', throttleMiddleware, async (req, res) => {
  const { building } = req.body;

  if (!building || !building.path) {
    return res.status(400).json({
      error: 'building with path is required in the request body.'
    });
  }

  try {
    const summary = await summarizeFile(building);
    return res.status(200).json({ success: true, summary });
  } catch (err) {
    console.error('[POST /api/summarize-file]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/summarize-batch', throttleMiddleware, async (req, res) => {
  const { buildings = [], repoName = '', language = '' } = req.body;

  if (!Array.isArray(buildings)) {
    return res.status(400).json({
      error: 'buildings must be an array.'
    });
  }

  try {
    const summaries = await summarizeBatch(buildings, repoName, language);
    return res.status(200).json({ success: true, summaries });
  } catch (err) {
    console.error('[POST /api/summarize-batch]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-onboarding', throttleMiddleware, async (req, res) => {
  const { city, buildings = [] } = req.body;

  if (!city) {
    return res.status(400).json({
      error: 'city is required in the request body.'
    });
  }

  try {
    const onboardingText = await generateOnboarding(city, buildings);
    return res.status(200).json({ success: true, onboardingText });
  } catch (err) {
    console.error('[POST /api/generate-onboarding]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── DEVELOPMENT UTILITY: CLEAR CACHE ───────────────────────────
app.post('/api/clear-cache', (req, res) => {
  try {
    _clearCache();
    console.log('[POST /api/clear-cache] In-memory cache cleared.');
    return res.status(200).json({
      success: true,
      message: 'All cached analysis results have been cleared.'
    });
  } catch (err) {
    console.error('[POST /api/clear-cache]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: `Payload too large. Reduce request size or increase REQUEST_BODY_LIMIT (current: ${REQUEST_BODY_LIMIT}).`
    });
  }
  return next(err);
});

app.listen(PORT, () => {
    console.log(`🔥 CodeAtlas backend is live on http://localhost:${PORT}`);
});
