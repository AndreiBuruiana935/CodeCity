require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const zlib = require('zlib');
const { mapRepository, inspectFile, askGuide, _clearCache } =
  require('./services/aiAgents');

const app = express();
app.use(cors());
app.use(express.json());

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

// ── AGENT 3: GUIDE ─────────────────────────────────────────────
// RESPONSE SHAPE NOTE: This route returns { success: true, answer: string }
// where answer is plain prose text. It does NOT return districtMap or
// inspection. Any frontend consumer must read the `answer` key specifically.
app.post('/api/chat-guide', throttleMiddleware, async (req, res) => {
  const { userQuery, projectSummary = '' } = req.body;

  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    return res.status(400).json({
      error: 'userQuery is required and must be a non-empty string.'
    });
  }

  try {
    const result = await askGuide(userQuery, projectSummary);
    return res.status(200).json({ success: true, answer: result.answer });
  } catch (err) {
    console.error('[POST /api/chat-guide]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── DEVELOPMENT UTILITY: CLEAR CACHE ───────────────────────────
// This route exists to solve the 10-minute TTL cache problem during
// active development. If a file is edited and re-inspected within the
// cache window, the stale result would be returned. Calling this route
// immediately invalidates ALL cached Cartographer and Inspector results,
// forcing the next request to hit the LLM fresh. Do not remove this
// route before the demo — it is essential for fast iteration.
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

app.listen(PORT, () => {
    console.log(`🔥 CodeAtlas backend is live on http://localhost:${PORT}`);
});