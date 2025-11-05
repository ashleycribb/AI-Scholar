// agent-backend/src/index.ts
import app from './app';

const PORT = process.env.PORT || 3002; // Use a different port than the old backend (3001)

app.listen(PORT, () => {
  console.log(`AI Research Explorer Agent Backend listening on port ${PORT}`);
  console.log(`Access test endpoint at http://localhost:${PORT}/api/test`);
});