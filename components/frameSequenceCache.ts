export type DecodedSequenceFrame = CanvasImageSource & {
  readonly width: number;
  readonly height: number;
  close?: () => void;
};

type FrameSequenceCacheOptions = {
  count: number;
  hotLimit?: number;
  maxActiveDecodes?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  load: (index: number) => Promise<Blob>;
  decode: (blob: Blob) => Promise<DecodedSequenceFrame>;
};

export class FrameSequenceCache {
  private readonly count: number;
  private readonly hotLimit: number;
  private readonly maxActiveDecodes: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly load: (index: number) => Promise<Blob>;
  private readonly decode: (blob: Blob) => Promise<DecodedSequenceFrame>;
  private readonly blobs = new Map<number, Blob>();
  private readonly blobLoads = new Map<number, Promise<Blob>>();
  private readonly frames = new Map<number, DecodedSequenceFrame>();
  private readonly active = new Set<number>();
  private readonly failures = new Map<number, number>();
  private readonly retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private desired = new Set<number>();
  private queue: number[] = [];
  private warmPromise: Promise<void> | null = null;
  private destroyed = false;

  constructor({
    count,
    hotLimit = 48,
    maxActiveDecodes = 3,
    maxRetries = 2,
    retryDelayMs = 800,
    load,
    decode,
  }: FrameSequenceCacheOptions) {
    if (count < 1 || hotLimit < 1 || maxActiveDecodes < 1) {
      throw new Error("Frame sequence limits must be positive");
    }
    this.count = count;
    this.hotLimit = Math.min(hotLimit, count);
    this.maxActiveDecodes = maxActiveDecodes;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.load = load;
    this.decode = decode;
  }

  get decodedCount() {
    return this.frames.size;
  }

  get compressedCount() {
    return this.blobs.size;
  }

  get activeDecodeCount() {
    return this.active.size;
  }

  get queuedDecodeCount() {
    return this.queue.length;
  }

  private canAttempt(index: number) {
    const failures = this.failures.get(index) ?? 0;
    return failures <= this.maxRetries && !this.retryTimers.has(index);
  }

  private normalize(index: number) {
    return ((Math.round(index) % this.count) + this.count) % this.count;
  }

  get(index: number): DecodedSequenceFrame | null {
    return this.frames.get(this.normalize(index)) ?? null;
  }

  private ensureBlob(index: number): Promise<Blob> {
    const cached = this.blobs.get(index);
    if (cached) return Promise.resolve(cached);
    if (this.destroyed) return Promise.reject(new Error("Frame cache is destroyed"));

    const existing = this.blobLoads.get(index);
    if (existing) return existing;

    const promise = this.load(index)
      .then((blob) => {
        if (!this.destroyed) this.blobs.set(index, blob);
        return blob;
      })
      .finally(() => {
        if (this.blobLoads.get(index) === promise) {
          this.blobLoads.delete(index);
        }
      });
    this.blobLoads.set(index, promise);
    return promise;
  }

  prefetchCompressed(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.warmPromise) return this.warmPromise;

    let next = 0;
    const worker = async () => {
      while (!this.destroyed && next < this.count) {
        const index = next++;
        try {
          await this.ensureBlob(index);
        } catch {
          // A visible target can retry a failed warm load on demand.
        }
      }
    };
    this.warmPromise = Promise.all([worker(), worker()]).then(() => undefined);
    return this.warmPromise;
  }

  setTarget(index: number, direction: 1 | -1 = 1, limit = this.hotLimit) {
    if (this.destroyed) return;

    const center = this.normalize(index);
    const windowSize = Math.max(1, Math.min(this.hotLimit, Math.round(limit)));
    const forwardSlots = Math.ceil((windowSize - 1) * 0.75);
    const backwardSlots = windowSize - 1 - forwardSlots;
    const ordered: number[] = [];
    const desired = new Set<number>();
    const add = (candidate: number) => {
      const normalized = this.normalize(candidate);
      if (desired.has(normalized)) return;
      desired.add(normalized);
      ordered.push(normalized);
    };

    add(center);
    for (let offset = 1; offset <= forwardSlots; offset += 1) {
      add(center + direction * offset);
    }
    for (let offset = 1; offset <= backwardSlots; offset += 1) {
      add(center - direction * offset);
    }

    this.desired = desired;
    this.queue = ordered.filter((candidate) => (
      !this.frames.has(candidate)
      && !this.active.has(candidate)
      && this.canAttempt(candidate)
    ));

    for (const [cachedIndex, frame] of this.frames) {
      if (desired.has(cachedIndex)) continue;
      frame.close?.();
      this.frames.delete(cachedIndex);
    }
    this.pump();
  }

  private pump() {
    if (this.destroyed) return;
    while (this.active.size < this.maxActiveDecodes && this.queue.length > 0) {
      const index = this.queue.shift();
      if (index === undefined) break;
      if (
        !this.desired.has(index)
        || this.frames.has(index)
        || this.active.has(index)
        || !this.canAttempt(index)
      ) continue;

      this.active.add(index);
      void (async () => {
        try {
          const blob = await this.ensureBlob(index);
          if (this.destroyed || !this.desired.has(index)) return;
          const frame = await this.decode(blob);
          if (this.destroyed || !this.desired.has(index)) {
            frame.close?.();
            return;
          }
          this.frames.set(index, frame);
          this.failures.delete(index);
        } catch {
          if (!this.destroyed && this.desired.has(index)) {
            this.scheduleRetry(index);
          }
        } finally {
          this.active.delete(index);
          this.pump();
        }
      })();
    }
  }

  private scheduleRetry(index: number) {
    const attempts = (this.failures.get(index) ?? 0) + 1;
    this.failures.set(index, attempts);
    if (attempts > this.maxRetries) return;

    const timer = setTimeout(() => {
      this.retryTimers.delete(index);
      if (this.destroyed || !this.desired.has(index) || this.frames.has(index)) return;
      this.queue.push(index);
      this.pump();
    }, this.retryDelayMs * attempts);
    this.retryTimers.set(index, timer);
  }

  clearDecoded() {
    this.desired.clear();
    this.queue = [];
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.failures.clear();
    for (const frame of this.frames.values()) frame.close?.();
    this.frames.clear();
  }

  destroy() {
    this.destroyed = true;
    this.clearDecoded();
    this.blobs.clear();
  }
}
