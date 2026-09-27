// Cliente GraphQL mínimo con "cookie jar", para los scripts de verificación.
// Habla con el MISMO endpoint que el navegador (Nginx -> Gateway).
export const ENDPOINT = process.env.GRAPHQL_URL || 'http://127.0.0.1:8080/graphql';

export class GqlClient {
  constructor(cookie = null) {
    this.cookie = cookie;
  }

  async request(query, variables = {}, { rawHeaders = {} } = {}) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...rawHeaders,
      },
      body: JSON.stringify({ query, variables }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/wsid=[^;]+/);
      if (match) this.cookie = match[0];
    }
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body, setCookie };
  }

  async data(query, variables) {
    const { body } = await this.request(query, variables);
    if (body.errors?.length) {
      const err = new Error(body.errors.map((e) => `${e.extensions?.code}: ${e.message}`).join(' | '));
      err.errors = body.errors;
      throw err;
    }
    return body.data;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

export function randomUser(prefix = 'demo') {
  const id = Math.random().toString(36).slice(2, 8);
  return { email: `${prefix}.${id}@wandersync.test`, fullName: `Usuario ${prefix} ${id}`, password: `Viajes${id}2026` };
}
