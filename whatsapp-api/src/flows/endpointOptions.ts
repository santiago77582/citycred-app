import { config } from '../config.js';

export function endpointOptions() {
  const enabled = process.env.FLOW_ENDPOINT_ENABLED === 'true';
  const material = process.env.FLOW_ENDPOINT_MATERIAL?.replace(/\\n/g, '\n');
  const storage = process.env.FLOW_STORAGE_MATERIAL;
  return {
    enabled,
    material,
    storage,
    initialScreen: process.env.FLOW_INITIAL_SCREEN || 'INICIO',
    signatureSecret: config.META_APP_SECRET
  };
}
