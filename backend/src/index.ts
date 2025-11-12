// backend/src/index.ts
import app from './server';
import config from './config';

app.listen(config.port, () => {
  console.log(`Verification service is running on http://localhost:${config.port}`);
});