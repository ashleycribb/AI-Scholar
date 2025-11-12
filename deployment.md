# Manual Deployment to Google Cloud Run

This document provides the commands needed to manually deploy the frontend and backend services to Google Cloud Run.

## Prerequisites

1.  **Google Cloud SDK:** Make sure you have the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and configured on your local machine.
2.  **Docker:** You'll need [Docker](https://docs.docker.com/get-docker/) installed to build the container images.
3.  **Authentication:** Authenticate with Google Cloud:
    ```bash
    gcloud auth login
    gcloud auth configure-docker
    ```
4.  **Project ID and Artifact Registry:** Replace `YOUR_PROJECT_ID` and `YOUR_ARTIFACT_REGISTRY_REPO` with your actual Google Cloud project ID and Artifact Registry repository name in the commands below.
5.  **Google Secret Manager:** Create secrets in Google Secret Manager for the following:
    *   `GEMINI_API_KEY`
    *   `UNPAYWALL_EMAIL`
    *   `ENTAILMENT_URL`
    *   `MODEL_API_KEY`

## Build and Push the Images

### Agent Backend

```bash
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/agent-backend:latest -f agent-backend/Dockerfile .
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/agent-backend:latest
```

### Backend

```bash
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/backend:latest -f backend/Dockerfile .
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/backend:latest
```

### Frontend

```bash
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/frontend:latest .
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/frontend:latest
```

## Deploy to Cloud Run

### Agent Backend

```bash
gcloud run deploy agent-backend \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/agent-backend:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --update-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest
```

### Backend

```bash
gcloud run deploy backend \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/backend:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --update-secrets=UNPAYWALL_EMAIL=UNPAYWALL_EMAIL:latest,ENTAILMENT_URL=ENTAILMENT_URL:latest,MODEL_API_KEY=MODEL_API_KEY:latest
```

### Frontend

```bash
gcloud run deploy frontend \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_ARTIFACT_REGISTRY_REPO/frontend:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated
```
