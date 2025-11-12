// agent-backend/src/services/pdfProcessingService.ts
import pdf from 'pdf-parse';
import { ResearchPaper } from '../types';
import * as AiService from './aiService';
import { ModelDefinition } from '../types/index.js';

const metadataExtractionSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The title of the research paper.' },
    authors: { type: 'array', items: { type: 'string' }, description: 'A list of the authors of the paper.' },
    abstract: { type: 'string', description: 'The abstract of the paper.' },
    year: { type: 'number', description: 'The publication year of the paper.' },
  },
  required: ['title', 'authors', 'abstract', 'year'],
};

export async function processPdf(file: Express.Multer.File, model: ModelDefinition): Promise<Partial<ResearchPaper>> {
  // 1. Extract raw text from the PDF
  const data = await pdf(file.buffer);
  const rawText = data.text;

  // 2. Use an AI call to extract metadata from the raw text
  const prompt = `From the following raw text extracted from a PDF, please extract the title, authors, abstract, and publication year.

  **Raw Text:**
  ${rawText.substring(0, 4000)}

  Return the result as a JSON object.`;

  try {
    const extractedMetadata = await AiService.generateJsonWithModel(prompt, model, metadataExtractionSchema);

    // 3. Construct and return a ResearchPaper object
    return {
      id: `upload_${Date.now()}`,
      title: extractedMetadata.title || 'Unknown Title',
      authors: extractedMetadata.authors || [],
      year: extractedMetadata.year || new Date().getFullYear(),
      abstract: extractedMetadata.abstract || 'No abstract found.',
      source: 'Uploaded PDF',
    };
  } catch (error) {
    console.error('Failed to extract metadata from PDF:', error);
    throw new Error('AI metadata extraction failed.');
  }
}
