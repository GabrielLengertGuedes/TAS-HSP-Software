const express = require('express');
const db = require('../database');
const { HttpError } = require('../errors');
const { generateCode, isValidCode } = require('../utils/code');
const { validateUrl } = require('../utils/url');
const { TIME_ZONE, toLocalDay, addDays } = require('../utils/date');

const MAX_CODE_ATTEMPTS = 5;
// Quantidade de dias, contando hoje, exibidos em clicksByDay
const STATS_DAYS = 30;

const insertLink = db.prepare('INSERT INTO links (code, original_url) VALUES (?, ?)');

// O SQLite grava 'YYYY-MM-DD HH:MM:SS' sem fuso, e o JS leria esse texto como hora local.
// O strftime devolve ISO 8601 com Z, que é inequívoco para o JS e para o frontend.
const findLinkForStats = db.prepare(`
  SELECT id, code, original_url, clicks,
         strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
  FROM links
  WHERE code = ?
`);

// MAX retorna NULL quando o link nunca foi acessado, e strftime(NULL) também é NULL
const findLastAccess = db.prepare(`
  SELECT strftime('%Y-%m-%dT%H:%M:%SZ', MAX(accessed_at)) AS last_access_at
  FROM clicks_log
  WHERE link_id = ?
`);

// Agrupa por hora UTC em vez de trazer cada clique: no máximo 24 linhas por dia.
// A conversão para o dia de Brasília é feita no JS. Isso funciona porque o
// deslocamento do fuso é sempre de horas inteiras.
const countClicksByHour = db.prepare(`
  SELECT strftime('%Y-%m-%dT%H:00:00Z', accessed_at) AS hour, COUNT(*) AS clicks
  FROM clicks_log
  WHERE link_id = ? AND accessed_at >= datetime('now', ?)
  GROUP BY hour
`);

const router = express.Router();

// O UNIQUE da coluna code é a fonte da verdade: tenta inserir e, se colidir, gera outro código
function createLinkWithUniqueCode(originalUrl) {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      insertLink.run(code, originalUrl);
      return code;
    } catch (err) {
      if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
    }
  }
  throw new HttpError(500, 'CODE_GENERATION_FAILED', 'Não foi possível gerar um código único. Tente novamente.');
}

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function linkNotFound() {
  return new HttpError(404, 'LINK_NOT_FOUND', 'Link não encontrado.');
}

// Série contínua dos últimos STATS_DAYS dias no calendário de Brasília, com 0 nos
// dias sem acesso. Começa no dia de criação quando o link é mais novo que a janela.
function buildClicksByDay(link) {
  const today = toLocalDay(new Date());
  const windowStart = addDays(today, -(STATS_DAYS - 1));
  const createdDay = toLocalDay(new Date(link.created_at));
  // Datas 'YYYY-MM-DD' podem ser comparadas como texto
  const firstDay = createdDay > windowStart ? createdDay : windowStart;

  // Um dia de folga no filtro do SQL porque ele corta em UTC, não em Brasília.
  // O que ficar antes de firstDay é descartado aqui.
  const rows = countClicksByHour.all(link.id, `-${STATS_DAYS + 1} days`);
  const clicksPerDay = new Map();
  for (const { hour, clicks } of rows) {
    const day = toLocalDay(new Date(hour));
    if (day < firstDay) continue;
    clicksPerDay.set(day, (clicksPerDay.get(day) || 0) + clicks);
  }

  const result = [];
  for (let day = firstDay; day <= today; day = addDays(day, 1)) {
    result.push({ date: day, clicks: clicksPerDay.get(day) || 0 });
  }
  return result;
}

router.post('/', (req, res) => {
  // req.body é undefined quando a requisição não tem corpo JSON
  const originalUrl = validateUrl(req.body?.url);
  const code = createLinkWithUniqueCode(originalUrl);

  res.status(201).json({
    code,
    shortUrl: `${getBaseUrl(req)}/${code}`,
    originalUrl,
  });
});

router.get('/:code/stats', (req, res) => {
  const { code } = req.params;
  if (!isValidCode(code)) throw linkNotFound();

  const link = findLinkForStats.get(code);
  if (!link) throw linkNotFound();

  res.json({
    code: link.code,
    shortUrl: `${getBaseUrl(req)}/${link.code}`,
    originalUrl: link.original_url,
    createdAt: link.created_at,
    // A coluna e o clicks_log são atualizados na mesma transação (ver redirect.js)
    totalClicks: link.clicks,
    lastAccessAt: findLastAccess.get(link.id).last_access_at,
    // clicksByDay[].date é um dia do calendário neste fuso, não um instante.
    // No frontend, new Date('2026-09-25') vira meia-noite UTC e aparece como dia 24
    // no Brasil, então a data deve ser usada como texto.
    timeZone: TIME_ZONE,
    clicksByDay: buildClicksByDay(link),
  });
});

module.exports = router;
