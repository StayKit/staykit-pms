/**
 * Next.js instrumentation hook — runs once when the server process starts. We use it
 * to launch the in-process background worker (notification drain + daily cron). It
 * runs only in the Node.js runtime (not Edge), and can be disabled with
 * STAYKIT_DISABLE_WORKER=1 (e.g. when running a separate worker container).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.STAYKIT_DISABLE_WORKER === "1") return;
  if (process.env.NODE_ENV === "test") return;
  const { startWorker } = await import("./lib/jobs/worker");
  startWorker();
}
