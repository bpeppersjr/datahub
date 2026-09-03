const DEFAULT_RUNNER_URL = 'http://127.0.0.1:4300';

type RunnerConnection = { runnerUrl: string; controlToken: string };

declare global {
  interface Window {
    cotiveCollector?: {
      getRunnerConnection: () => Promise<RunnerConnection>;
    };
  }
}

let connectionPromise: Promise<RunnerConnection> | null = null;

async function runnerConnection() {
  if (!connectionPromise) {
    connectionPromise = typeof window !== 'undefined' && window.cotiveCollector
      ? window.cotiveCollector.getRunnerConnection()
      : Promise.resolve({
          runnerUrl: import.meta.env.VITE_DATAHUB_RUNNER_URL || DEFAULT_RUNNER_URL,
          controlToken: import.meta.env.VITE_DATAHUB_CONTROL_TOKEN || '',
        });
  }
  return connectionPromise;
}

export async function runnerFetch(path: string, options: RequestInit = {}) {
  const connection = await runnerConnection();
  const runnerUrl = connection.runnerUrl.replace(/\/$/, '');
  const headers = new Headers(options.headers);
  if (connection.controlToken) headers.set('Authorization', `Bearer ${connection.controlToken}`);
  return fetch(`${runnerUrl}${path}`, { ...options, headers });
}

export async function runnerJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await runnerFetch(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Runner returned HTTP ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function downloadRunnerArtifact(path: string, fallbackName: string) {
  const response = await runnerFetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Runner returned HTTP ${response.status}.`);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const declaredName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const filename = (declaredName || fallbackName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  try {
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
