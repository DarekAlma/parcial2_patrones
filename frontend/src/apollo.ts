import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, from } from '@apollo/client';
import { print } from 'graphql';

export type OperationEntry = {
  id: number;
  name: string;
  kind: 'query' | 'mutation';
  query: string;
  variables: Record<string, unknown>;
  ms: number;
  bytes: number;
  errors: number;
  at: string;
};

// Registro de operaciones GraphQL para el "Inspector": permite mostrar en la
// demo que el frontend SOLO habla GraphQL y qué campos exactos pide.
const listeners = new Set<(entries: OperationEntry[]) => void>();
let entries: OperationEntry[] = [];
let nextId = 1;

export function subscribeOperations(fn: (e: OperationEntry[]) => void) {
  listeners.add(fn);
  fn(entries);
  return () => listeners.delete(fn);
}

const inspectorLink = new ApolloLink((operation, forward) => {
  const started = performance.now();
  const definition = operation.query.definitions.find((d) => d.kind === 'OperationDefinition');
  const kind: OperationEntry['kind'] =
    definition && 'operation' in definition && definition.operation === 'mutation' ? 'mutation' : 'query';
  return forward(operation).map((result) => {
    entries = [
      {
        id: nextId++,
        name: operation.operationName || 'anónima',
        kind,
        query: print(operation.query),
        variables: operation.variables,
        ms: Math.round(performance.now() - started),
        bytes: new Blob([JSON.stringify(result)]).size,
        errors: result.errors?.length ?? 0,
        at: new Date().toLocaleTimeString(),
      },
      ...entries,
    ].slice(0, 40);
    listeners.forEach((fn) => fn(entries));
    return result;
  });
});

export const client = new ApolloClient({
  // Mismo origen: Nginx reenvía /graphql al API Gateway. La cookie de sesión
  // es httpOnly + SameSite=Strict y viaja sola.
  link: from([inspectorLink, new HttpLink({ uri: '/graphql', credentials: 'same-origin' })]),
  cache: new InMemoryCache({
    typePolicies: {
      PackageSearch: { keyFields: ['searchKey'] },
      TripWindow: { keyFields: ['searchKey'] },
    },
  }),
  defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
});
