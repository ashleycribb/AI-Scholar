// backend/src/routes/verifyPaper.ts
import { Router } from 'express';
import { verifyPaper } from '../controllers/verifyPaperController';

const router = Router();

router.post('/verifyPaper', verifyPaper);

export default router;
