require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const zlib = require('zlib');
const { analyzeFile } = require('./services/analysisService');

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

// PAYLOAD PRUNING: Remove verbose fields not needed by 3D visualization
function pruneAnalysisPayload(analysis) {
  return {
    core_purpose: analysis.core_purpose,
    functions_breakdown: analysis.functions_breakdown,
    dependencies_role: analysis.dependencies_role,
    system_impact: {
      risk_level: analysis.system_impact.risk_level,
      architectural_importance: analysis.system_impact.architectural_importance
      // Note: "reasoning" field omitted to reduce payload size
    }
  };
}

const PORT = process.env.PORT || 3000;

// 1. Basic Health Check
app.get('/', (req, res) => {
    res.json({ message: "CodeAtlas API is running! 🚀" });
});

// 2. Module 3 Pipeline: Analysis & Translation
app.post('/api/analyze-node', throttleMiddleware, async (req, res) => {
  const {
    fileCode,
    inboundDeps    = [],
    outboundDeps   = [],
    targetLanguage = 'en'
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
    const analysis = await analyzeFile(
      fileCode,
      inboundDeps,
      outboundDeps,
      targetLanguage
    );
    // Prune the payload to reduce response size before sending to frontend
    const prunedAnalysis = pruneAnalysisPayload(analysis);
    return res.status(200).json({ success: true, analysis: prunedAnalysis });
  } catch (err) {
    console.error('[POST /api/analyze-node]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
    console.log(`🔥 CodeAtlas backend is live on http://localhost:${PORT}`);
});