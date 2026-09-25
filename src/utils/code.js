const crypto = require('crypto');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

// randomInt usa fonte criptográfica e distribuição uniforme (sem viés de módulo).
// 62^6 possibilidades, cerca de 56,8 bilhões de códigos.
function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

module.exports = { generateCode };
