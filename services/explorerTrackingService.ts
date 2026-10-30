/**
 * services/explorerTrackingService.ts
 * 
 * Manages the "Explorer" mode xAPI 1.0.3 telemetry:
 * - Anonymous Device ID actor: account { homePage: appUrl + "/explorer", name: deviceId } (NO name, NO email)
 * - AI actor: account { homePage: appUrl + "/agents", name: agent slug }
 * - Profile IRI: https://ashecribb.dev/xapi/profiles/scholar-explorer-usage/v1
 * - Registration: visit ID (new UUID v4 per app open)
 * - Verbs: searched, prompted, ai-responded, viewed-source, exported
 * - Automatic scrubbing of PII (emails, phone numbers, 6+ digit strings) to [redacted]
 * - Separate Explorer LRS credentials with FIFO outbox queueing
 */

import { 
  getExplorerDeviceId, 
  getExplorerCredentials, 
  enqueueOutboxStatement, 
  addPastExplorerSearch,
  getResearchLoggingConsent
} from './lrsCredentialsService';
import { flushOutbox, generateStatementUuid, getAppUrl } from './s3aOutboxService';
import { scrubText } from '../utils/textScrubber';

export const EXPLORER_PROFILE_CATEGORY_IRI = 'https://ashecribb.dev/xapi/profiles/scholar-explorer-usage/v1';

export const EXPLORER_VERBS = {
  SEARCHED: 'https://ashecribb.dev/xapi/verbs/searched',
  PROMPTED: 'https://ashecribb.dev/xapi/verbs/prompted',
  AI_RESPONDED: 'https://ashecribb.dev/xapi/verbs/ai-responded',
  VIEWED_SOURCE: 'https://ashecribb.dev/xapi/verbs/viewed-source',
  EXPORTED: 'https://ashecribb.dev/xapi/verbs/exported'
} as const;

export const EXTENSIONS = {
  RESULT_COUNT: 'https://ashecribb.dev/xapi/ext/result-count',
  FILTERS: 'https://ashecribb.dev/xapi/ext/filters',
  AGENT: 'https://ashecribb.dev/xapi/ext/agent',
  MODEL: 'https://ashecribb.dev/xapi/ext/model',
  ACTION: 'https://ashecribb.dev/xapi/ext/action',
  SOURCES: 'https://ashecribb.dev/xapi/ext/sources',
  TOKENS: 'https://ashecribb.dev/xapi/ext/tokens',
  TRUNCATED: 'https://ashecribb.dev/xapi/ext/truncated',
  FORMAT: 'https://ashecribb.dev/xapi/ext/format',
  COUNT: 'https://ashecribb.dev/xapi/ext/count',
  ITEMS: 'https://ashecribb.dev/xapi/ext/items'
} as const;

// Visit ID: new UUID v4 generated per app open
export const APP_VISIT_ID = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

/**
 * Builds the anonymous Explorer actor:
 * account: { homePage: appUrl + "/explorer", name: deviceId }
 * Strictly NO name and NO email.
 */
async function buildExplorerActor(): Promise<any> {
  const deviceId = await getExplorerDeviceId();
  const appUrl = getAppUrl();
  return {
    objectType: 'Agent',
    account: {
      homePage: `${appUrl}/explorer`,
      name: deviceId
    }
  };
}

/**
 * Builds the AI actor:
 * account: { homePage: appUrl + "/agents", name: agentSlug }
 */
function buildAiActor(agentSlug: string): any {
  const appUrl = getAppUrl();
  return {
    objectType: 'Agent',
    account: {
      homePage: `${appUrl}/agents`,
      name: agentSlug
    }
  };
}

/**
 * Common context wrapper with Usage Profile IRI and visit ID registration
 */
function buildExplorerContext(extraExtensions: Record<string, any> = {}): any {
  return {
    registration: APP_VISIT_ID,
    contextActivities: {
      category: [
        {
          id: EXPLORER_PROFILE_CATEGORY_IRI,
          objectType: 'Activity'
        }
      ]
    },
    ...(Object.keys(extraExtensions).length > 0 ? { extensions: extraExtensions } : {})
  };
}

/**
 * Track human search action in Explorer mode
 * Verb: https://ashecribb.dev/xapi/verbs/searched
 */
export async function trackExplorerSearch(
  query: string,
  resultCount: number,
  filters: Record<string, any> = {}
): Promise<string> {
  if (!query) return '';
  const consented = await getResearchLoggingConsent();
  if (!consented) return '';
  const statementId = generateStatementUuid();
  const actor = await buildExplorerActor();
  const scrubbedQuery = scrubText(query);

  // Store in past searches for transition to Researcher mode
  await addPastExplorerSearch(query);

  const statement = {
    id: statementId,
    actor,
    verb: {
      id: EXPLORER_VERBS.SEARCHED,
      display: { 'en-US': 'searched' }
    },
    object: {
      id: 'https://ashecribb.dev/xapi/activities/search',
      objectType: 'Activity',
      definition: {
        name: { 'en-US': 'Literature Search' },
        type: 'http://activitystrea.ms/schema/1.0/search'
      }
    },
    result: {
      response: scrubbedQuery,
      extensions: {
        [EXTENSIONS.RESULT_COUNT]: resultCount,
        [EXTENSIONS.FILTERS]: filters
      }
    },
    context: buildExplorerContext(),
    timestamp: new Date().toISOString()
  };

  await enqueueOutboxStatement(statement, APP_VISIT_ID);
  flushOutbox().catch(() => {});
  return statementId;
}

/**
 * Track human prompt sent to the AI Assistant in Explorer mode
 * Verb: https://ashecribb.dev/xapi/verbs/prompted
 */
export async function trackExplorerPrompt(
  promptText: string,
  agentSlug = 'research-assistant',
  modelName = 'gemini-3.8-flash'
): Promise<string> {
  const consented = await getResearchLoggingConsent();
  if (!consented) return '';
  const statementId = generateStatementUuid();
  const actor = await buildExplorerActor();
  const scrubbedPrompt = scrubText(promptText);

  const statement = {
    id: statementId,
    actor,
    verb: {
      id: EXPLORER_VERBS.PROMPTED,
      display: { 'en-US': 'prompted' }
    },
    object: {
      id: 'https://ashecribb.dev/xapi/activities/ai-prompt',
      objectType: 'Activity',
      definition: {
        name: { 'en-US': 'AI Assistant Prompt' }
      }
    },
    result: {
      response: scrubbedPrompt
    },
    context: buildExplorerContext({
      [EXTENSIONS.AGENT]: agentSlug,
      [EXTENSIONS.MODEL]: modelName
    }),
    timestamp: new Date().toISOString()
  };

  await enqueueOutboxStatement(statement, APP_VISIT_ID);
  flushOutbox().catch(() => {});
  return statementId;
}

/**
 * Track AI answer response in Explorer mode
 * Verb: https://ashecribb.dev/xapi/verbs/ai-responded
 * - Truncates AI answer to 8,000 characters and sets truncated: true if cut
 * - StatementRef to the prompted statement
 */
export async function trackExplorerAiResponse(params: {
  promptedStatementId: string;
  aiAnswerText: string;
  agentSlug?: string;
  action?: 'summarized' | 'recommended-sources' | 'explained' | 'compared' | 'drafted-citation';
  sources?: string[]; // OpenAlex IDs
  tokens?: number;
}): Promise<string> {
  const consented = await getResearchLoggingConsent();
  if (!consented) return '';
  const statementId = generateStatementUuid();
  const agent = params.agentSlug || 'research-assistant';
  const actor = buildAiActor(agent);

  // PII Scrubbing
  const scrubbedAnswer = scrubText(params.aiAnswerText || '');

  // Truncate to 8,000 chars if longer
  const isTruncated = scrubbedAnswer.length > 8000;
  const finalAnswer = isTruncated ? scrubbedAnswer.slice(0, 8000) : scrubbedAnswer;

  const resultExtensions: Record<string, any> = {
    [EXTENSIONS.ACTION]: params.action || 'explained',
    [EXTENSIONS.SOURCES]: params.sources || [],
    [EXTENSIONS.TOKENS]: params.tokens ?? Math.ceil(finalAnswer.length / 4)
  };
  if (isTruncated) {
    resultExtensions[EXTENSIONS.TRUNCATED] = true;
  }

  const context = buildExplorerContext();
  context.statement = {
    id: params.promptedStatementId,
    objectType: 'StatementRef'
  };

  const statement = {
    id: statementId,
    actor,
    verb: {
      id: EXPLORER_VERBS.AI_RESPONDED,
      display: { 'en-US': 'ai-responded' }
    },
    object: {
      id: `https://ashecribb.dev/xapi/activities/ai-response/${statementId}`,
      objectType: 'Activity',
      definition: {
        name: { 'en-US': `AI Response by ${agent}` }
      }
    },
    result: {
      response: finalAnswer,
      extensions: resultExtensions
    },
    context,
    timestamp: new Date().toISOString()
  };

  await enqueueOutboxStatement(statement, APP_VISIT_ID);
  flushOutbox().catch(() => {});
  return statementId;
}

/**
 * Track viewing an OpenAlex source paper in Explorer mode
 * Verb: https://ashecribb.dev/xapi/verbs/viewed-source
 */
export async function trackExplorerViewSource(paper: {
  id: string;
  title: string;
  openalex_id?: string;
}): Promise<string> {
  const consented = await getResearchLoggingConsent();
  if (!consented) return '';
  const statementId = generateStatementUuid();
  const actor = await buildExplorerActor();

  const rawId = (paper.openalex_id || paper.id || '').trim();
  if (!rawId) return '';
  const openalexIri = rawId.startsWith('http') ? rawId : `https://openalex.org/${rawId}`;

  const statement = {
    id: statementId,
    actor,
    verb: {
      id: EXPLORER_VERBS.VIEWED_SOURCE,
      display: { 'en-US': 'viewed-source' }
    },
    object: {
      id: openalexIri,
      objectType: 'Activity',
      definition: {
        name: { 'en-US': paper.title || 'Academic Paper' },
        type: 'http://activitystrea.ms/schema/1.0/article'
      }
    },
    context: buildExplorerContext(),
    timestamp: new Date().toISOString()
  };

  await enqueueOutboxStatement(statement, APP_VISIT_ID);
  flushOutbox().catch(() => {});
  return statementId;
}

/**
 * Track export action in Explorer mode (BibTeX, RIS, CSV)
 * Verb: https://ashecribb.dev/xapi/verbs/exported
 */
export async function trackExplorerExport(
  format: 'bibtex' | 'ris' | 'csv',
  items: { id: string; title: string }[]
): Promise<string> {
  const consented = await getResearchLoggingConsent();
  if (!consented) return '';
  const statementId = generateStatementUuid();
  const actor = await buildExplorerActor();

  const itemIris = items
    .map(p => (p.id || '').trim())
    .filter(Boolean)
    .map(raw => (raw.startsWith('http') ? raw : `https://openalex.org/${raw}`));

  const statement = {
    id: statementId,
    actor,
    verb: {
      id: EXPLORER_VERBS.EXPORTED,
      display: { 'en-US': 'exported' }
    },
    object: {
      id: 'https://ashecribb.dev/xapi/activities/export',
      objectType: 'Activity',
      definition: {
        name: { 'en-US': `Exported Sources (${format.toUpperCase()})` }
      }
    },
    result: {
      extensions: {
        [EXTENSIONS.FORMAT]: format,
        [EXTENSIONS.COUNT]: items.length,
        [EXTENSIONS.ITEMS]: itemIris
      }
    },
    context: buildExplorerContext(),
    timestamp: new Date().toISOString()
  };

  await enqueueOutboxStatement(statement, APP_VISIT_ID);
  flushOutbox().catch(() => {});
  return statementId;
}
