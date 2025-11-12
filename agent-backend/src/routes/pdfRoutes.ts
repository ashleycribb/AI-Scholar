// agent-backend/src/routes/pdfRoutes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { processPdf } from '../services/pdfProcessingService';
import { ModelDefinition } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('pdf'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  try {
    const model: ModelDefinition = req.body.model ? JSON.parse(req.body.model) : { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' };
    const paper = await processPdf(req.file, model);
    res.json(paper);
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    res.status(500).json({
      error: 'Failed to process PDF.',
      details: error.message || 'Unknown error.'
    });
  }
});

export default router;
