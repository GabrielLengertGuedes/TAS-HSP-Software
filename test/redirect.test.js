const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

const PARALLEL_REQUESTS = 50;

describe('GET /:code', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await server.stop(); });

  async function createLink(url) {
    const res = await fetch(`${server.baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    assert.equal(res.status, 201);
    return (await res.json()).code;
  }

  // redirect: 'manual' para ver o 302 em vez de seguir até o destino
  function visit(code, method = 'GET') {
    return fetch(`${server.baseUrl}/${code}`, { method, redirect: 'manual' });
  }

  function countClicks(code) {
    const { id, clicks } = server.db.prepare('SELECT id, clicks FROM links WHERE code = ?').get(code);
    const logged = server.db.prepare('SELECT COUNT(*) AS n FROM clicks_log WHERE link_id = ?').get(id).n;
    return { clicks, logged };
  }

  it('redireciona com 302 e Cache-Control no-store', async () => {
    const code = await createLink('https://example.com/destino');
    const res = await visit(code);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://example.com/destino');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(countClicks(code), { clicks: 1, logged: 1 });
  });

  it('HEAD responde 302 sem contar acesso', async () => {
    const code = await createLink('https://example.com/head');
    const res = await visit(code, 'HEAD');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://example.com/head');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(countClicks(code), { clicks: 0, logged: 0 });
  });

  it(`mantém clicks e clicks_log iguais com ${PARALLEL_REQUESTS} acessos em paralelo`, async () => {
    const code = await createLink('https://example.com/paralelo');
    const responses = await Promise.all(
      Array.from({ length: PARALLEL_REQUESTS }, () => visit(code))
    );
    for (const res of responses) assert.equal(res.status, 302);
    assert.deepEqual(countClicks(code), { clicks: PARALLEL_REQUESTS, logged: PARALLEL_REQUESTS });

    const stats = await (await fetch(`${server.baseUrl}/api/links/${code}/stats`)).json();
    assert.equal(stats.totalClicks, PARALLEL_REQUESTS);
  });

  it('desfaz o incremento de clicks quando o INSERT no clicks_log falha', async () => {
    const code = await createLink('https://example.com/rollback');
    // O trigger faz só o INSERT no log falhar, depois do UPDATE já ter rodado na transação
    server.db.exec(`
      CREATE TRIGGER test_fail_click_log BEFORE INSERT ON clicks_log
      BEGIN SELECT RAISE(ABORT, 'falha simulada pelo teste'); END;
    `);
    try {
      const res = await visit(code);
      assert.equal(res.status, 500);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.deepEqual(countClicks(code), { clicks: 0, logged: 0 });
    } finally {
      server.db.exec('DROP TRIGGER IF EXISTS test_fail_click_log');
    }

    // Sem o trigger, o acesso volta a ser registrado normalmente
    assert.equal((await visit(code)).status, 302);
    assert.deepEqual(countClicks(code), { clicks: 1, logged: 1 });
  });
});

describe('404 em HTML fora da API', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await server.stop(); });

  const cases = [
    ['código inexistente', '/zzzzzz'],
    ['código curto demais', '/abc'],
    ['código longo demais', '/abcdefg'],
    ['código com hífen', '/abc-12'],
    ['código com espaço codificado', '/abc%2012'],
    ['caminho com mais de um nível', '/a/b'],
  ];
  for (const [name, route] of cases) {
    it(`${name} (${route}) responde página HTML 404`, async () => {
      const res = await fetch(server.baseUrl + route, { redirect: 'manual' });
      assert.equal(res.status, 404);
      assert.match(res.headers.get('content-type'), /text\/html/);
      const html = await res.text();
      assert.match(html, /<!DOCTYPE html>/);
      assert.match(html, /Link não encontrado/);
      assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM clicks_log').get().n, 0);
    });
  }
});
