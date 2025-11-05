// backend/src/index.ts
// This file acts as the main entry point for the old verification backend service.
import app from './api/verifyPaper';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Verification service is running on http://localhost:${PORT}`);
});