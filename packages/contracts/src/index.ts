export interface HealthResponse {
  status: 'ok';
  service: 'recruitops-api';
  timestamp: string;
}

export * from './jobs.js';
export * from './content.js';
export * from './social.js';
export * from './publication.js';
export * from './candidates.js';
export * from './files.js';
export * from './integrations.js';
