// agent-backend/src/routes/agentRoutes.ts
import { Router, Request, Response } from 'express';
import { researchAdvisorAgent } from '../agents/researchAdvisorAgent.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { intent, payload } = req.body;

  if (!intent) {
    return res.status(400).json({ error: 'Missing intent in request body.' });
  }

  try {
    const result = await researchAdvisorAgent.runAgent(intent, payload);
    res.json(result);
  } catch (error: any) {
    console.error(`Error processing agent request for intent '${intent}':`, error);
    res.status(500).json({ 
      error: 'Failed to process request through agent.', 
      details: error.message || 'Unknown error.' 
    });
  }
});

export default router;