import app from './api/verifyPaper';

// In a real environment, the PORT would be set by the hosting provider.
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Verification service is running on http://localhost:${PORT}`);
});
