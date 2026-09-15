import axios from 'axios';

export interface GnoSearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, any>;
}

export interface GnoResponse {
  results: GnoSearchResult[];
}

export interface GnoAskResponse {
  answer: string;
  citations: string[];
}

class GnoService {
  private baseUrl: string = 'http://localhost:3000/api';

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  async checkStatus(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/status`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async query(query: string, limit: number = 10): Promise<GnoSearchResult[]> {
    try {
      const response = await axios.post(`${this.baseUrl}/query`, {
        query,
        limit
      });
      return response.data.results || [];
    } catch (error) {
      console.error('GNO Query Error:', error);
      throw error;
    }
  }

  async ask(query: string): Promise<GnoAskResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/ask`, {
        query
      });
      return response.data;
    } catch (error) {
      console.error('GNO Ask Error:', error);
      throw error;
    }
  }

  // Note: GNO typically indexes a local directory. 
  // If the API supports adding documents directly, we would implement it here.
  // For now, we assume the user manages the GNO directory separately.
}

export const gnoService = new GnoService();
