export type PaperRenderSchedulerOptions = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frame: number) => void;
  render: () => void;
};

export type PaperRenderScheduler = {
  schedule: () => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

export function createPaperRenderScheduler(options: PaperRenderSchedulerOptions): PaperRenderScheduler {
  let frame = 0;
  let visible = true;
  let dirty = false;
  let disposed = false;

  const request = () => {
    if (disposed || !visible || frame !== 0 || !dirty) return;
    frame = options.requestFrame(() => {
      frame = 0;
      if (disposed || !visible || !dirty) return;
      dirty = false;
      options.render();
    });
  };

  return {
    schedule() {
      if (disposed) return;
      dirty = true;
      request();
    },
    setVisible(nextVisible) {
      if (disposed) return;
      visible = nextVisible;
      if (!visible && frame !== 0) {
        options.cancelFrame(frame);
        frame = 0;
      }
      if (visible) request();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== 0) options.cancelFrame(frame);
      frame = 0;
      dirty = false;
    },
  };
}
