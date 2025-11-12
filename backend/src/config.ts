// backend/src/config.ts
import dotenv from 'dotenv';

dotenv.config();

const config = {
  entailmentUrl: process.env.ENTAILMENT_URL,
  modelApiKey: process.env.MODEL_API_KEY,
  port: process.env.PORT || 3001,
  unpaywallEmail: process.env.UNPAYWALL_EMAIL || 'contact@ai-research-explorer.com',
};

export default config;
