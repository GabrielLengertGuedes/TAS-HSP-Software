const express = require('express');
const db = require('../database');
const { HttpError } = require('../errors');
const { isValidCode } = require('../utils/code');

const findLinkByCode = db.prepare('SELECT id, original_url FROM links WHERE code = ?');
const incrementClicks = db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?');
const insertClickLog = db.prepare('INSERT INTO clicks_log (link_id) VALUES (?)');

// Busca e as duas escritas na mesma transação: se uma escrita falhar,
// o better-sqlite3 desfaz tudo e relança o erro, então contador e log nunca divergem
const registerClick = db.transaction((code) => {
  const link = findLinkByCode.get(code);
  if (!link) return null;

  incrementClicks.run(link.id);
  insertClickLog.run(link.id);
  return link.original_url;
});

function linkNotFound() {
  return new HttpError(404, 'LINK_NOT_FOUND', 'Este link curto não existe. Verifique se o endereço foi digitado corretamente.');
}

const router = express.Router();

router.get('/:code', (req, res) => {
  const { code } = req.params;
  if (!isValidCode(code)) throw linkNotFound();

  // O Express atende HEAD com a rota GET. Verificadores de link fazem HEAD
  // sem que uma pessoa tenha acessado, então não conta como clique.
  const originalUrl = req.method === 'HEAD'
    ? findLinkByCode.get(code)?.original_url
    : registerClick(code);

  if (!originalUrl) throw linkNotFound();

  // 302 em vez de 301: o 301 fica em cache no navegador e os próximos acessos não chegariam ao servidor
  res.set('Cache-Control', 'no-store');
  res.redirect(302, originalUrl);
});

module.exports = router;
