const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  production: env.NODE_ENV === 'production',
  sessionSecret: env.SESSION_SECRET,
  cookieSecure: env.COOKIE_SECURE === 'true',
  introspection: env.GRAPHQL_INTROSPECTION !== 'false',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  services: {
    flights: env.FLIGHTS_URL || 'http://flights:4101',
    hotels: env.HOTELS_URL || 'http://hotels:4102',
    cars: env.CARS_URL || 'http://cars:4103',
    orders: env.ORDERS_URL || 'http://orders:4104',
    orchestrator: env.ORCHESTRATOR_URL || 'http://saga-orchestrator:4040',
  },
  prefectApiUrl: env.PREFECT_API_URL || 'http://prefect-server:4200/api',
  ingestionDeployment: env.INGESTION_DEPLOYMENT || 'ingesta-turistica-distribuida/ingesta-programada',
  publicLinks: {
    prefectUrl: env.PUBLIC_PREFECT_URL || 'http://127.0.0.1:4200',
    daskDashboardUrl: env.PUBLIC_DASK_URL || 'http://127.0.0.1:8787/status',
    graphqlUrl: env.PUBLIC_GRAPHQL_URL || 'http://127.0.0.1:4000/graphql',
  },
};

if (!config.sessionSecret || config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres (ver .env.example)');
}

export const DESTINATION_NAMES = {
  CTG: 'Cartagena',
  SMR: 'Santa Marta',
  MDE: 'Medellín',
  CLO: 'Cali',
  ADZ: 'San Andrés',
  BOG: 'Bogotá',
};
