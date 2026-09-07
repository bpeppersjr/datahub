import process from "node:process";

/** Wire SIGINT/SIGTERM and parent IPC cancellation into one AbortSignal. */
export function createCliCancellation({ processRef = process } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const message = (value) => { if (value?.type === "cancel") abort(); };
  processRef.on?.("SIGINT", abort);
  processRef.on?.("SIGTERM", abort);
  processRef.on?.("message", message);
  // IPC remains available for cancellation while work is active, but must not
  // prevent a successful direct CLI from exiting after its build completes.
  processRef.channel?.unref?.();
  return {
    signal: controller.signal,
    dispose() {
      processRef.off?.("SIGINT", abort);
      processRef.off?.("SIGTERM", abort);
      processRef.off?.("message", message);
      if (processRef.connected && typeof processRef.disconnect === "function") processRef.disconnect();
    },
  };
}
