// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import verifyPaperRouter from './routes/verifyPaper';
import corsOptions from './utils/cors';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api', verifyPaperRouter);

export default app;
