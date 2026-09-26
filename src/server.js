const path = require('path');
const express = require('express');

// Importar o módulo já abre a conexão e cria as tabelas
require('./database');
const linksRouter = require('./routes/links');
const redirectRouter = require('./routes/redirect');
const { notFound, pageNotFound, errorHandler } = require('./errors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/links', linksRouter);
app.use('/api', notFound);

// Depois da API: senão GET /api casaria com /:code e responderia HTML em vez de JSON
app.use(redirectRouter);
app.use(pageNotFound);

// Precisa ser o último middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
