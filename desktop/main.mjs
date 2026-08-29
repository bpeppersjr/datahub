import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, session, shell } from 'electron';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER_URL = 'http://127.0.0.1:4300/api/health';
const DASHBOARD_URL = 'http://localhost:3000/';

let mainWindow = null;
let runnerProcess = null;
let runnerOwned = false;

function runtimeRoot() {
  return app.isPackaged ? path.dirname(process.execPath) : SOURCE_ROOT;
}

function applicationRoot() {
  return app.isPackaged ? app.getAppPath() : SOURCE_ROOT;
}

function runtimePath(...parts) {
  return path.join(runtimeRoot(), ...parts);
}

async function log(message) {
  const dataDirectory = runtimePath('data');
  await mkdir(dataDirectory, { recursive: true });
  await appendFile(path.join(dataDirectory, 'desktop.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

async function runnerIsReady() {
  try {
    const response = await fetch(RUNNER_URL, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startRunner() {
  if (await runnerIsReady()) {
    await log('Connected to an existing Atlas Runner service.');
    return;
  }

  const runnerEntry = path.join(applicationRoot(), 'runner', 'server.mjs');
  const browserDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'playwright-browsers')
    : runtimePath('.playwright-browsers');

  runnerOwned = true;
  runnerProcess = spawn(process.execPath, [runnerEntry], {
    cwd: runtimeRoot(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DATAHUB_ROOT: runtimeRoot(),
      PLAYWRIGHT_BROWSERS_PATH: browserDirectory,
    },
  });

  runnerProcess.stdout.on('data', (chunk) => void log(`runner: ${String(chunk).trim()}`));
  runnerProcess.stderr.on('data', (chunk) => void log(`runner error: ${String(chunk).trim()}`));
  runnerProcess.on('exit', (code) => void log(`Runner stopped with code ${code}.`));
  runnerProcess.on('error', (error) => void log(`Runner could not start: ${error.message}`));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await runnerIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('The local runner did not become ready within 20 seconds.');
}

async function readWindowState() {
  try {
    return JSON.parse(await readFile(runtimePath('data', 'window-state.json'), 'utf8'));
  } catch {
    return { width: 1440, height: 920 };
  }
}

async function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  await mkdir(runtimePath('data'), { recursive: true });
  await writeFile(runtimePath('data', 'window-state.json'), JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2), 'utf8');
}

function safeDownloadName(value) {
  return path.basename(value || 'atlas-output.json').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function createWindow() {
  const state = await readWindowState();
  mainWindow = new BrowserWindow({
    title: 'Atlas Runner',
    width: Math.max(980, Number(state.width) || 1440),
    height: Math.max(720, Number(state.height) || 920),
    x: Number.isFinite(state.x) ? state.x : undefined,
    y: Number.isFinite(state.y) ? state.y : undefined,
    minWidth: 920,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#090d11',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:4300/api/runs/') && url.endsWith('/output')) {
      mainWindow.webContents.downloadURL(url);
    } else if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return;
    event.preventDefault();
    if (url.startsWith('http://127.0.0.1:4300/api/runs/') && url.endsWith('/output')) {
      mainWindow.webContents.downloadURL(url);
    } else if (/^https?:\/\//i.test(url) && url !== DASHBOARD_URL) {
      void shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('close', () => void saveWindowState());
  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadFile(path.join(applicationRoot(), 'desktop-dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const downloadDirectory = runtimePath('downloads');
    await mkdir(downloadDirectory, { recursive: true });
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSavePath(path.join(downloadDirectory, safeDownloadName(item.getFilename())));
    });

    try {
      await Promise.all([startRunner(), createWindow()]);
    } catch (error) {
      await log(error instanceof Error ? error.stack || error.message : String(error));
      if (!mainWindow) await createWindow();
    }
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('before-quit', () => {
  if (runnerOwned && runnerProcess && !runnerProcess.killed) runnerProcess.kill();
});

app.on('window-all-closed', () => app.quit());
