const { HttpError } = require('../errors');

// Limite prático usado por navegadores e buscadores
const MAX_URL_LENGTH = 2048;

// Retorna a URL normalizada ou lança HttpError 400
function validateUrl(input) {
  if (typeof input !== 'string') {
    throw new HttpError(400, 'INVALID_URL', "O campo 'url' é obrigatório e deve ser um texto.");
  }

  const value = input.trim();

  if (value === '') {
    throw new HttpError(400, 'EMPTY_URL', 'A URL não pode estar vazia.');
  }

  if (value.length > MAX_URL_LENGTH) {
    throw new HttpError(
      400,
      'URL_TOO_LONG',
      `A URL deve ter no máximo ${MAX_URL_LENGTH} caracteres.`
    );
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, 'INVALID_URL', 'Formato de URL inválido.');
  }

  // Bloqueia javascript:, data:, ftp: e afins
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'INVALID_URL_PROTOCOL', 'A URL deve começar com http:// ou https://.');
  }

  if (!parsed.hostname) {
    throw new HttpError(400, 'INVALID_URL', 'A URL precisa ter um domínio válido.');
  }

  // href normalizado: host em minúsculas e caracteres especiais codificados
  return parsed.href;
}

module.exports = { validateUrl, MAX_URL_LENGTH };
