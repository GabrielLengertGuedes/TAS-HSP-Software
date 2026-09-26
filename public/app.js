'use strict';

// Regra de segurança deste arquivo: dados da API ou do usuário só entram na página
// via textContent ou propriedades (href), nunca via innerHTML.

const NETWORK_ERROR_MESSAGE = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
const UNEXPECTED_ERROR_MESSAGE = 'O servidor respondeu de forma inesperada. Tente novamente.';

// Faz a requisição e devolve o corpo em JSON.
// Em caso de falha, lança Error com a message que a API já devolve.
async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Corpo vazio ou que não é JSON: tratado abaixo
  }

  if (!response.ok) {
    throw new Error(body?.error?.message || UNEXPECTED_ERROR_MESSAGE);
  }
  if (body === null) {
    throw new Error(UNEXPECTED_ERROR_MESSAGE);
  }
  return body;
}

// aria-disabled em vez de disabled: um botão disabled perde o foco em alguns
// navegadores, e quem usa teclado ficaria sem referência na página
function setLoading(button, isLoading, loadingText) {
  if (isLoading) {
    button.dataset.label = button.textContent;
    button.textContent = loadingText;
    button.setAttribute('aria-disabled', 'true');
  } else {
    button.textContent = button.dataset.label;
    button.removeAttribute('aria-disabled');
  }
}

function isLoading(button) {
  return button.getAttribute('aria-disabled') === 'true';
}

function showFieldError(input, errorElement, message) {
  errorElement.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

function clearFieldError(input, errorElement) {
  errorElement.textContent = '';
  input.removeAttribute('aria-invalid');
}

// Mensagem na região role="status". tone 'success' deixa o texto verde.
function setStatus(element, text, tone) {
  element.textContent = text;
  element.classList.toggle('message-success', tone === 'success');
}

// Criar link

// Esquema no início, como "https:", "ftp:" ou "javascript:" (RFC 3986)
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

// Quem digita "www.google.com" recebe o https:// automaticamente. Com qualquer
// esquema, o texto vai como está e a API decide se aceita.
function addDefaultProtocol(value) {
  const trimmed = value.trim();
  if (trimmed === '' || SCHEME_PATTERN.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const createForm = document.getElementById('create-form');
const urlInput = document.getElementById('url-input');
const createButton = document.getElementById('create-button');
const createError = document.getElementById('create-error');
const createResult = document.getElementById('create-result');
const createStatus = document.getElementById('create-status');
const shortLink = document.getElementById('short-link');
const copyButton = document.getElementById('copy-button');
const showStatsButton = document.getElementById('show-stats-button');

let lastCreatedShortUrl = null;

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isLoading(createButton)) return;

  clearFieldError(urlInput, createError);
  createResult.hidden = true;
  setStatus(createStatus, 'Criando link...');
  setLoading(createButton, true, 'Criando...');

  try {
    // A validação e a mensagem de erro continuam sendo da API
    const data = await requestJson('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: addDefaultProtocol(urlInput.value) }),
    });
    showCreatedLink(data);
  } catch (err) {
    setStatus(createStatus, '');
    showFieldError(urlInput, createError, err.message);
  } finally {
    setLoading(createButton, false);
  }
});

function showCreatedLink(data) {
  lastCreatedShortUrl = data.shortUrl;
  shortLink.href = data.shortUrl;
  shortLink.textContent = data.shortUrl;
  createResult.hidden = false;
  setStatus(createStatus, 'Link criado com sucesso.', 'success');
}

copyButton.addEventListener('click', async () => {
  // Limpa antes para o leitor de tela anunciar de novo se a pessoa copiar duas vezes
  setStatus(createStatus, '');
  try {
    // navigator.clipboard só existe em contexto seguro (https ou localhost)
    await navigator.clipboard.writeText(shortLink.textContent);
    setStatus(createStatus, 'Link copiado.', 'success');
  } catch {
    window.getSelection().selectAllChildren(shortLink);
    setStatus(createStatus, 'Não foi possível copiar automaticamente. O link foi selecionado para você copiar.');
  }
});

// Estatísticas

// Mesmo formato de src/utils/code.js
const CODE_PATTERN = /^[a-zA-Z0-9]{6}$/;
// Até este número de dias, todos os dias recebem rótulo no gráfico
const MAX_DAYS_ALL_LABELED = 7;
// Acima disso, um rótulo a cada semana, contando a partir de hoje
const LABEL_INTERVAL_DAYS = 7;

const statsForm = document.getElementById('stats-form');
const codeInput = document.getElementById('code-input');
const statsButton = document.getElementById('stats-button');
const statsError = document.getElementById('stats-error');
const statsStatus = document.getElementById('stats-status');
const statsResult = document.getElementById('stats-result');
const statsResultTitle = document.getElementById('stats-result-title');
const statsCode = document.getElementById('stats-code');
const statsOriginal = document.getElementById('stats-original');
const metricTotal = document.getElementById('metric-total');
const metricLast = document.getElementById('metric-last');
const metricCreated = document.getElementById('metric-created');
const statsEmpty = document.getElementById('stats-empty');
const chart = document.getElementById('chart');
const chartDetails = document.getElementById('chart-details');
const chartTableBody = document.getElementById('chart-table-body');

// Aceita o código puro ou o link curto completo, com ou sem protocolo,
// query string, fragmento ou barra final. Retorna null se não achar um código válido.
// O domínio não é conferido: BASE_URL pode ser diferente do host desta página.
function extractCode(input) {
  const path = input.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const code = path.slice(path.lastIndexOf('/') + 1);
  return CODE_PATTERN.test(code) ? code : null;
}

statsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitStatsQuery();
});

// Retorna true quando as estatísticas foram exibidas
async function submitStatsQuery() {
  if (isLoading(statsButton)) return false;

  clearFieldError(codeInput, statsError);
  statsResult.hidden = true;

  if (codeInput.value.trim() === '') {
    showFieldError(codeInput, statsError, 'Informe o link curto ou o código.');
    return false;
  }
  const code = extractCode(codeInput.value);
  if (!code) {
    showFieldError(codeInput, statsError,
      'Não reconhecemos um código nesse texto. Cole o link curto completo ou só o código de 6 letras e números.');
    return false;
  }

  setStatus(statsStatus, 'Carregando estatísticas...');
  setLoading(statsButton, true, 'Consultando...');

  try {
    const data = await requestJson(`/api/links/${encodeURIComponent(code)}/stats`);
    renderStats(data);
    setStatus(statsStatus, `Estatísticas do link ${data.code} carregadas.`);
    return true;
  } catch (err) {
    setStatus(statsStatus, '');
    showFieldError(codeInput, statsError, err.message);
    return false;
  } finally {
    setLoading(statsButton, false);
  }
}

function renderStats(data) {
  const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: data.timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  });

  statsCode.textContent = data.code;
  statsOriginal.href = data.originalUrl;
  statsOriginal.textContent = data.originalUrl;
  metricTotal.textContent = formatNumber(data.totalClicks);
  metricLast.textContent = data.lastAccessAt
    ? dateTimeFormatter.format(new Date(data.lastAccessAt))
    : 'Nunca acessado';
  metricCreated.textContent = dateTimeFormatter.format(new Date(data.createdAt));

  // Um link pode ter acessos antigos e nenhum dentro do período do gráfico
  const hasClicksInPeriod = data.clicksByDay.some((day) => day.clicks > 0);
  if (hasClicksInPeriod) {
    renderChart(data.clicksByDay);
    renderChartTable(data.clicksByDay);
  } else {
    statsEmpty.textContent = data.totalClicks === 0
      ? 'Este link ainda não foi acessado.'
      : `Nenhum acesso nos últimos ${data.clicksByDay.length} dias.`;
  }
  statsEmpty.hidden = hasClicksInPeriod;
  chart.hidden = !hasClicksInPeriod;
  chartDetails.hidden = !hasClicksInPeriod;

  statsResult.hidden = false;
}

function formatNumber(value) {
  return value.toLocaleString('pt-BR');
}

function formatClicks(value) {
  return value === 1 ? '1 acesso' : `${formatNumber(value)} acessos`;
}

// Os dias chegam como texto 'YYYY-MM-DD' no calendário de Brasília.
// new Date('2026-09-25') seria meia-noite UTC e mostraria o dia 24, então só recortamos o texto.
function formatShortDay(day) {
  const [, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}/${month}`;
}

function formatFullDay(day) {
  const [year, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}/${month}/${year}`;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// Índices dos dias que recebem rótulo. Com muitos dias, conta a partir de hoje
// (último índice) de semana em semana: intervalos iguais e hoje sempre aparece.
function pickLabelIndexes(count) {
  const indexes = new Set();
  const step = count <= MAX_DAYS_ALL_LABELED ? 1 : LABEL_INTERVAL_DAYS;
  for (let i = count - 1; i >= 0; i -= step) indexes.add(i);
  return indexes;
}

function renderChart(days) {
  const maxClicks = Math.max(...days.map((day) => day.clicks));
  const labelIndexes = pickLabelIndexes(days.length);
  // Com poucos dias as colunas são largas e o rótulo centralizado cabe nelas
  const anchorEdgeLabels = days.length > MAX_DAYS_ALL_LABELED;

  const axis = createElement('div', 'chart-axis');
  axis.append(createElement('span', null, formatNumber(maxClicks)), createElement('span', null, '0'));

  const bars = createElement('div', 'chart-bars');
  const labels = createElement('div', 'chart-labels');

  days.forEach((day, index) => {
    const column = createElement('div', 'chart-col');
    column.title = `${formatShortDay(day.date)}: ${formatClicks(day.clicks)}`;
    // Dia sem acesso fica sem barra; a linha de base mostra que o dia existe
    if (day.clicks > 0) {
      const bar = createElement('div', 'chart-bar');
      bar.style.height = `${(day.clicks / maxClicks) * 100}%`;
      column.append(bar);
    }
    bars.append(column);

    const slot = createElement('div', 'chart-label-slot');
    if (labelIndexes.has(index)) {
      const label = createElement('span', 'chart-label', formatShortDay(day.date));
      if (anchorEdgeLabels && index === 0) label.classList.add('chart-label-start');
      if (anchorEdgeLabels && index === days.length - 1) label.classList.add('chart-label-end');
      slot.append(label);
    }
    labels.append(slot);
  });

  const plot = createElement('div', 'chart-plot');
  plot.append(bars, labels);
  chart.replaceChildren(axis, plot);
}

function renderChartTable(days) {
  const rows = days.map((day) => {
    const row = document.createElement('tr');
    row.append(
      createElement('td', null, formatFullDay(day.date)),
      createElement('td', null, formatNumber(day.clicks)),
    );
    return row;
  });
  chartTableBody.replaceChildren(...rows);
}

// Atalho: preenche a consulta com o link recém-criado e leva o foco ao resultado
showStatsButton.addEventListener('click', async () => {
  if (!lastCreatedShortUrl) return;
  codeInput.value = lastCreatedShortUrl;
  const loaded = await submitStatsQuery();
  if (loaded) statsResultTitle.focus();
});
