const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const ROOT_DIR = path.join(__dirname, '..', '..');
const SERVER_FILE = path.join(ROOT_DIR, 'src', 'server.js');
const STARTUP_TIMEOUT_MS = 10000;

// Pede ao sistema uma porta livre. O server.js não expõe a porta real quando
// recebe PORT=0, então a porta é escolhida aqui e passada pronta.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Cria um diretório temporário para o banco dos testes. Nunca usa data/links.db.
function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'encurtador-test-'));
  return path.join(dir, 'links.db');
}

// Sobe o src/server.js em outro processo, com banco e porta próprios.
// options.dbPath: reaproveita o banco de outro servidor (ex.: comparar fusos).
// options.env: variáveis extras (ex.: TZ).
// options.preload: arquivo carregado com --require antes do servidor.
async function startServer(options = {}) {
  const ownsDb = !options.dbPath;
  const dbPath = options.dbPath || createTempDbPath();
  const port = await getFreePort();

  const args = [];
  if (options.preload) args.push('--require', options.preload);
  args.push(SERVER_FILE);

  const child = spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...options.env, PORT: String(port), DB_PATH: dbPath, BASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const exited = new Promise((resolve) => child.once('exit', resolve));

  await new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Servidor não iniciou em ${STARTUP_TIMEOUT_MS} ms.\n${stderr}`));
    }, STARTUP_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes('Servidor rodando')) {
        clearTimeout(timer);
        resolve();
      }
    });
    exited.then((code) => {
      clearTimeout(timer);
      reject(new Error(`Servidor encerrou com código ${code} antes de iniciar.\n${stderr}`));
    });
  });

  // Conexão do próprio teste, para preparar dados e conferir o banco
  const db = new Database(dbPath);

  async function stop() {
    db.close();
    if (child.exitCode === null) {
      child.kill();
      await exited;
    }
    if (ownsDb) {
      // maxRetries: no Windows o arquivo pode continuar travado por alguns instantes
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }

  return { baseUrl: `http://127.0.0.1:${port}`, dbPath, db, stop, getStderr: () => stderr };
}

module.exports = { startServer };
