// agent-backend/src/app.ts
import express from 'express';
import cors from 'cors';
import testRoutes from './routes/testRoutes.js';
import agentRoutes from './routes/agentRoutes.js'; // Import new agent routes
import corsOptions from './utils/cors.js';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api', testRoutes);
app.use('/api/agents', agentRoutes); // Use new agent routes

export default app;