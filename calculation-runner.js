// Own calculation errors here, not through a catch-all window error listener.
// A failed/unsupported background worker falls back to the very same model and path count.
export function createCalculationRunner({ createWorker, calculate, onResult, onError, timeoutMs = 15000,
  schedule = setTimeout, unschedule = clearTimeout }) {
  let active = null, sequence = 0, workersAvailable = true;

  function cancel() {
    const task = active;
    active = null; // Invalidate even callbacks already queued before termination.
    task?.stop();
  }

  function start(settings) {
    cancel();
    const task = { id: ++sequence, settings: { ...settings }, worker: null, watchdog: null, fallbackTimer: null, fallingBack: false };
    active = task;
    const current = () => active === task;
    const stopWorker = () => {
      if (task.watchdog !== null) unschedule(task.watchdog);
      task.watchdog = null;
      const worker = task.worker;
      task.worker = null;
      if (worker) {
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
      }
    };
    task.stop = () => {
      stopWorker();
      if (task.fallbackTimer !== null) unschedule(task.fallbackTimer);
      task.fallbackTimer = null;
    };
    const finish = (callback, value) => {
      if (!current()) return;
      active = null;
      task.stop();
      callback(value);
    };
    const fallback = () => {
      if (!current() || task.fallingBack) return;
      task.fallingBack = true;
      workersAvailable = false; // Don't repeat a known-broken worker on every slider movement.
      stopWorker();
      task.fallbackTimer = schedule(() => {
        task.fallbackTimer = null;
        if (!current()) return;
        let result;
        try { result = calculate(task.settings); }
        catch (error) { finish(onError, error); return; }
        finish(onResult, result);
      }, 0); // Let the updating state paint first; no reduced-fidelity result or silent input reset.
    };

    if (!workersAvailable) { fallback(); return; }
    try {
      task.worker = createWorker();
      if (!task.worker) { fallback(); return; }
      task.worker.onmessage = ({ data }) => {
        if (!current() || task.fallingBack || data?.id !== task.id) return;
        if (data.error) finish(onError, new Error(data.error)); // A model error is not a transport failure.
        else if (data.result) finish(onResult, data.result);
        else fallback();
      };
      task.worker.onerror = event => { event.preventDefault?.(); fallback(); };
      task.worker.onmessageerror = fallback;
      task.watchdog = schedule(fallback, timeoutMs);
      task.worker.postMessage({ id: task.id, settings: task.settings });
    } catch { fallback(); }
  }

  return { start, cancel };
}
