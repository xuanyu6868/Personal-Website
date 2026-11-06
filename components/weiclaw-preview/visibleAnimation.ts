type FrameLoopOptions = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  now: () => number;
  tick: FrameRequestCallback;
  resume: (pausedMs: number) => void;
};

export function createVisibleAnimation({ request, cancel, now, tick, resume }: FrameLoopOptions) {
  let visible = false;
  let pageVisible = true;
  let frame: number | null = null;
  let pausedAt: number | null = null;
  let destroyed = false;

  const step: FrameRequestCallback = (time) => {
    if (destroyed || !visible || !pageVisible) return;
    frame = request(step);
    tick(time);
  };
  const sync = () => {
    if (destroyed) return;
    if (visible && pageVisible) {
      if (frame !== null) return;
      const pausedMs = pausedAt === null ? 0 : now() - pausedAt;
      pausedAt = null;
      resume(pausedMs);
      frame = request(step);
    } else if (frame !== null) {
      cancel(frame);
      frame = null;
      pausedAt = now();
    }
  };
  return {
    setVisible(value: boolean) { visible = value; sync(); },
    setPageVisible(value: boolean) { pageVisible = value; sync(); },
    destroy() {
      destroyed = true;
      if (frame !== null) cancel(frame);
      frame = null;
    },
  };
}
