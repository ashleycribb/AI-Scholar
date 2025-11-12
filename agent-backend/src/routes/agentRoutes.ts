// agent-backend/src/routes/agentRoutes.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { researchAdvisorAgent } from '../agents/researchAdvisorAgent.js';

const router = Router();

const agentRequestSchema = z.object({
  intent: z.string(),
  payload: z.any(),
});

router.post('/', async (req: Request, res: Response) => {
  const validationResult = agentRequestSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({ error: 'Invalid request body.', details: validationResult.error.errors });
  }

  const { intent, payload } = validationResult.data;

  try {
    const result = await researchAdvisorAgent.run(`Execute the intent '${intent}' with the following payload: ${JSON.stringify(payload)}`);
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