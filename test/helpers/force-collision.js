// Carregado com --require só no servidor do teste de colisão. Substitui o
// crypto.randomInt dentro daquele processo para que o generateCode devolva
// 'aaaaaa' (índice 0 do alfabeto), sem alterar nenhum arquivo de src/.
//
// FORCED_ZERO_CALLS=<n>: as n primeiras chamadas devolvem 0, as seguintes usam o valor real.
// FORCED_ZERO_CALLS=all: todas as chamadas devolvem 0.
const crypto = require('crypto');

const realRandomInt = crypto.randomInt;
const setting = process.env.FORCED_ZERO_CALLS;
const forcedCalls = setting === 'all' ? Infinity : Number(setting) || 0;
let calls = 0;

crypto.randomInt = function (...args) {
  calls++;
  if (calls <= forcedCalls) return 0;
  return realRandomInt.apply(this, args);
};
