
> /clear

> Próxima funcionalidade: rota GET /:code, que redireciona para a URL original.

  Requisitos:
  - Buscar o link pelo code. Se existir, redirecionar para original_url.
  - A cada acesso, incrementar links.clicks e inserir uma linha em clicks_log,
  as duas escritas numa única transação.
  - Validar o formato do code antes de consultar o banco (6 caracteres base62).
  - Seguir o padrão de erros e de organização da rota POST.

  Antes de implementar, me explique:
  1. Qual status HTTP de redirecionamento vai usar e por quê.
  2. Onde a rota vai ser registrada no server.js e o que acontece se a ordem
  estiver errada.
  3. O que o usuário vê quando o código não existe, lembrando que quem acessa
  essa rota é uma pessoa no navegador, não um cliente de API.
  4. Como vai testar que o contador e o log ficam consistentes.

  Searched for 1 pattern, read 7 files, ran 1 shell command (ctrl+o to expand)

● Updated plan
  ⎿  /plan to preview

● Plano finalizado com as respostas sobre status 302, ordem das rotas no
  server.js, tratamento de código inexistente e o script de teste; vou enviar
  para aprovação.

● User approved Claude's plan
  ⎿  Plan saved to:
     ~\.claude\plans\pr-xima-funcionalidade-rota-get-clever-lake.md · /plan to
     edit
     Plano: GET /:code (redirecionamento)

     Contexto

     A rota POST /api/links já cria links curtos (shortUrl = <base>/<code>), mas
     ainda não existe nada que responda nesse endereço. Esta rota fecha o
     ciclo: recebe o acesso de uma pessoa no navegador, redireciona para a URL
     original e registra o clique (links.clicks + uma linha em clicks_log), base
     para as estatísticas futuras.

     1. Status HTTP: 302 Found

     - Não 301: o navegador guarda o 301 em cache indefinidamente. A partir do
       segundo acesso ele vai direto para o destino sem passar pelo servidor, e
       o contador deixa de contar. Também impediria mudar ou desativar o link no
       futuro.
     - 302 em vez de 307: como a rota só atende GET, os dois se comportam igual.
       O 302 é o mais usado e entendido por qualquer cliente.
     - Header Cache-Control: no-store explícito, para garantir que nenhum cache
       intermediário guarde o redirecionamento e todo acesso chegue ao servidor.
     - res.redirect(302, originalUrl): original_url já está salvo no formato
       normalizado do URL (validado como http/https no POST), então o Location é
       seguro.

     2. Registro no server.js e ordem

     Ordem final:

     app.use(express.json());
     app.use(express.static(...));          // 1. arquivos do /public
     app.use('/api/links', linksRouter);    // 2. API
     app.use('/api', notFound);             // 3. 404 JSON da API
     app.use(redirectRouter);               // 4. GET /:code  (novo)
     app.use(pageNotFound);                 // 5. 404 HTML para o resto (novo)
     app.use(errorHandler);                 // 6. sempre por último

     O que dá errado se a ordem mudar:
     - /:code antes de /api: GET /api casaria com /:code (code = "api"). Como o
       formato é inválido, cairia no 404 HTML em vez do 404 JSON da API. Um
       cliente de API receberia HTML. Se algum dia existir uma rota /api/xxxxxx
       de um segmento só, ela seria "roubada" pelo redirecionamento.
     - /:code antes do static: / não é afetado (/:code exige um segmento), mas
       um arquivo do public com 6 caracteres alfanuméricos e sem extensão seria
       sombreado, e todo pedido de asset passaria antes pela validação. Com o
       static primeiro, arquivos sempre vencem.
     - Depois do errorHandler / do pageNotFound: a rota nunca seria alcançada,
       porque o 404 genérico responderia antes.

     3. O que a pessoa vê quando o código não existe

     Uma página HTML com status 404, não JSON: título "Link não encontrado",
     texto explicando que o link pode estar errado ou ter sido digitado
     incorretamente, e um link "Criar um link curto" para /.

     Mantendo o padrão de erros:
     - A rota continua lançando HttpError (404 LINK_NOT_FOUND), como a POST.
     - O errorHandler passa a escolher o formato pelo caminho: req.originalUrl
       começando com /api -> JSON (como hoje); caso contrário -> página HTML com
       status e mensagem. Assim, um erro 500 no redirecionamento (ex.: falha no
       banco) também mostra uma página amigável, e não JSON.
     - Nova função sendErrorPage(res, status, title, message) em src/errors.js
       gera um HTML mínimo (lang="pt-BR", charset UTF-8, viewport), com texto
       escapado. As mensagens são fixas do código, nunca o code recebido na URL.
     - pageNotFound (novo, exportado de errors.js) cobre qualquer outro caminho
       fora da API (ex.: /a/b, /favicon.ico), substituindo o "Cannot GET" padrão
       do Express pela mesma página.
     - Código com formato inválido (ex.: /abc, /abc-12, /abcdefg) mostra a mesma
       página 404 que um código inexistente, sem consultar o banco. Para quem
       está no navegador, as duas situações são iguais.

     4. Implementação

     src/utils/code.js: adicionar isValidCode(value) com regex construída a
     partir de CODE_LENGTH (/^[a-zA-Z0-9]{6}$/), reaproveitando as constantes
     que já existem. Exportar junto com generateCode.

     src/routes/redirect.js (novo), no mesmo estilo de src/routes/links.js:
     - Prepared statements no topo do módulo:
       - SELECT id, original_url FROM links WHERE code = ?
       - UPDATE links SET clicks = clicks + 1 WHERE id = ?
       - INSERT INTO clicks_log (link_id) VALUES (?)
     - registerClick = db.transaction(code => { ... }): busca o link, e se
       existir faz o UPDATE e o INSERT e devolve original_url. Senão devolve
       null. O SELECT fica dentro da transação para que busca e escritas vejam o
       mesmo estado. Se qualquer escrita falhar, o better-sqlite3 faz rollback
       das duas e relança o erro (vai para o errorHandler -> página 500).
     - router.get('/:code', ...):
       a. isValidCode falhou -> throw new HttpError(404, 'LINK_NOT_FOUND', ...)
       b. Requisição HEAD -> apenas busca e redireciona, sem contar clique. O
          Express trata HEAD com a rota GET, e verificadores de link fazem HEAD
          sem que uma pessoa tenha acessado.
       c. registerClick(code) retornou null -> mesmo 404
       d. res.set('Cache-Control', 'no-store') + res.redirect(302, url)

     src/server.js: registrar redirectRouter e pageNotFound na ordem da seção 2.

     Sem novas dependências. Nenhuma alteração em database.js (o schema já tem
     clicks, clicks_log e o índice).

     5. Verificação (consistência de contador e log)

     Script Node no scratchpad (fora do repositório, sem tocar em src/), como na
     sessão anterior: sobe o servidor na porta 3999 com PORT=3999, usa fetch
     com redirect: 'manual' e lê o banco com better-sqlite3 em uma conexão
     separada.

     1. Redirect básico: cria link via POST, faz GET /<code> -> 302, Location
        igual a originalUrl, Cache-Control: no-store.
     2. Consistência sob carga: 50 GETs em paralelo no mesmo código ->
        links.clicks == 51 (50 + o do passo 1) e COUNT(*) FROM clicks_log WHERE
        link_id = ? também 51. Os dois números precisam ser iguais entre si e
        iguais ao número de requisições.
     3. Atomicidade (rollback): sem mexer no código, o script cria no banco um
        trigger temporário BEFORE INSERT ON clicks_log ... RAISE(ABORT) só para
        o link_id de teste. Um GET deve responder 500 em HTML, e clicks não pode
        ter aumentado (prova de que o UPDATE foi desfeito junto com o INSERT
        que falhou). O trigger é removido no finally.
     4. HEAD: responde 302 e não altera clicks nem clicks_log.
     5. Código inexistente com formato válido -> 404, Content-Type: text/html,
        nenhuma linha nova em clicks_log.
     6. Formato inválido (/abc, /abc-12, /abcdefg, /%20%20%20%20%20%20) -> 404
        HTML.
     7. Regressões: / continua servindo o index.html; GET /api e GET
        /api/qualquer continuam 404 JSON; POST /api/links continua 201; /a/b ->
        404 HTML.
     8. Limpeza: remove os links de teste (o ON DELETE CASCADE leva o log junto)
        e confirma que as tabelas voltaram ao estado inicial.

     Depois, teste manual no navegador: abrir um shortUrl real e um código
     inexistente para ver a página 404.

     Sem commit.

● Plano aprovado. Começando pelo isValidCode.

● Update(src\utils\code.js)
  ⎿  Added 1 line
      2  
      3  const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST
         UVWXYZ0123456789';
      4  const CODE_LENGTH = 6;
      5 +const CODE_PATTERN = new RegExp(`^[a-zA-Z0-9]{${CODE_LENGTH}}$`)
        +;                                                               
      6  
      7  // randomInt usa fonte criptográfica e distribuição uniforme (se
         m viés de módulo).
      8  // 62^6 possibilidades, cerca de 56,8 bilhões de códigos.

● Update(src\utils\code.js)
  ⎿  Added 6 lines, removed 1 line
      14    return code;
      15  }
      16  
      17 -module.exports = { generateCode };                             
      17 +// Valida o formato antes de consultar o banco                 
      18 +function isValidCode(value) {                                  
      19 +  return typeof value === 'string' && CODE_PATTERN.test(value);
      20 +}                                                              
      21 +                                                               
      22 +module.exports = { generateCode, isValidCode };                

● Agora errors.js: página HTML de erro e escolha de formato no errorHandler.

● Write(src\errors.js)
  ⎿  Added 51 lines, removed 6 lines
      1  // Erro com status HTTP e código legível por máquina.
      2 -// Toda rota lança HttpError e o errorHandler converte para o fo
        -rmato JSON padrão.                                              
      2 +// Toda rota lança HttpError e o errorHandler converte para o fo
        +rmato de resposta:                                              
      3 +// JSON nas rotas da API, página HTML nas rotas acessadas pelo n
        +avegador.                                                       
      4  class HttpError extends Error {
      5    constructor(status, code, message) {
      6      super(message);
     ...
       9    }
      10  }
      11  
      12 +const PAGE_TITLES = {                                          
      13 +  404: 'Link não encontrado',                                  
      14 +  500: 'Algo deu errado',                                      
      15 +};                                                             
      16 +                                                               
      17  function sendError(res, status, code, message) {
      18    res.status(status).json({ error: { code, message } });
      19  }
      20  
      21 +function escapeHtml(text) {                                    
      22 +  return String(text)                                          
      23 +    .replace(/&/g, '&amp;')                                    
      24 +    .replace(/</g, '&lt;')                                     
      25 +    .replace(/>/g, '&gt;')                                     
      26 +    .replace(/"/g, '&quot;')                                   
      27 +    .replace(/'/g, '&#39;');                                   
      28 +}                                                              
      29 +                                                               
      30 +function sendErrorPage(res, status, message) {                 
      31 +  const title = escapeHtml(PAGE_TITLES[status] || 'Erro');     
      32 +  res.status(status).type('html').send(`<!DOCTYPE html>        
      33 +<html lang="pt-BR">                                            
      34 +<head>                                                         
      35 +  <meta charset="UTF-8">                                       
      36 +  <meta name="viewport" content="width=device-width, initial-sc
         +ale=1.0">                                                      
      37 +  <title>${title}</title>                                      
      38 +</head>                                                        
      39 +<body>                                                         
      40 +  <h1>${title}</h1>                                            
      41 +  <p>${escapeHtml(message)}</p>                                
      42 +  <p><a href="/">Criar um link curto</a></p>                   
      43 +</body>                                                        
      44 +</html>`);                                                     
      45 +}                                                              
      46 +                                                               
      47 +function isApiRequest(req) {                                   
      48 +  return req.originalUrl === '/api' || req.originalUrl.startsWi
         +th('/api/');                                                   
      49 +}                                                              
      50 +                                                               
      51  // Rotas da API que não existem respondem em JSON, não em HTML
      52  function notFound(req, res) {
      53    sendError(res, 404, 'NOT_FOUND', 'Rota não encontrada.');
      54  }
      55  
      56 +// Qualquer outro caminho fora da API mostra a página de erro  
      57 +function pageNotFound(req, res) {                              
      58 +  sendErrorPage(res, 404, 'Verifique se o endereço foi digitado
         + corretamente.');                                              
      59 +}                                                              
      60 +                                                               
      61  // Express reconhece o middleware de erro pelos 4 parâmetros
      62  function errorHandler(err, req, res, next) {
      63 +  const respond = isApiRequest(req)                            
      64 +    ? (status, code, message) => sendError(res, status, code, m
         +essage)                                                        
      65 +    : (status, code, message) => sendErrorPage(res, status, mes
         +sage);                                                         
      66 +                                                               
      67    if (err instanceof HttpError) {
      23 -    return sendError(res, err.status, err.code, err.message);  
      68 +    return respond(err.status, err.code, err.message);         
      69    }
      70  
      71    // Erros lançados pelo express.json()
      72    if (err.type === 'entity.parse.failed') {
      28 -    return sendError(res, 400, 'INVALID_JSON', 'O corpo da requ
         -isição não é um JSON válido.');                                
      73 +    return respond(400, 'INVALID_JSON', 'O corpo da requisição 
         +não é um JSON válido.');                                       
      74    }
      75    if (err.type === 'entity.too.large') {
      31 -    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'O corpo da
         - requisição é grande demais.');                                
      76 +    return respond(413, 'PAYLOAD_TOO_LARGE', 'O corpo da requis
         +ição é grande demais.');                                       
      77    }
      78  
      79    // Erro inesperado: registra no servidor, mas não expõe detal
          hes ao cliente
      80    console.error(err);
      36 -  sendError(res, 500, 'INTERNAL_ERROR', 'Erro interno do servid
         -or.');                                                         
      81 +  respond(500, 'INTERNAL_ERROR', 'Erro interno do servidor. Ten
         +te novamente em instantes.');                                  
      82  }
      83  
      39 -module.exports = { HttpError, notFound, errorHandler };        
      84 +module.exports = { HttpError, notFound, pageNotFound, errorHand
         +ler };                                                         

● Agora a rota de redirecionamento.

● Write(src\routes\redirect.js)
  ⎿  Wrote 44 lines to src\routes\redirect.js
       1 const express = require('express');
       3 const { HttpError } = require('../errors');
       4 const { isValidCode } = require('../utils/code');
       5
         links WHERE code = ?');
       7 const incrementClicks = db.prepare('UPDATE links SET clicks = cl
       8 const insertClickLog = db.prepare('INSERT INTO clicks_log (link_
         id) VALUES (?)');
       9
         alhar,
     … +42 lines (ctrl+o to expand)

● Update(src\server.js)
  ⎿  Added 2 lines, removed 1 line
       4  // Importar o módulo já abre a conexão e cria as tabelas
       5  require('./database');
       6  const linksRouter = require('./routes/links');
       7 -const { notFound, errorHandler } = require('./errors');        
       7 +const redirectRouter = require('./routes/redirect');           
       8 +const { notFound, pageNotFound, errorHandler } = require('./err
         +ors');                                                         
       9  
      10  const app = express();
      11  const PORT = process.env.PORT || 3000;

● Update(src\server.js)
  ⎿  Added 4 lines
      16  app.use('/api/links', linksRouter);
      17  app.use('/api', notFound);
      18  
      19 +// Depois da API: senão GET /api casaria com /:code e responder
         +ia HTML em vez de JSON                                         
      20 +app.use(redirectRouter);                                       
      21 +app.use(pageNotFound);                                         
      22 +                                                               
      23  // Precisa ser o último middleware
      24  app.use(errorHandler);
      25  

● Código pronto. Agora o script de verificação no scratchpad.

  Made 1 scratchpad edit +139, ran 1 shell command (ctrl+o to expand)

● A rota GET /:code está pronta, e os 29 testes do script de verificação
  passaram. Não fiz commit.

  Arquivos
  - Novo: src/routes/redirect.js. A busca do link, o UPDATE clicks e o INSERT no
    clicks_log rodam numa única transação db.transaction. Requisição HEAD
    redireciona sem contar clique. Os redirecionamentos são 302 com
    Cache-Control: no-store.
  - src/utils/code.js: novo isValidCode, com a regex montada a partir do
    CODE_LENGTH.
  - src/errors.js: o errorHandler responde em JSON quando o caminho é /api ou
    começa com /api/, e com uma página HTML nos demais casos. Também entrou o
    pageNotFound. O texto da página é escapado.
  - src/server.js: a ordem ficou static → API → 404 JSON → redirecionamento →
    404 HTML → errorHandler, com um comentário explicando essa ordem.

  Verificação (script no scratchpad, porta 3999, nada de src/ alterado para
  testar)
  - Contador e log iguais: 1 acesso e mais 50 em paralelo deixaram clicks = 51 e
    51 linhas no clicks_log.
  - Rollback: criei um trigger temporário no banco que faz o INSERT no log
    falhar. O acesso respondeu 500 em HTML e o clicks continuou em 51, então o
    UPDATE foi desfeito junto. O trigger foi removido depois.
    - O SqliteError: falha simulada que aparece no stderr do servidor é essa
      falha provocada de propósito, registrada pelo errorHandler.
  - HEAD: responde 302 e não muda a contagem.
  - 404: código inexistente e formato inválido (/abc, /abc-12, /abcdefg, espaços
    codificados) mostram a página HTML "Link não encontrado", e nenhuma linha
    nova entra no log.
  - O que já existia continua funcionando:
    - / serve o index.html.
    - /api, /api/qualquer e /api/abcdef continuam com 404 em JSON.
    - JSON malformado continua com 400 em JSON.
    - O POST continua com 201.
  - Limpeza: o banco voltou a 0 links e 0 linhas de log.

  Uma mudança que vale conferir: erros 400/413 fora de /api agora também viram
  página HTML, com o título genérico "Erro". Na prática isso não acontece hoje,
  porque só a API recebe corpo JSON.

  Falta o teste manual no navegador: abrir um shortUrl real e um código
  inexistente para ver a página 404.