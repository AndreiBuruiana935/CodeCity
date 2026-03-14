const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 1. Basic Health Check
app.get('/', (req, res) => {
    res.json({ message: "CodeAtlas API is running! 🚀" });
});

// 2. Module 3 Pipeline: Analysis & Translation
app.post('/api/analyze-node', async (req, res) => {
    const { fileCode, inboundDeps, outboundDeps, targetLanguage } = req.body;
    
    console.log(`[CodeAtlas] Analyzing node. Target language: ${targetLanguage || 'English'}`);

    try {
        // TODO: This is where we will add the Axios calls to your local Qwen-32B and Qwen-8B
        
        // Mock response so your frontend teammate can start building the UI right now
        res.json({
            status: "success",
            originalAnalysis: "This file handles core user authentication and session management.",
            translatedAnalysis: "[Translated output will appear here]",
            riskScore: 85,
            componentType: "Auth Middleware"
        });
    } catch (error) {
        console.error("Analysis pipeline failed:", error);
        res.status(500).json({ error: "Failed to analyze node" });
    }
});

app.listen(PORT, () => {
    console.log(`🔥 CodeAtlas backend is live on http://localhost:${PORT}`);
});