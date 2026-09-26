const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

// Cálculo de referência do dia em Brasília, feito aqui de propósito com UTC-3 fixo
// e sem usar src/utils/date.js nem a hora local da máquina: assim o teste confere
// a aplicação por um caminho independente. Brasília não tem horário de verão desde
// 2019; se ele voltar, este cálculo passa a divergir e os testes vão falhar,
// avisando da mudança. Na aplicação o fuso continua vindo do Intl.
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

function brasiliaToday() {
  return new Date(Date.now() - BRASILIA_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

// Série esperada de firstDay até today, com os cliques informados por dia
function expectedSeries(firstDay, today, clicksPerDay) {
  const series = [];
  for (let day = firstDay; day <= today; day = shiftDay(day, 1)) {
    series.push({ date: day, clicks: clicksPerDay[day] || 0 });
  }
  return series;
}

// Se o dia de Brasília virar entre o cálculo e a resposta (meia-noite exata),
// a expectativa fica defasada. Nesse caso o teste roda mais uma vez.
async function withStableDay(check) {
  for (let attempt = 1; ; attempt++) {
    const today = brasiliaToday();
    try {
      await check(today);
      return;
    } catch (err) {
      if (attempt >= 2 || brasiliaToday() === today) throw err;
    }
  }
}

describe('GET /api/links/:code/stats', () => {
  let server;
  // O servidor principal roda com um fuso bem diferente do de Brasília
  before(async () => { server = await startServer({ env: { TZ: 'Asia/Tokyo' } }); });
  after(async () => { await server.stop(); });

  async function createLink(url) {
    const res = await fetch(`${server.baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    assert.equal(res.status, 201);
    const { code } = await res.json();
    const { id } = server.db.prepare('SELECT id FROM links WHERE code = ?').get(code);
    return { code, id };
  }

  async function getStats(baseUrl, code) {
    const res = await fetch(`${baseUrl}/api/links/${code}/stats`);
    assert.equal(res.status, 200);
    return res.json();
  }

  function insertAccess(linkId, utcDateTime) {
    server.db.prepare('INSERT INTO clicks_log (link_id, accessed_at) VALUES (?, ?)').run(linkId, utcDateTime);
    server.db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(linkId);
  }

  it('link sem acessos: série só com hoje, lastAccessAt nulo e datas em ISO com Z', async () => {
    const { code } = await createLink('https://example.com/novo');
    await withStableDay(async (today) => {
      const stats = await getStats(server.baseUrl, code);
      assert.equal(stats.code, code);
      assert.equal(stats.shortUrl, `${server.baseUrl}/${code}`);
      assert.equal(stats.originalUrl, 'https://example.com/novo');
      assert.match(stats.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.equal(stats.totalClicks, 0);
      assert.equal(stats.lastAccessAt, null);
      assert.equal(stats.timeZone, 'America/Sao_Paulo');
      assert.deepEqual(stats.clicksByDay, [{ date: today, clicks: 0 }]);
    });
  });

  it('acesso às 22h30 de Brasília conta no dia de Brasília, não no dia UTC', async () => {
    const { code, id } = await createLink('https://example.com/22h');
    // Link criado 5 dias atrás para que ontem apareça na série
    server.db.prepare("UPDATE links SET created_at = datetime('now', '-5 days') WHERE id = ?").run(id);

    // 22h30 de ontem (D) em Brasília é 01h30 UTC de D+1, sempre no passado
    const yesterday = shiftDay(brasiliaToday(), -1);
    const accessUtc = `${shiftDay(yesterday, 1)} 01:30:00`;
    insertAccess(id, accessUtc);

    await withStableDay(async (today) => {
      const stats = await getStats(server.baseUrl, code);
      assert.equal(stats.totalClicks, 1);
      assert.equal(stats.lastAccessAt, accessUtc.replace(' ', 'T') + 'Z');
      assert.deepEqual(
        stats.clicksByDay,
        expectedSeries(shiftDay(today, -5), today, { [yesterday]: 1 })
      );
    });
  });

  it('resultado não depende do fuso da máquina onde o servidor roda', async () => {
    const { code, id } = await createLink('https://example.com/fusos');
    server.db.prepare("UPDATE links SET created_at = datetime('now', '-5 days') WHERE id = ?").run(id);
    const yesterday = shiftDay(brasiliaToday(), -1);
    insertAccess(id, `${shiftDay(yesterday, 1)} 01:30:00`);
    insertAccess(id, `${yesterday} 15:00:00`);

    // Outros servidores sobre o mesmo banco, cada um com um TZ diferente
    const others = [];
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'America/Sao_Paulo']) {
        others.push(await startServer({ dbPath: server.dbPath, env: { TZ: tz } }));
      }

      await withStableDay(async (today) => {
        const expected = expectedSeries(shiftDay(today, -5), today, { [yesterday]: 2 });
        const reference = await getStats(server.baseUrl, code);
        assert.deepEqual(reference.clicksByDay, expected);
        for (const other of others) {
          const stats = await getStats(other.baseUrl, code);
          assert.deepEqual(stats.clicksByDay, reference.clicksByDay);
          assert.equal(stats.lastAccessAt, reference.lastAccessAt);
          assert.equal(stats.createdAt, reference.createdAt);
        }
      });
    } finally {
      for (const other of others) await other.stop();
    }
  });

  it('mostra no máximo 30 dias, contando hoje, com zero nos dias sem acesso', async () => {
    const { code, id } = await createLink('https://example.com/janela');
    server.db.prepare("UPDATE links SET created_at = datetime('now', '-40 days') WHERE id = ?").run(id);

    const today = brasiliaToday();
    const firstDay = shiftDay(today, -29);
    // 15h UTC é meio-dia em Brasília, longe da virada do dia
    insertAccess(id, `${shiftDay(today, -31)} 15:00:00`);
    insertAccess(id, `${firstDay} 15:00:00`);

    await withStableDay(async (currentDay) => {
      const stats = await getStats(server.baseUrl, code);
      assert.equal(stats.clicksByDay.length, 30);
      assert.equal(stats.totalClicks, 2);
      assert.deepEqual(
        stats.clicksByDay,
        expectedSeries(shiftDay(currentDay, -29), currentDay, { [firstDay]: 1 })
      );
    });
  });
});
