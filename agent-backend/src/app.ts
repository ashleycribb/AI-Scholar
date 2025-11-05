// agent-backend/src/app.ts
import express from 'express';
import cors from 'cors';
import testRoutes from './routes/testRoutes';
import agentRoutes from './routes/agentRoutes'; // Import new agent routes

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', testRoutes);
app.use('/api/agents', agentRoutes); // Use new agent routes

export default app;