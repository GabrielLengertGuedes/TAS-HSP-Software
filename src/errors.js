// Erro com status HTTP e código legível por máquina.
// Toda rota lança HttpError e o errorHandler converte para o formato de resposta:
// JSON nas rotas da API, página HTML nas rotas acessadas pelo navegador.
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const PAGE_TITLES = {
  404: 'Link não encontrado',
  500: 'Algo deu errado',
};

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendErrorPage(res, status, message) {
  const title = escapeHtml(PAGE_TITLES[status] || 'Erro');
  res.status(status).type('html').send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- Caminho absoluto: a página de erro pode ser servida em qualquer rota, como /a/b -->
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main class="container error-page">
    <section class="card">
      <p class="error-status">Erro ${status}</p>
      <h1>${title}</h1>
      <p>${escapeHtml(message)}</p>
      <a class="button" href="/">Criar um link curto</a>
    </section>
  </main>
</body>
</html>`);
}

function isApiRequest(req) {
  return req.originalUrl === '/api' || req.originalUrl.startsWith('/api/');
}

// Rotas da API que não existem respondem em JSON, não em HTML
function notFound(req, res) {
  sendError(res, 404, 'NOT_FOUND', 'Rota não encontrada.');
}

// Qualquer outro caminho fora da API mostra a página de erro
function pageNotFound(req, res) {
  sendErrorPage(res, 404, 'Verifique se o endereço foi digitado corretamente.');
}

// Express reconhece o middleware de erro pelos 4 parâmetros
function errorHandler(err, req, res, next) {
  const respond = isApiRequest(req)
    ? (status, code, message) => sendError(res, status, code, message)
    : (status, code, message) => sendErrorPage(res, status, message);

  if (err instanceof HttpError) {
    return respond(err.status, err.code, err.message);
  }

  // Erros lançados pelo express.json()
  if (err.type === 'entity.parse.failed') {
    return respond(400, 'INVALID_JSON', 'O corpo da requisição não é um JSON válido.');
  }
  if (err.type === 'entity.too.large') {
    return respond(413, 'PAYLOAD_TOO_LARGE', 'O corpo da requisição é grande demais.');
  }

  // Erro inesperado: registra no servidor, mas não expõe detalhes ao cliente
  console.error(err);
  respond(500, 'INTERNAL_ERROR', 'Erro interno do servidor. Tente novamente em instantes.');
}

module.exports = { HttpError, notFound, pageNotFound, errorHandler };
