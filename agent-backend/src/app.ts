// agent-backend/src/app.ts
import express from 'express';
import cors from 'cors';
import testRoutes from './routes/testRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import pdfRoutes from './routes/pdfRoutes.js'; // Import new PDF routes
import corsOptions from './utils/cors.js';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api', testRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/pdf', pdfRoutes); // Use new PDF routes

export default app;