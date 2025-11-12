import {
  Dataset,
  Model,
  PipelineJob,
  VertexAI,
} from '@google-cloud/aiplatform';

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT,
  location: process.env.GCLOUD_LOCATION,
});

export async function startFineTuningJob(datasetId: string, modelId: string) {
  // Create a new pipeline job
  const pipelineJob = new PipelineJob({
    displayName: `Fine-tune ${modelId}`,
    templateUri:
      'https://us-kfp.pkg.dev/ml-pipeline/large-language-model-pipelines/tune-large-model/v2.0.0',
    parameterValues: {
      project: process.env.GCLOUD_PROJECT,
      model_display_name: modelId,
      dataset_uri: `https://googleapis.com/v1/projects/${process.env.GCLOUD_PROJECT}/locations/${process.env.GCLOUD_LOCATION}/datasets/${datasetId}`,
      location: process.env.GCLOUD_LOCATION,
      large_model_reference: modelId,
      train_steps: 300,
    },
  });

  // Run the pipeline job
  const [response] = await pipelineJob.run();
  return response;
}
