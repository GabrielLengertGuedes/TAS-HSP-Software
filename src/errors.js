// Erro com status HTTP e código legível por máquina.
// Toda rota lança HttpError e o errorHandler converte para o formato JSON padrão.
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

// Rotas da API que não existem respondem em JSON, não em HTML
function notFound(req, res) {
  sendError(res, 404, 'NOT_FOUND', 'Rota não encontrada.');
}

// Express reconhece o middleware de erro pelos 4 parâmetros
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return sendError(res, err.status, err.code, err.message);
  }

  // Erros lançados pelo express.json()
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'O corpo da requisição não é um JSON válido.');
  }
  if (err.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'O corpo da requisição é grande demais.');
  }

  // Erro inesperado: registra no servidor, mas não expõe detalhes ao cliente
  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Erro interno do servidor.');
}

module.exports = { HttpError, notFound, errorHandler };
