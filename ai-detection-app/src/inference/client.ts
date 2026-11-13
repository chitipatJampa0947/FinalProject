import { bounded } from './artifacts.ts';
import { CATEGORIES, type DetectResult } from './contract.ts';
export type ProgressFn = (message: string, percentage?: number) => void;
export type InitAssets = { model: ArrayBuffer; tokenizer: ArrayBuffer; tokenizerConfig: ArrayBuffer; modelConfig: ArrayBuffer };
export type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
type Pending = { id: string; resolve: (value: DetectResult) => void; reject: (error: Error) => void };
type Options = {
  artifactId: string; runtimeVersion: string;
  prepare: (progress: ProgressFn, signal: AbortSignal) => Promise<InitAssets>;
  makeWorker: () => WorkerPort;
  initTimeoutMs?: number; detectTimeoutMs?: number;
};
export class InferenceClient {
  private worker: WorkerPort | null = null;
  private ready: Promise<void> | null = null;
  private rejectInit: ((error: Error) => void) | null = null;
  private pending: Pending | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private epoch = 0;
  private prepareAbort: AbortController | null = null;
  private listeners = new Set<ProgressFn>();
  private options: Options;
  constructor(options: Options) { this.options = options; }
  private report: ProgressFn = (message, pct) => {
    for (const listener of this.listeners) listener(message, pct);
  };
  dispose(error = new Error('Inference session disposed')): void {
    this.epoch++;
    this.prepareAbort?.abort(); this.prepareAbort = null;
    this.worker?.terminate();
    this.worker = null; this.ready = null;
    this.rejectInit?.(error); this.rejectInit = null;
    this.pending?.reject(error); this.pending = null;
  }
  load(progress?: ProgressFn): Promise<void> {
    if (progress) this.listeners.add(progress);
    if (!this.ready) {
      const epoch = this.epoch;
      const task = (async () => {
        const controller = new AbortController();
        this.prepareAbort = controller;
        const progress: ProgressFn = (message, pct) => { if (epoch === this.epoch) this.report(message, pct); };
        const assets = await bounded(this.options.prepare(progress, controller.signal), 620_000,
          'Model preparation', () => controller.abort());
        if (epoch !== this.epoch) throw new Error('Initialization cancelled');
        this.prepareAbort = null;
        this.report('กำลังเริ่มต้นโมเดล / Initializing model...', 90);
        const worker = this.options.makeWorker(); this.worker = worker;
        const initialized = new Promise<void>((resolve, reject) => {
          this.rejectInit = reject;
          worker.onmessage = (event: MessageEvent) => {
            if (worker !== this.worker) return;
            const msg = event.data;
            if (msg?.type === 'ready') {
              if (msg.artifactId !== this.options.artifactId || msg.runtimeVersion !== this.options.runtimeVersion) {
                this.dispose(new Error('Worker artifact/runtime mismatch')); return;
              }
              this.rejectInit = null; resolve();
            } else if (msg?.type === 'error') {
              this.dispose(new Error(typeof msg.message === 'string' ? msg.message : 'Worker failed'));
            } else if (msg?.type === 'result' && msg.id === this.pending?.id) {
              const r = msg.result as DetectResult;
              const values = r?.probs && CATEGORIES.map(k => r.probs[k]);
              if (!values || values.length !== 4 || !values.every(x => Number.isFinite(x) && x >= 0 && x <= 1) ||
                  Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-5 ||
                  r.artifactId !== this.options.artifactId ||
                  r.category !== CATEGORIES[values.indexOf(Math.max(...values))] ||
                  !Number.isFinite(r.aiProbability) || Math.abs(r.aiProbability - (1 - r.probs.human)) > 1e-6) {
                this.dispose(new Error('Invalid inference response')); return;
              }
              const pending = this.pending; this.pending = null; pending?.resolve(r);
            }
          };
          worker.onerror = () => { if (worker === this.worker) this.dispose(new Error('Inference worker crashed; please retry')); };
          worker.onmessageerror = () => { if (worker === this.worker) this.dispose(new Error('Invalid worker message')); };
          worker.postMessage({ type: 'init', assets }, Object.values(assets));
        });
        await bounded(initialized, this.options.initTimeoutMs ?? 90_000, 'Model initialization');
        this.report('พร้อมวิเคราะห์ / Ready', 100);
      })();
      this.ready = task.catch(error => {
        if (epoch === this.epoch) this.dispose(error instanceof Error ? error : new Error(String(error)));
        throw error;
      });
    }
    return this.ready.finally(() => { if (progress) this.listeners.delete(progress); });
  }
  detect(text: string): Promise<DetectResult> {
    if (typeof text !== 'string' || text.length > 10_000) return Promise.reject(new Error('Text exceeds supported length'));
    if (this.queued >= 16) return Promise.reject(new Error('Inference queue is full'));
    const epoch = this.epoch; this.queued++;
    const task = this.serial.then(async () => {
      if (epoch !== this.epoch) throw new Error('Inference was reset; please retry');
      await this.load();
      const worker = this.worker;
      if (!worker) throw new Error('Worker unavailable');
      const id = crypto.randomUUID();
      const result = new Promise<DetectResult>((resolve, reject) => {
        this.pending = { id, resolve, reject };
        worker.postMessage({ type: 'detect', id, text });
      });
      return bounded(result, this.options.detectTimeoutMs ?? 120_000, 'Inference',
        () => this.dispose(new Error('Inference timed out')));
    });
    this.serial = task.catch(() => undefined);
    return task.finally(() => { this.queued--; });
  }
}
