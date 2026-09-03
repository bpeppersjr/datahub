import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER_PORT = 4300;
const RUNNER_BASE_URL = `http://127.0.0.1:${RUNNER_PORT}`;
const RUNNER_STATUS_URL = `${RUNNER_BASE_URL}/api/status`;
const DASHBOARD_URL = 'http://localhost:3000/';
const controlToken = !app.isPackaged && process.env.DATAHUB_CONTROL_TOKEN
  ? process.env.DATAHUB_CONTROL_TOKEN
  : randomBytes(32).toString('base64url');

let mainWindow = null;
let runnerProcess = null;
let runnerOwned = false;

function runtimeRoot() {
  if (app.isPackaged) return path.dirname(process.execPath);
  if (!process.env.DATAHUB_ROOT) return SOURCE_ROOT;
  const configured = path.resolve(process.env.DATAHUB_ROOT);
  const relative = path.relative(SOURCE_ROOT, configured);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Desktop DATAHUB_ROOT must stay inside the datahub repository.');
  return configured;
}

function applicationRoot() {
  return app.isPackaged ? app.getAppPath() : SOURCE_ROOT;
}

function dashboardPath() {
  return path.join(applicationRoot(), 'desktop-dist', 'index.html');
}

function isTrustedDashboardUrl(value) {
  try {
    const target = new URL(value);
    target.hash = '';
    target.search = '';
    return target.href === pathToFileURL(dashboardPath()).href;
  } catch {
    return false;
  }
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
    const response = await fetch(RUNNER_STATUS_URL, {
      headers: { Authorization: `Bearer ${controlToken}` },
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runnerPortIsOccupied() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: RUNNER_PORT });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(1200, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', (error) => finish(error.code !== 'ECONNREFUSED'));
  });
}

async function startRunner() {
  if (await runnerPortIsOccupied()) throw new Error(`Port ${RUNNER_PORT} is already occupied; the desktop will not disclose its control token to that process.`);

  const runnerEntry = path.join(applicationRoot(), 'runner', 'server.mjs');
  const browserDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'playwright-browsers')
    : runtimePath('.playwright-browsers');

  runnerOwned = true;
  runnerProcess = spawn(process.execPath, [runnerEntry], {
    cwd: runtimeRoot(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DATAHUB_ROOT: runtimeRoot(),
      DATAHUB_CONTROL_TOKEN: controlToken,
      RUNNER_PORT: String(RUNNER_PORT),
      PLAYWRIGHT_BROWSERS_PATH: browserDirectory,
    },
  });

  let childAnnouncedReady = false;
  runnerProcess.on('message', (message) => {
    if (message?.type === 'runner-ready' && message.host === '127.0.0.1' && message.port === RUNNER_PORT) childAnnouncedReady = true;
  });
  runnerProcess.stdout.on('data', (chunk) => void log(`runner: ${String(chunk).trim()}`));
  runnerProcess.stderr.on('data', (chunk) => void log(`runner error: ${String(chunk).trim()}`));
  runnerProcess.on('exit', (code) => void log(`Runner stopped with code ${code}.`));
  runnerProcess.on('error', (error) => void log(`Runner could not start: ${error.message}`));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (runnerProcess.exitCode !== null) throw new Error(`The local runner exited during startup with code ${runnerProcess.exitCode}.`);
    if (childAnnouncedReady && await runnerIsReady()) return;
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
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  const state = { ...window.getBounds(), maximized: window.isMaximized() };
  await mkdir(runtimePath('data'), { recursive: true });
  await writeFile(runtimePath('data', 'window-state.json'), JSON.stringify(state, null, 2), 'utf8');
}

function safeDownloadName(value) {
  return path.basename(value || 'cotive-collector-output.json').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function createWindow() {
  const state = await readWindowState();
  mainWindow = new BrowserWindow({
    title: 'Co*Tive Collector',
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
      preload: path.join(applicationRoot(), 'desktop', 'preload.cjs'),
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${RUNNER_BASE_URL}/api/runs/`) && url.endsWith('/output')) {
      mainWindow.webContents.downloadURL(url);
    } else if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedDashboardUrl(url)) return;
    event.preventDefault();
    if (url.startsWith(`${RUNNER_BASE_URL}/api/runs/`) && url.endsWith('/output')) {
      mainWindow.webContents.downloadURL(url);
    } else if (/^https?:\/\//i.test(url) && url !== DASHBOARD_URL) {
      void shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('close', () => {
    void saveWindowState().catch((error) => {
      void log(`Window state could not be saved: ${error.message}`).catch(() => {});
    });
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadFile(dashboardPath());
}

ipcMain.handle('cotive:runner-connection', (event) => {
  if (!mainWindow
    || event.sender !== mainWindow.webContents
    || event.senderFrame !== mainWindow.webContents.mainFrame
    || !isTrustedDashboardUrl(event.senderFrame.url)) {
    throw new Error('Control token request is not from the trusted Co*Tive Collector document.');
  }
  return { runnerUrl: RUNNER_BASE_URL, controlToken };
});

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
      await startRunner();
      await createWindow();
    } catch (error) {
      await log(error instanceof Error ? error.stack || error.message : String(error));
      if (process.env.DATAHUB_DESKTOP_TEST_MODE !== '1') {
        dialog.showErrorBox('Co*Tive Collector could not start securely', error instanceof Error ? error.message : String(error));
      }
      app.quit();
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
