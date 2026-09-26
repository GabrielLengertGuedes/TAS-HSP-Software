// Fuso usado para decidir a que dia do calendário pertence um acesso.
// O Intl traz os dados de fuso embutidos no Node, então o resultado não depende
// do fuso configurado na máquina (variável TZ). Pelo mesmo motivo, este módulo
// não usa getDate()/getHours() nem o modificador 'localtime' do SQLite.
const TIME_ZONE = 'America/Sao_Paulo';

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Retorna o dia do calendário de Brasília ('YYYY-MM-DD') de um instante.
// formatToParts evita depender da ordem dos campos que cada locale usa.
function toLocalDay(date) {
  const parts = {};
  for (const { type, value } of dayFormatter.formatToParts(date)) {
    parts[type] = value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Soma dias a uma data 'YYYY-MM-DD'. A conta é feita em UTC só como calendário,
// sem horário, então não sofre com fuso nem com horário de verão.
function addDays(day, amount) {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + amount)).toISOString().slice(0, 10);
}

module.exports = { TIME_ZONE, toLocalDay, addDays };
