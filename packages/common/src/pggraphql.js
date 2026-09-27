/**
 * Cliente de pg_graphql: ejecuta una operación GraphQL DENTRO de Postgres
 * con la función `graphql.resolve(query, variables)`.
 *
 * Es el mismo motor que Supabase expone en /graphql/v1, pero invocado por la
 * conexión SQL del servicio: no necesita API keys adicionales.
 */
export async function pgGraphql(pool, query, variables = {}) {
  const { rows } = await pool.query('select graphql.resolve($1, $2::jsonb) as result', [
    query,
    JSON.stringify(variables),
  ]);
  const { data, errors } = rows[0].result;
  if (errors?.length) {
    const err = new Error(`pg_graphql: ${errors.map((e) => e.message).join('; ')}`);
    err.graphqlErrors = errors;
    throw err;
  }
  return data;
}

/** Aplana `{ edges: [{ node }] }` -> `[node]`. */
export const nodes = (collection) => (collection?.edges ?? []).map((edge) => edge.node);

/**
 * Construye la selección de campos a partir de lo que pidió el cliente,
 * filtrando contra una lista blanca. Así el Gateway propaga la proyección y
 * pg_graphql lee solo esas columnas (sin over-fetching de punta a punta).
 */
export function selection(requested, allowed, always = ['id']) {
  const wanted = String(requested || '')
    .split(',')
    .map((f) => f.trim())
    .filter((f) => allowed.includes(f));
  const fields = new Set([...always, ...(wanted.length ? wanted : allowed)]);
  return [...fields].join(' ');
}
