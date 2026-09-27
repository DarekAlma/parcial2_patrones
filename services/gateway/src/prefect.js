// Cliente mínimo de la API REST de Prefect para disparar la ingesta.
import { GraphQLError } from 'graphql';
import { config } from './config.js';

async function prefect(path, options = {}) {
  let response;
  try {
    response = await fetch(`${config.prefectApiUrl}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GraphQLError('Prefect no está disponible', { extensions: { code: 'SERVICE_UNAVAILABLE' } });
  }
  if (!response.ok) {
    throw new GraphQLError(`Prefect respondió ${response.status}`, { extensions: { code: 'SERVICE_UNAVAILABLE' } });
  }
  return response.json();
}

export const flowRunUrl = (id) => (id ? `${config.publicLinks.prefectUrl}/runs/flow-run/${id}` : null);

export async function triggerIngestion(chaosFailRate) {
  const deployment = await prefect(`/deployments/name/${config.ingestionDeployment}`);
  const run = await prefect(`/deployments/${deployment.id}/create_flow_run`, {
    method: 'POST',
    body: JSON.stringify({ parameters: { chaos_fail_rate: chaosFailRate }, tags: ['frontend', 'graphql'] }),
  });
  return { flowRunId: run.id, flowRunName: run.name, flowRunUrl: flowRunUrl(run.id) };
}
