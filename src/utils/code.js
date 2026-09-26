const crypto = require('crypto');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[a-zA-Z0-9]{${CODE_LENGTH}}$`);

// randomInt usa fonte criptográfica e distribuição uniforme (sem viés de módulo).
// 62^6 possibilidades, cerca de 56,8 bilhões de códigos.
function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

// Valida o formato antes de consultar o banco
function isValidCode(value) {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

module.exports = { generateCode, isValidCode };
