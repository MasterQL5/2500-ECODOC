import { useState } from "react";
import { toast } from "sonner";

/** Runs one filing at a time, with a busy flag for the buttons and a toast for the outcome. */
export function useFiling() {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Filing refused");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, run };
}
