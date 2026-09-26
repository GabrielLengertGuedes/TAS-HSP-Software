const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startServer } = require('./helpers/server');

const FORCE_COLLISION = path.join(__dirname, 'helpers', 'force-collision.js');

function postLink(baseUrl, body, contentType = 'application/json') {
  return fetch(`${baseUrl}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function assertApiError(res, status, code) {
  assert.equal(res.status, status);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
}

describe('POST /api/links', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await server.stop(); });

  it('cria o link e responde 201 com code, shortUrl e originalUrl', async () => {
    const res = await postLink(server.baseUrl, { url: 'https://example.com/pagina' });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.code, /^[a-zA-Z0-9]{6}$/);
    assert.equal(body.shortUrl, `${server.baseUrl}/${body.code}`);
    assert.equal(body.originalUrl, 'https://example.com/pagina');

    const row = server.db.prepare('SELECT original_url, clicks FROM links WHERE code = ?').get(body.code);
    assert.deepEqual({ ...row }, { original_url: 'https://example.com/pagina', clicks: 0 });
  });

  it('normaliza a URL (espaços, host em minúsculas, caracteres codificados)', async () => {
    const res = await postLink(server.baseUrl, { url: '  HTTPS://Exemplo.COM/a b  ' });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).originalUrl, 'https://exemplo.com/a%20b');
  });

  it('gera códigos diferentes para a mesma URL', async () => {
    const first = await (await postLink(server.baseUrl, { url: 'https://example.com/igual' })).json();
    const second = await (await postLink(server.baseUrl, { url: 'https://example.com/igual' })).json();
    assert.notEqual(first.code, second.code);
  });

  const invalidCases = [
    ['objeto sem url', {}, 'INVALID_URL'],
    ['url vazia', { url: '' }, 'EMPTY_URL'],
    ['url só com espaços', { url: '   ' }, 'EMPTY_URL'],
    ['url numérica', { url: 123 }, 'INVALID_URL'],
    ['url nula', { url: null }, 'INVALID_URL'],
    ['protocolo ftp', { url: 'ftp://example.com' }, 'INVALID_URL_PROTOCOL'],
    ['protocolo javascript', { url: 'javascript:alert(1)' }, 'INVALID_URL_PROTOCOL'],
    ['texto sem formato de URL', { url: 'nao e url' }, 'INVALID_URL'],
  ];
  for (const [name, body, code] of invalidCases) {
    it(`responde 400 ${code}: ${name}`, async () => {
      await assertApiError(await postLink(server.baseUrl, body), 400, code);
    });
  }

  it('responde 400 INVALID_URL quando não há corpo JSON', async () => {
    const res = await fetch(`${server.baseUrl}/api/links`, { method: 'POST' });
    await assertApiError(res, 400, 'INVALID_URL');
  });

  it('responde 400 INVALID_JSON quando o corpo não é JSON válido', async () => {
    await assertApiError(await postLink(server.baseUrl, '{invalido'), 400, 'INVALID_JSON');
  });

  it('aceita URL com exatamente 2048 caracteres', async () => {
    const prefix = 'https://example.com/';
    const url = prefix + 'a'.repeat(2048 - prefix.length);
    assert.equal(url.length, 2048);
    const res = await postLink(server.baseUrl, { url });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).originalUrl, url);
  });

  it('responde 400 URL_TOO_LONG com 2049 caracteres', async () => {
    const prefix = 'https://example.com/';
    const url = prefix + 'a'.repeat(2049 - prefix.length);
    assert.equal(url.length, 2049);
    await assertApiError(await postLink(server.baseUrl, { url }), 400, 'URL_TOO_LONG');
  });

  it('não grava nada no banco quando a validação falha', async () => {
    const before = server.db.prepare('SELECT COUNT(*) AS n FROM links').get().n;
    await postLink(server.baseUrl, { url: 'ftp://example.com' });
    const after = server.db.prepare('SELECT COUNT(*) AS n FROM links').get().n;
    assert.equal(after, before);
  });
});

describe('404 em JSON dentro da API', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await server.stop(); });

  for (const route of ['/api', '/api/qualquer', '/api/links/abc/def/ghi']) {
    it(`GET ${route} responde 404 NOT_FOUND em JSON`, async () => {
      await assertApiError(await fetch(server.baseUrl + route), 404, 'NOT_FOUND');
    });
  }

  it('estatísticas de código com formato inválido respondem 404 LINK_NOT_FOUND em JSON', async () => {
    await assertApiError(await fetch(`${server.baseUrl}/api/links/abc/stats`), 404, 'LINK_NOT_FOUND');
  });

  it('estatísticas de código inexistente respondem 404 LINK_NOT_FOUND em JSON', async () => {
    await assertApiError(await fetch(`${server.baseUrl}/api/links/zzzzzz/stats`), 404, 'LINK_NOT_FOUND');
  });
});

describe('colisão de código', () => {
  it('gera outro código quando o sorteado já existe', async () => {
    // As 6 primeiras chamadas do randomInt formam 'aaaaaa'; as seguintes são reais
    const server = await startServer({ preload: FORCE_COLLISION, env: { FORCED_ZERO_CALLS: '6' } });
    try {
      server.db.prepare("INSERT INTO links (code, original_url) VALUES ('aaaaaa', 'https://example.com/existente')").run();

      const res = await postLink(server.baseUrl, { url: 'https://example.com/nova' });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.notEqual(body.code, 'aaaaaa');

      // O link existente não foi alterado e o novo foi gravado
      const existing = server.db.prepare("SELECT original_url FROM links WHERE code = 'aaaaaa'").get();
      assert.equal(existing.original_url, 'https://example.com/existente');
      const created = server.db.prepare('SELECT original_url FROM links WHERE code = ?').get(body.code);
      assert.equal(created.original_url, 'https://example.com/nova');
    } finally {
      await server.stop();
    }
  });

  it('responde 500 CODE_GENERATION_FAILED quando todas as tentativas colidem', async () => {
    const server = await startServer({ preload: FORCE_COLLISION, env: { FORCED_ZERO_CALLS: 'all' } });
    try {
      server.db.prepare("INSERT INTO links (code, original_url) VALUES ('aaaaaa', 'https://example.com/existente')").run();

      const res = await postLink(server.baseUrl, { url: 'https://example.com/nova' });
      await assertApiError(res, 500, 'CODE_GENERATION_FAILED');
      assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM links').get().n, 1);
    } finally {
      await server.stop();
    }
  });
});
