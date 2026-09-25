const express = require('express');
const db = require('../database');
const { HttpError } = require('../errors');
const { generateCode } = require('../utils/code');
const { validateUrl } = require('../utils/url');

const MAX_CODE_ATTEMPTS = 5;

const insertLink = db.prepare('INSERT INTO links (code, original_url) VALUES (?, ?)');

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

module.exports = router;
