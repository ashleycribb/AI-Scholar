// services/sourceDiscoveryService.ts
import axios from 'axios';
import type { 
  DiscoveredSource, 
  SourceProposalResult, 
  LibraryMcpProspectusConfig 
} from '../types';
import { csrfHeaders } from './csrf';

export interface SourcesRegistryResponse {
  discovered: DiscoveredSource[];
  approved: DiscoveredSource[];
  recipientEmail: string;
  lastScanAt: string;
}

export const fetchSourcesRegistry = async (): Promise<SourcesRegistryResponse> => {
  const res = await axios.get('/api/sources/registry');
  return res.data;
};

export const testSourceEndpoint = async (sourceId: string, url?: string): Promise<{
  online: boolean;
  status: number;
  latencyMs: number;
  dataSnippet?: string;
  error?: string;
}> => {
  const res = await axios.post('/api/sources/test-endpoint', { sourceId, url }, { headers: await csrfHeaders() });
  return res.data;
};

export const proposeSourceByEmail = async (
  sourceId: string, 
  recipientEmail?: string
): Promise<SourceProposalResult> => {
  const res = await axios.post('/api/sources/propose', { sourceId, recipientEmail }, { headers: await csrfHeaders() });
  return res.data;
};

export const approveSource = async (sourceId: string): Promise<{ success: boolean; source: DiscoveredSource }> => {
  const res = await axios.post(`/api/sources/approve/${encodeURIComponent(sourceId)}`, undefined, { headers: await csrfHeaders() });
  return res.data;
};

export const rejectSource = async (sourceId: string): Promise<{ success: boolean; source: DiscoveredSource }> => {
  const res = await axios.post(`/api/sources/reject/${encodeURIComponent(sourceId)}`, undefined, { headers: await csrfHeaders() });
  return res.data;
};

export const addCustomDiscoveredSource = async (
  source: Partial<DiscoveredSource>
): Promise<{ success: boolean; source: DiscoveredSource }> => {
  const res = await axios.post('/api/sources/custom', source, { headers: await csrfHeaders() });
  return res.data;
};

export const generateLibraryProspectus = async (config: LibraryMcpProspectusConfig): Promise<{
  title: string;
  markdown: string;
  mcpServerConfigJson: string;
  summary: string;
}> => {
  const res = await axios.post('/api/library-mcp/prospectus', config);
  return res.data;
};
