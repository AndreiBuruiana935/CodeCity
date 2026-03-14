import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "path";

// Load .env from the project root (one level up from frontend/)
config({ path: path.resolve(__dirname, "..", ".env") });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    ENABLE_AI: process.env.ENABLE_AI,
    FEATHERLESS_API_KEY: process.env.FEATHERLESS_API_KEY,
    FEATHERLESS_BASE_URL: process.env.FEATHERLESS_BASE_URL,
    FEATHERLESS_ANALYSIS_MODEL: process.env.FEATHERLESS_ANALYSIS_MODEL,
    FEATHERLESS_CHAT_MODEL: process.env.FEATHERLESS_CHAT_MODEL,
    CARTOGRAPHER_MODEL: process.env.CARTOGRAPHER_MODEL,
    INSPECTOR_MODEL: process.env.INSPECTOR_MODEL,
    GUIDE_MODEL: process.env.GUIDE_MODEL,
    LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
};

export default nextConfig;
