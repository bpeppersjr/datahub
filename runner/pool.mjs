import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';

export class RunnerPool extends EventEmitter {
  constructor({ concurrency = 4 } = {}) {
    super();
    this.concurrency = Math.max(1, Math.min(16, Number(concurrency) || 4));
    this.queue = [];
    this.active = new Map();
    this.cancelled = new Set();
  }

  enqueue(run, job) {
    this.queue.push({ run, job });
    this.emit('queued', { run, job });
    this.#pump();
  }

  setConcurrency(value) {
    this.concurrency = Math.max(1, Math.min(16, Number(value) || 4));
    this.#pump();
    return this.concurrency;
  }

  async cancel(runId) {
    const queuedIndex = this.queue.findIndex((item) => item.run.id === runId);
    if (queuedIndex >= 0) {
      const [{ run, job }] = this.queue.splice(queuedIndex, 1);
      this.emit('cancelled', { run, job });
      return true;
    }

    const active = this.active.get(runId);
    if (!active) return false;
    this.cancelled.add(runId);
    await active.worker.terminate();
    this.active.delete(runId);
    this.emit('cancelled', { run: active.run, job: active.job });
    this.#pump();
    return true;
  }

  stats() {
    return {
      concurrency: this.concurrency,
      active: this.active.size,
      queued: this.queue.length,
      available: Math.max(0, this.concurrency - this.active.size),
      activeRunIds: [...this.active.keys()],
    };
  }

  async close() {
    this.queue.length = 0;
    await Promise.all([...this.active.values()].map(({ worker }) => worker.terminate()));
    this.active.clear();
  }

  #pump() {
    while (this.active.size < this.concurrency && this.queue.length) {
      const { run, job } = this.queue.shift();
      const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
        workerData: { runId: run.id, job },
      });
      const activeEntry = { worker, run, job };
      this.active.set(run.id, activeEntry);
      this.emit('started', { run, job });

      worker.on('message', (message) => {
        this.emit('message', { run, job, message });
        if (message.type === 'completed') this.#finish(run.id, 'completed', message);
        if (message.type === 'failed') this.#finish(run.id, 'failed', message);
      });

      worker.on('error', (error) => {
        if (!this.cancelled.has(run.id)) {
          this.#finish(run.id, 'failed', { type: 'failed', error: error.message });
        }
      });

      worker.on('exit', (code) => {
        if (this.cancelled.delete(run.id)) return;
        if (code !== 0 && this.active.has(run.id)) {
          this.#finish(run.id, 'failed', { type: 'failed', error: `Worker exited with code ${code}.` });
        }
      });
    }
  }

  #finish(runId, outcome, message) {
    const entry = this.active.get(runId);
    if (!entry) return;
    this.active.delete(runId);
    this.emit(outcome, { run: entry.run, job: entry.job, message });
    this.#pump();
  }
}
