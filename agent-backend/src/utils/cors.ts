// agent-backend/src/utils/cors.ts
import { CorsOptions } from 'cors';

const allowedOrigins = [
  'http://localhost:3000', // Allow local development
  'https://YOUR_FRONTEND_URL', // Replace with your frontend's domain
];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

export default corsOptions;
