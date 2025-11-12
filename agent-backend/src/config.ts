// agent-backend/src/config.ts
import dotenv from 'dotenv';

dotenv.config();

const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  entailmentUrl: process.env.ENTAILMENT_URL,
  modelApiKey: process.env.MODEL_API_KEY,
  port: process.env.PORT || 3002,
};

if (!config.geminiApiKey) {
  console.warn('GEMINI_API_KEY is not set. Some features may not work.');
}

export default config;
