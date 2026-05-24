/**
 * Next.js instrumentation hook — runs once when the server process starts. We use it
 * to launch the in-process background worker (notification drain + daily cron). It
 * runs only in the Node.js runtime (not Edge), and can be disabled with
 * STAYKIT_DISABLE_WORKER=1 (e.g. when running a separate worker container).
 */
export async function register() {
  // The node-only worker import MUST stay nested inside this NEXT_RUNTIME check.
  // Next inlines process.env.NEXT_RUNTIME at build time, so the Edge build of this
  // file becomes `if (false) { … }` and webpack drops the import while parsing —
  // even in dev, where there's no tree-shaking. An early `return` guard instead
  // leaves the import as live top-level code, and the Edge build then fails trying
  // to bundle node:crypto (UnhandledSchemeError) via lib/jobs/queue.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.STAYKIT_DISABLE_WORKER === "1") return;
    if (process.env.NODE_ENV === "test") return;
    const { startWorker } = await import("./lib/jobs/worker");
    startWorker();
  }
}
