/**
 * Per-ship FIFO locks. A call on a ship waits for the calls queued before it.
 *
 * A waiter that gives up (timeout) keeps its place in the queue; when its turn
 * comes it releases at once so the calls behind it proceed. Without that, the
 * abandoned slot never opens and every later call on the ship times out until
 * the harness restarts.
 */
export class ShipLocks {
  private tails = new Map<string, Promise<unknown>>();
  private holders = new Map<string, string>();

  acquire(symbol: string, timeoutMs: number, label = "call"): Promise<() => void> {
    const prev = this.tails.get(symbol) ?? Promise.resolve();
    let open!: () => void;
    const gate = new Promise<void>(res => {
      open = res;
    });
    const next = prev.then(() => gate);
    this.tails.set(symbol, next);
    void next.then(() => {
      if (this.tails.get(symbol) === next) this.tails.delete(symbol);
    });

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (this.holders.get(symbol) === label) this.holders.delete(symbol);
      open();
    };

    return new Promise<() => void>((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        const holder = this.holders.get(symbol);
        reject(new Error(`ship lock timeout for ${symbol} after ${Math.round(timeoutMs / 1000)}s${holder ? ` (still busy with ${holder})` : ""}`));
      }, timeoutMs);
      void prev.then(() => {
        if (timedOut) {
          release();
          return;
        }
        clearTimeout(timer);
        this.holders.set(symbol, label);
        resolve(release);
      });
    });
  }

  /** True while any call holds or waits for the ship's lock. */
  busy(symbol: string): boolean {
    return this.tails.has(symbol);
  }
}
