// services/lrsService.ts
// Handles Yet SQL LRS, learnmcp-xapi, and DuckDB Vertical LRS xAPI statement tracking.
import { authService } from './authService';

export interface xAPIActor {
  objectType?: 'Agent' | 'Group';
  name: string;
  mbox?: string;
  account?: {
    homePage: string;
    name: string;
  };
}

export interface xAPIVerb {
  id: string;
  display: {
    [lang: string]: string;
  };
}

export interface xAPIObject {
  id: string;
  objectType?: string;
  definition?: {
    name?: { [lang: string]: string };
    description?: { [lang: string]: string };
    type?: string;
  };
}

export interface xAPIContext {
  registration?: string;
  sessionUuid?: string;
  platform?: string;
  language?: string;
  extensions?: Record<string, any>;
}

export interface xAPIStatement {
  id: string;
  actor: xAPIActor;
  verb: xAPIVerb;
  object: xAPIObject;
  result?: Record<string, any>;
  context?: xAPIContext;
  timestamp: string;
  stored?: string;
  lrsTarget: 'yet-sql-lrs' | 'duckdb-vertical-lrs';
}

export interface LrsSystemStatus {
  yetSqlLrs: {
    status: 'active' | 'degraded' | 'offline';
    totalStatements: number;
    dbEngine: string;
    endpoint: string;
    githubRepo: string;
  };
  learnMcpXapi: {
    status: 'active' | 'degraded' | 'offline';
    version: string;
    mcpToolsRegistered: number;
    githubRepo: string;
  };
  duckDbVerticalLrs: {
    status: 'active' | 'degraded' | 'offline';
    totalStatements: number;
    dbEngine: string;
    activeSessionsCount: number;
    endpoint: string;
    githubRepo: string;
  };
}

/**
 * Standard UUID v4 generator for execution session tracking
 */
export const generateSessionUuid = (prefix = 'session'): string => {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return `${prefix}-${uuid}`;
};

// In-memory local stores for client-side resilience
const localSqlLrsStatements: xAPIStatement[] = [];
const localDuckDbLrsStatements: xAPIStatement[] = [];

/**
 * Record a Human User Action in Yet SQL LRS
 */
export const recordUserStatement = async (
  actorName: string,
  verbId: string,
  verbDisplay: string,
  objectId: string,
  objectName: string,
  contextData?: { sessionUuid?: string; [key: string]: any }
): Promise<xAPIStatement> => {
  const activeUser = authService.getUser();
  const resolvedActorName = activeUser?.displayName || activeUser?.name || actorName || 'Scholar Explorer Participant';
  const resolvedUserId = activeUser?.userId || activeUser?.id || 'participant-anonymous';
  const resolvedSessionId = contextData?.sessionUuid || activeUser?.sessionId;

  const statement: xAPIStatement = {
    id: generateSessionUuid('stmt'),
    actor: {
      objectType: 'Agent',
      name: resolvedActorName,
      account: {
        homePage: 'https://scholar-explorer.com/dbr-study',
        name: resolvedUserId
      }
    },
    verb: {
      id: verbId,
      display: { 'en-US': verbDisplay }
    },
    object: {
      id: objectId,
      objectType: 'Activity',
      definition: {
        name: { 'en-US': objectName }
      }
    },
    context: {
      platform: 'Scholar Explorer Web Client',
      sessionUuid: resolvedSessionId,
      extensions: {
        ...contextData,
        userRole: activeUser?.role || 'participant',
        inviteCode: activeUser?.inviteCode,
        interactionSessionId: resolvedSessionId
      }
    },
    timestamp: new Date().toISOString(),
    stored: new Date().toISOString(),
    lrsTarget: 'yet-sql-lrs'
  };

  localSqlLrsStatements.unshift(statement);

  // Send to backend API
  try {
    await fetch('/api/lrs/sql-lrs/statements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statement)
    });
  } catch (err) {
    console.warn('[Yet SQL LRS] Server endpoint sync notice:', err);
  }

  return statement;
};

/**
 * Record an AI Agent Action in DuckDB Vertical LRS
 */
export const recordAgentStatement = async (
  agentName: 'AI Source Scout' | 'Deep Research Assistant' | string,
  sessionUuid: string,
  verbId: string,
  verbDisplay: string,
  objectId: string,
  objectName: string,
  resultDetails?: Record<string, any>
): Promise<xAPIStatement> => {
  const statement: xAPIStatement = {
    id: generateSessionUuid('agent-stmt'),
    actor: {
      objectType: 'Agent',
      name: agentName,
      account: {
        homePage: 'https://scholar-explorer.com/agents',
        name: agentName.toLowerCase().replace(/\s+/g, '-')
      }
    },
    verb: {
      id: verbId,
      display: { 'en-US': verbDisplay }
    },
    object: {
      id: objectId,
      objectType: 'Activity',
      definition: {
        name: { 'en-US': objectName }
      }
    },
    result: resultDetails,
    context: {
      platform: 'Scholar Explorer Autonomous Engine',
      sessionUuid: sessionUuid,
      extensions: {
        agentName,
        sessionUuid,
        ...resultDetails
      }
    },
    timestamp: new Date().toISOString(),
    stored: new Date().toISOString(),
    lrsTarget: 'duckdb-vertical-lrs'
  };

  localDuckDbLrsStatements.unshift(statement);

  // Send to backend API
  try {
    await fetch('/api/lrs/duckdb-lrs/statements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statement)
    });
  } catch (err) {
    console.warn('[DuckDB Vertical LRS] Server endpoint sync notice:', err);
  }

  return statement;
};

/**
 * Fetch LRS Status
 */
export const fetchLrsStatus = async (): Promise<LrsSystemStatus> => {
  try {
    const res = await fetch('/api/lrs/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[LRS Service] Could not reach backend status endpoint, returning local fallback:', e);
  }

  return {
    yetSqlLrs: {
      status: 'active',
      totalStatements: localSqlLrsStatements.length,
      dbEngine: 'Yet SQL LRS (PostgreSQL / SQLite Engine)',
      endpoint: '/api/lrs/sql-lrs/statements',
      githubRepo: 'https://github.com/yetanalytics/lrsql'
    },
    learnMcpXapi: {
      status: 'active',
      version: '0.1.0-learnmcp',
      mcpToolsRegistered: 3,
      githubRepo: 'https://github.com/DavidLMS/learnmcp-xapi'
    },
    duckDbVerticalLrs: {
      status: 'active',
      totalStatements: localDuckDbLrsStatements.length,
      dbEngine: 'DuckDB Vertical Columnar Engine',
      activeSessionsCount: new Set(localDuckDbLrsStatements.map(s => s.context?.sessionUuid).filter(Boolean)).size,
      endpoint: '/api/lrs/duckdb-lrs/statements',
      githubRepo: 'https://github.com/duckdb/duckdb'
    }
  };
};

/**
 * Fetch Human User Statements from Yet SQL LRS
 */
export const fetchUserSqlLrsStatements = async (userRole?: string, userName?: string): Promise<xAPIStatement[]> => {
  try {
    const params = new URLSearchParams();
    if (userRole) params.append('role', userRole);
    if (userName) params.append('userName', userName);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    
    const res = await fetch(`/api/lrs/sql-lrs/statements${queryString}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.statements)) return data.statements;
    }
  } catch (e) {
    console.warn('[Yet SQL LRS] Fetching local fallback:', e);
  }

  // Local Fallback Filtering
  if (userRole !== 'researcher' && userName) {
    return localSqlLrsStatements.filter(s => 
      s.actor.name.toLowerCase() === userName.toLowerCase() ||
      s.actor.account?.name.toLowerCase() === userName.toLowerCase()
    );
  }
  return localSqlLrsStatements;
};

/**
 * Fetch AI Agent Statements from DuckDB Vertical LRS
 */
export const fetchAgentDuckDbStatements = async (sessionUuid?: string, userRole?: string, userName?: string): Promise<xAPIStatement[]> => {
  try {
    const params = new URLSearchParams();
    if (sessionUuid) params.append('sessionUuid', sessionUuid);
    if (userRole) params.append('role', userRole);
    if (userName) params.append('userName', userName);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`/api/lrs/duckdb-lrs/statements${queryString}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.statements)) return data.statements;
    }
  } catch (e) {
    console.warn('[DuckDB Vertical LRS] Fetching local fallback:', e);
  }

  // Local Fallback Filtering
  if (userRole !== 'researcher') {
    if (sessionUuid) {
      return localDuckDbLrsStatements.filter(s => s.context?.sessionUuid === sessionUuid);
    }
    return [];
  }
  if (sessionUuid) {
    return localDuckDbLrsStatements.filter(s => s.context?.sessionUuid === sessionUuid);
  }
  return localDuckDbLrsStatements;
};
