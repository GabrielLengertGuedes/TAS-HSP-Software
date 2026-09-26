# Encurtador de Links

Encurtador de links com contagem de acessos e estatísticas por dia, feito em Node.js, Express e SQLite, com interface em HTML, CSS e JavaScript puros.

## Como rodar

### Requisitos

- Node.js 22 ou mais recente. O `better-sqlite3` 13 declara `"node": ">=22"`, e o script `dev` usa o `node --watch`, que já vem no Node. O projeto foi desenvolvido e testado no Node 22.14.0.
- npm (vem com o Node).

### Instalação e execução

```bash
npm install
npm start
```

Para desenvolvimento, com reinício automático quando um arquivo muda:

```bash
npm run dev
```

A aplicação fica em `http://localhost:3000`.

O banco SQLite é criado sozinho na primeira execução, em `data/links.db`, junto com as tabelas e o índice. A pasta `data/` está no `.gitignore`.

### Variáveis de ambiente

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Porta do servidor. |
| `BASE_URL` | protocolo e host da requisição | Base usada para montar o `shortUrl` nas respostas. Informe sem barra no final, por exemplo `https://meu.dominio`. |

Exemplo no bash:

```bash
PORT=8080 BASE_URL=https://meu.dominio npm start
```

Exemplo no PowerShell:

```powershell
$env:PORT = '8080'; $env:BASE_URL = 'https://meu.dominio'; npm start
```

## Funcionalidades

- Encurtar uma URL e receber um link curto com código de 6 caracteres.
- Copiar o link curto com um botão. Se a área de transferência não estiver disponível, o link fica selecionado para cópia manual.
- Completar `https://` quando a pessoa digita um endereço sem protocolo, como `www.google.com`.
- Consultar as estatísticas colando o link curto completo ou só o código.
- Ver total de acessos, último acesso, data de criação e um gráfico de barras com os acessos por dia dos últimos 30 dias, no horário de Brasília. Os mesmos dados ficam numa tabela.
- Atalho "Ver estatísticas" logo depois de criar um link.
- Acessar o link curto redireciona para a URL original e conta o acesso.
- Página de erro com o mesmo visual da interface para link inexistente ou endereço errado.
- Tema claro e escuro, conforme a preferência do sistema, e layout para celular.

## API

### Formato de erro

Todas as rotas em `/api` respondem erros em JSON, sempre no mesmo formato:

```json
{
  "error": {
    "code": "INVALID_URL_PROTOCOL",
    "message": "A URL deve começar com http:// ou https://."
  }
}
```

`code` é fixo e serve para tratamento por programa. `message` é em português e pode ser mostrada ao usuário, e a interface usa ela diretamente.

Rotas fora de `/api` (o redirecionamento e qualquer caminho desconhecido) respondem erros com uma página HTML, porque quem acessa é uma pessoa no navegador.

### Rotas

| Método | Caminho | Descrição | Sucesso |
| --- | --- | --- | --- |
| `POST` | `/api/links` | Cria um link curto | `201` JSON |
| `GET` | `/api/links/:code/stats` | Estatísticas de um link | `200` JSON |
| `GET` | `/:code` | Redireciona para a URL original e conta o acesso | `302` |

### POST /api/links

Requisição:

```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"url": "https://exemplo.com/pagina"}'
```

No PowerShell, o equivalente é: `Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/links -ContentType 'application/json' -Body '{"url":"https://exemplo.com/pagina"}'`

Resposta `201`:

```json
{
  "code": "aZ3k9Q",
  "shortUrl": "http://localhost:3000/aZ3k9Q",
  "originalUrl": "https://exemplo.com/pagina"
}
```

A URL é devolvida e gravada na forma normalizada pelo parser `URL` do Node: host em minúsculas e caracteres especiais codificados. Por exemplo, `  HTTPS://Exemplo.COM/a b  ` vira `https://exemplo.com/a%20b`. Encurtar a mesma URL duas vezes gera dois códigos diferentes.

Erros:

| Status | `code` | Quando |
| --- | --- | --- |
| `400` | `INVALID_URL` | Campo `url` ausente ou que não é texto, formato inválido ou sem domínio. |
| `400` | `EMPTY_URL` | URL vazia ou só com espaços. |
| `400` | `URL_TOO_LONG` | URL com mais de 2048 caracteres. |
| `400` | `INVALID_URL_PROTOCOL` | Protocolo diferente de `http:` e `https:`, como `javascript:`, `data:` ou `ftp:`. |
| `400` | `INVALID_JSON` | Corpo da requisição não é um JSON válido. |
| `413` | `PAYLOAD_TOO_LARGE` | Corpo maior que o limite do `express.json()`. |
| `500` | `CODE_GENERATION_FAILED` | Cinco colisões de código seguidas. Na prática não acontece. |
| `500` | `INTERNAL_ERROR` | Erro inesperado. O detalhe fica só no log do servidor. |

### GET /api/links/:code/stats

Requisição:

```bash
curl http://localhost:3000/api/links/aZ3k9Q/stats
```

Resposta `200`:

```json
{
  "code": "aZ3k9Q",
  "shortUrl": "http://localhost:3000/aZ3k9Q",
  "originalUrl": "https://exemplo.com/pagina",
  "createdAt": "2026-09-24T14:05:00Z",
  "totalClicks": 5,
  "lastAccessAt": "2026-09-26T01:30:00Z",
  "timeZone": "America/Sao_Paulo",
  "clicksByDay": [
    { "date": "2026-09-24", "clicks": 2 },
    { "date": "2026-09-25", "clicks": 3 },
    { "date": "2026-09-26", "clicks": 0 }
  ]
}
```

Detalhes dos campos:

- `createdAt` e `lastAccessAt` são instantes em ISO 8601 UTC, com `Z`. `lastAccessAt` é `null` quando o link nunca foi acessado. No exemplo, `2026-09-26T01:30:00Z` é 22h30 do dia 25 em Brasília, por isso o acesso aparece no dia 25.
- `clicksByDay[].date` é um dia do calendário no fuso `timeZone`, não um instante. Deve ser usado como texto.
- `clicksByDay` cobre os últimos 30 dias contando hoje, ou começa no dia de criação quando o link é mais novo. Dias sem acesso aparecem com `0`, em ordem crescente.
- `totalClicks` é o total desde a criação, então pode ser maior que a soma de `clicksByDay`.

Erros:

| Status | `code` | Quando |
| --- | --- | --- |
| `404` | `LINK_NOT_FOUND` | Código com formato inválido ou inexistente. |
| `500` | `INTERNAL_ERROR` | Erro inesperado. |

### GET /:code

Requisição:

```bash
curl -i http://localhost:3000/aZ3k9Q
```

Resposta:

```http
HTTP/1.1 302 Found
Location: https://exemplo.com/pagina
Cache-Control: no-store
```

Cada `GET` conta um acesso. `HEAD` responde o mesmo redirecionamento sem contar.

Erros, em página HTML:

| Status | Quando |
| --- | --- |
| `404` | Código com formato inválido ou inexistente. O banco não é consultado quando o formato é inválido. |
| `500` | Erro inesperado. |

Qualquer outra rota desconhecida em `/api` responde `404` com `code` `NOT_FOUND` em JSON. Fora de `/api`, responde a página HTML de erro 404.

## Estrutura de pastas

```
public/
  index.html          interface
  style.css           estilos da interface e da página de erro
  app.js              criação de links, consulta e gráfico
src/
  server.js           monta o Express e a ordem das rotas
  database.js         conexão SQLite, tabelas e índice
  errors.js           HttpError, página de erro e tratamento de erros
  routes/
    links.js          POST /api/links e GET /api/links/:code/stats
    redirect.js       GET /:code
  utils/
    code.js           geração e validação do código
    url.js            validação da URL
    date.js           conversão de datas para o dia de Brasília
docs/ia/              conversas com a IA em cada etapa
data/                 banco SQLite, criado na execução e fora do git
```

## Decisões técnicas

**302 em vez de 301, com `Cache-Control: no-store`.** O navegador guarda o 301 em cache, e a partir do segundo acesso vai direto ao destino sem passar pelo servidor. O contador deixaria de contar. O `no-store` impede que caches intermediários guardem o redirecionamento.

**Contador e `clicks_log` na mesma transação.** A tabela `links` tem a coluna `clicks` para ler o total sem contar linhas, e a tabela `clicks_log` guarda um registro por acesso, usado para último acesso e acessos por dia. O `UPDATE` do contador e o `INSERT` no log rodam num único `db.transaction` do better-sqlite3. Se uma escrita falhar, as duas são desfeitas, e os números nunca divergem.

**SELECT dentro da transação.** A busca do link pelo código fica dentro da mesma transação das escritas. Assim a busca e as escritas veem o mesmo estado do banco, e um código inexistente não gera nenhuma escrita.

**Colisão tratada pelo UNIQUE, com retry.** O código tem 6 caracteres de `a-z`, `A-Z` e `0-9`, sorteados com `crypto.randomInt`, que usa fonte criptográfica e distribuição uniforme. São 62^6, cerca de 56,8 bilhões de combinações. Com 1 milhão de links, a chance de um código novo colidir é de cerca de 1 em 57 mil. Não há `SELECT` antes do `INSERT`: a coluna `code` é `UNIQUE`, e em caso de `SQLITE_CONSTRAINT_UNIQUE` o servidor gera outro código, até 5 tentativas. Isso evita a corrida entre verificar e inserir.

**HEAD não conta acesso.** O Express atende `HEAD` com a rota `GET`. Verificadores de link fazem `HEAD` sem que uma pessoa tenha acessado, então essas requisições redirecionam sem registrar clique.

**Validação de URL e bloqueio de `javascript:` e `data:`.** A URL passa pelo parser `URL` do Node, precisa ter domínio e no máximo 2048 caracteres, que é o limite prático usado por navegadores e buscadores. Só `http:` e `https:` são aceitos. Um link curto que redirecionasse para `javascript:` ou `data:` poderia executar código ou exibir conteúdo arbitrário em nome do encurtador. A URL é gravada normalizada, o que deixa o cabeçalho `Location` seguro.

**Não guardar IP nem user-agent.** O `clicks_log` guarda só o link e o instante do acesso. As estatísticas pedidas não precisam desses dados, e não guardar evita armazenar dado pessoal sem necessidade.

**Escape de HTML na página de erro e nenhum `innerHTML` no frontend.** A página de erro é montada no servidor, e todo texto variável passa por `escapeHtml`. A mensagem mostrada é sempre fixa do código, nunca o caminho acessado. No `app.js`, dados da API ou do usuário entram na página só por `textContent` ou por propriedades como `href`. O gráfico é montado com `createElement`, e a altura das barras é definida por `style.height`.

**Ordem das rotas no `server.js`.** A ordem é: arquivos estáticos, API, 404 JSON da API, redirecionamento, 404 HTML e, por último, o tratamento de erros. Se o `/:code` viesse antes da API, `GET /api` casaria com ele e um cliente de API receberia HTML. Com os estáticos primeiro, arquivos do `public/` nunca são confundidos com códigos. O tratamento de erros precisa ser o último middleware para receber os erros de todas as rotas.

**Fuso de Brasília fixo com `Intl`, independente da máquina.** O SQLite grava as datas em UTC. O agrupamento por dia usa `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`. O Node traz os dados de fuso embutidos, então o resultado não depende da variável `TZ` do servidor. O código não usa `getHours()`, `getDate()` nem o modificador `localtime` do SQLite, que leem o fuso da máquina. Também não usa `-3 hours` fixo, que ficaria errado se o horário de verão voltar. O SQL agrupa os acessos por hora UTC, no máximo 24 linhas por dia, e o JavaScript converte cada hora para o dia de Brasília. As datas saem do SQL em ISO com `Z`, porque o formato do SQLite sem fuso seria lido como hora local. No frontend, os dias de `clicksByDay` são tratados como texto, porque `new Date('2026-09-25')` vira meia-noite UTC e apareceria como dia 24 no Brasil.

**Acessibilidade da interface.**

- Todos os campos têm `label` e apontam para a dica e a mensagem de erro com `aria-describedby`.
- As mensagens de erro ficam em `role="alert"` e as de andamento e sucesso em `role="status"`. Os elementos ficam sempre no DOM, vazios, porque leitores de tela só anunciam essas regiões quando o conteúdo muda.
- Em caso de erro, o campo recebe `aria-invalid="true"` e o foco volta para ele.
- Durante o carregamento, o botão usa `aria-disabled` em vez de `disabled`, porque um botão `disabled` perde o foco em alguns navegadores.
- Há foco visível em todo elemento navegável pelo teclado.
- O gráfico é só visual, com `aria-hidden="true"`, e uma tabela dentro de um `<details>` traz os mesmos dados.
- O atalho "Ver estatísticas" leva o foco ao título do resultado.
- O contraste do texto passa de 4,5:1 nos temas claro e escuro. O menor valor medido foi 5,69:1.
- Os campos usam fonte de 16px, o que evita o zoom automático do iOS ao focar.

## Como foi testado

Cada etapa foi verificada com um script em Node escrito fora do repositório, rodando contra o servidor numa porta temporária e lendo o banco numa conexão separada. Nenhum arquivo de `src/` foi alterado para testar. Os scripts criavam os próprios dados e os removiam ao final. Eles não fazem parte do repositório.

**Criação de links (`POST /api/links`), 20 verificações.**
- Colisão: o script inseriu no banco um link com código conhecido e fez o sorteio devolver esse código na primeira tentativa, trocando `crypto.randomInt` só dentro do processo do teste. A resposta foi `201` com outro código, o que prova que o retry funciona.
- Normalização da URL e códigos diferentes para a mesma URL.
- `{}`, URL vazia ou só com espaços, número, `ftp:`, `javascript:`, texto sem formato de URL e URL com 2049 caracteres retornaram `400` com o `code` esperado. Com exatamente 2048 caracteres, `201`.
- JSON malformado retornou `400 INVALID_JSON`, e rota desconhecida em `/api` retornou `404` em JSON.

**Redirecionamento (`GET /:code`), 29 verificações.**
- Redirecionamento `302` com `Location` igual à URL original e `Cache-Control: no-store`.
- Consistência: 1 acesso seguido de 50 acessos em paralelo deixaram `clicks = 51` e 51 linhas no `clicks_log`.
- Rollback: o script criou no banco um trigger temporário que fazia o `INSERT` no `clicks_log` falhar. O acesso respondeu `500` em HTML e o `clicks` continuou em 51, o que prova que o `UPDATE` foi desfeito junto. O trigger foi removido depois.
- `HEAD` respondeu `302` sem alterar a contagem.
- Código inexistente e formatos inválidos (`/abc`, `/abc-12`, `/abcdefg`, espaços codificados) mostraram a página 404 em HTML, sem nova linha no log.
- As rotas anteriores continuaram funcionando.

**Estatísticas (`GET /api/links/:code/stats`).**
- Acesso às 22h30 de Brasília: o script calculou "ontem" pelo calendário de Brasília e inseriu um acesso às 22h30 desse dia, ou seja, 01h30 UTC do dia seguinte. O acesso entrou no dia de ontem, e não no de hoje.
- Fuso da máquina: o servidor rodou com `TZ=Asia/Tokyo` e depois com `TZ=UTC`, e as respostas foram idênticas.
- Link sem acessos: `lastAccessAt` nulo e um único dia com `0`.
- Janela de 30 dias: num link com data de criação ajustada para 60 dias atrás, vieram exatamente 30 dias, com os dias sem acesso em `0`.
- Código com formato inválido e código inexistente retornaram `404 LINK_NOT_FOUND` em JSON.

**Interface.**
- As funções puras do `app.js` (completar `https://`, extrair o código de um link colado e escolher os rótulos do gráfico) foram testadas no Node com um `document` falso.
- Um script calculou o contraste WCAG de todos os pares de cor nos dois temas.
- Busca por `innerHTML` em `public/`: a única ocorrência é o comentário que proíbe o uso.
- A página de erro foi testada em `/zzzzzz`, `/a/b` e com `<script>` no caminho, sem conteúdo injetado.
- No navegador foram conferidos manualmente: criar, copiar, mensagens de erro, consulta, gráfico com 1 e com 30 dias, tabela, navegação só por teclado e layout no celular.

## O que ficou de fora e por quê

**Expiração de links.** O desafio não pede, e a funcionalidade exige decidir regras (prazo padrão, o que mostrar num link expirado, limpeza dos dados). Priorizei a consistência da contagem e as estatísticas. O redirecionamento `302` sem cache já deixa espaço para desativar links no futuro, o que um `301` impediria.

**Código personalizado.** Também fora do que o desafio pede. Exigiria validação de formato, lista de palavras reservadas e tratamento de conflito com códigos já sorteados. Os códigos aleatórios cobrem o fluxo principal.

**Autenticação.** Não há contas nem dono do link. A consequência é que qualquer pessoa que tenha o código consegue ver as estatísticas dele. Os dados expostos são poucos (URL de destino, contagem e datas, sem IP nem user-agent), mas o código de 6 caracteres não deve ser tratado como segredo. Implementar contas, sessões e senhas aumentaria muito o escopo, e priorizei o núcleo do encurtador.

**Rate limiting.** Não há limite de requisições por cliente. Alguém pode criar links em massa ou tentar adivinhar códigos para ver estatísticas. Uma proteção adequada depende de onde a aplicação roda (proxy reverso, vários processos), então preferi deixar para quando houver um ambiente de produção definido, em vez de um limite em memória que só vale para uma instância.

**Testes automatizados no repositório.** As verificações foram feitas com scripts descartáveis em cada etapa, descritos acima, e não entraram no repositório. Transformá-las em uma suíte com `npm test` pediria organizar os scripts, isolar o banco de teste (hoje o caminho do banco é fixo em `data/links.db`) e possivelmente adicionar dependências de teste. Priorizei entregar as funcionalidades verificadas.

**Deploy.** A aplicação roda localmente. A variável `BASE_URL` já permite gerar os links com o domínio público, mas publicar exigiria escolher hospedagem com disco persistente para o SQLite, HTTPS e o proxy reverso. Ficou fora por não ser pedido e por tempo.

**Limitação conhecida: `localhost:3000/a` não recebe `https://` automático.** A interface completa `https://` quando o texto não começa com um esquema como `algo:`. Em `localhost:3000/a` ou `exemplo.com:8080/x`, o trecho antes dos dois-pontos parece um esquema, então o texto vai como está e a API recusa com "A URL deve começar com http:// ou https://.". Basta digitar o protocolo. Tratar "dois-pontos seguido de número" como porta resolveria esse caso, mas faria `javascript:1` virar `https://javascript:1`, que a API aceitaria. Preferi manter a regra simples e previsível.

## Uso de IA

Usei duas ferramentas de IA, com papéis diferentes.

- **Claude Code**, no VS Code, para implementar. Todas as conversas estão em `docs/ia/`, uma por etapa.
- **Claude**, no chat, como revisor. Usei para planejar a ordem das etapas, escrever parte dos prompts enviados ao Claude Code e revisar os planos e o código antes de aprovar. Conversa completa: [LINK DA CONVERSA]

### Como trabalhei

- Regras fixas no `CLAUDE.md`: uma funcionalidade por vez, plano antes de implementar, sem commits automáticos, sem dependências ou `npx` sem pedir, código em português.
- Cada funcionalidade começou com `/plan`. Eu lia o plano, pedia ajustes quando precisava e só então aprovava.
- Aprovei as edições arquivo por arquivo, sem o modo automático.
- Depois de cada etapa, testei no navegador e fiz os commits manualmente.
- Ao final de cada etapa, exportei a conversa e limpei o contexto antes da próxima.

### O que foi corrigido durante o processo

- **`npx` sem permissão.** Na primeira sessão, o Claude Code rodou `npx kill-port` sem perguntar. Adicionei uma regra no `CLAUDE.md` proibindo isso.
- **Acentuação.** O primeiro plano do `POST` tinha mensagens de erro sem acento ("invalido", "obrigatorio"). Pedi a correção, porque essas mensagens aparecem na interface.
- **Teste de colisão.** Deixei claro que o teste não podia alterar o `generateCode`, nem temporariamente, porque esse tipo de mudança acaba indo para um commit. O teste final prepara o estado no banco e não toca no código de produção.
- **Teste do fuso horário.** O primeiro teste do caso das 22h dependia da data UTC e da data de Brasília serem iguais, o que não vale entre 21h e meia-noite. Pedi que o teste fosse feito com um dia passado, calculado pelo calendário de Brasília.
- **URL sem protocolo.** Testando a interface, percebi que `www.google.com` era recusado como "Formato de URL inválido", o que confundiria a maioria das pessoas. Pedi que a interface completasse `https://` quando não houver protocolo, mantendo a API rígida.
- **Ajustes visuais.** Na revisão dos prints, corrigi o espaçamento desigual dos rótulos do gráfico e reorganizei as métricas no celular para destacar o total de acessos.

### Onde a IA ajudou mais

Nas decisões que eu não teria pensado sozinho de primeira: o 302 com `no-store`, o `HEAD` não contar acesso e o teste de rollback com trigger. Em todos esses casos, pedi a explicação antes de aprovar, para entender o motivo e não só aceitar o código.
