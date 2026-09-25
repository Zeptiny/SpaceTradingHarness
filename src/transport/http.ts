import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { runtime } from "../state/runtime.js";
import { parseReset } from "../state/ratelimit.js";
import { routes, type RouteName } from "../generated/routes.js";

export class SpaceTradersError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(`[${status} ${code}] ${message}`);
    this.name = "SpaceTradersError";
  }
}

export interface RateState {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  lastRequestAt: number;
}

export interface RequestOptions {
  path?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface ApiResult<T> {
  data: T;
  meta?: unknown;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Counts the HTTP requests actually sent inside `countRequests(counter, fn)` —
// including retries and guard reads — so the activity log reports real spend.
const requestCounter = new AsyncLocalStorage<{ n: number }>();

export function countRequests<T>(counter: { n: number }, fn: () => Promise<T>): Promise<T> {
  return requestCounter.run(counter, fn);
}

class Transport {
  rate: RateState = { limit: null, remaining: null, resetAt: null, lastRequestAt: 0 };
  private queue: Promise<unknown> = Promise.resolve();

  request<T = unknown>(routeName: RouteName, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    const run = () => this.doRequest<T>(routeName, opts);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async doRequest<T>(routeName: RouteName, opts: RequestOptions): Promise<ApiResult<T>> {
    const route = routes[routeName];
    if (!route) throw new Error(`Unknown route: ${routeName}`);

    let url = config.baseUrl + route.path;
    for (const p of route.pathParams) {
      const v = opts.path?.[p];
      if (v === undefined) throw new Error(`Route ${routeName} missing path param ${p}`);
      url = url.replace(`{${p}}`, encodeURIComponent(String(v)));
    }
    if (opts.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }

    const idempotent = route.method === "GET";
    let attempt = 0;
    // 429s have their own, larger allowance: the server rejected the request
    // without running it, so waiting and resending is always safe, and the
    // agent should only ever see a rate limit as a delay.
    let limited = 0;
    for (;;) {
      await this.pace();
      const counter = requestCounter.getStore();
      if (counter) counter.n++;
      runtime.requestsTotal++;
      let res: Response;
      try {
        res = await fetch(url, {
          method: route.method,
          headers: {
            Accept: "application/json",
            ...(route.method !== "GET" ? { "Content-Type": "application/json" } : {}),
            Authorization: `Bearer ${config.apiToken}`,
          },
          ...(route.method !== "GET"
            ? { body: JSON.stringify(opts.body ?? {}) }
            : {}),
          signal: AbortSignal.timeout(config.transport.timeoutMs),
        });
      } catch (err) {
        // Non-idempotent requests may have committed server-side; never blind-retry them.
        if (idempotent && attempt++ < config.transport.maxRetries) {
          await sleep(500 * attempt);
          continue;
        }
        throw err;
      }

      this.trackRate(res.headers);
      this.rate.lastRequestAt = Date.now();

      if (res.status === 429 && limited++ < config.transport.maxRateLimitRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, config.transport.maxRetryAfterMs)
          : Math.min(1000 * limited, config.transport.maxRetryAfterMs));
        continue;
      }
      if (res.status >= 500 && idempotent && attempt++ < config.transport.maxRetries) {
        await sleep(750 * attempt);
        continue;
      }

      const text = await res.text();
      let json: Record<string, unknown> = {};
      if (text) {
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          if (!res.ok) {
            throw new SpaceTradersError(res.status, 0, `non-JSON error body: ${text.slice(0, 120)}`);
          }
        }
      }

      if (!res.ok) {
        const err = (json["error"] ?? {}) as { message?: string; code?: number; data?: unknown };
        throw new SpaceTradersError(
          res.status,
          err.code ?? 0,
          err.message ?? res.statusText,
          err.data,
        );
      }
      return { data: (json["data"] ?? json) as T, meta: json["meta"] };
    }
  }

  private async pace(): Promise<void> {
    const since = Date.now() - this.rate.lastRequestAt;
    const wait = config.transport.minIntervalMs - since;
    if (wait > 0) await sleep(wait);
  }

  private trackRate(headers: Headers): void {
    // SpaceTraders v2 sends x-ratelimit-{limit-burst,remaining,reset} (reset
    // as an ISO date); the older x-req-ratelimit-* names are kept as fallback.
    const h = (...names: string[]) => names.map(n => headers.get(n)).find(v => v !== null) ?? null;
    const limit = h("x-ratelimit-limit-burst", "x-ratelimit-limit", "x-req-ratelimit-limit");
    const remaining = h("x-ratelimit-remaining", "x-req-ratelimit-remaining");
    const reset = parseReset(h("x-ratelimit-reset", "x-req-ratelimit-reset"));
    const prev = this.rate.remaining;
    this.rate.limit = limit !== null && Number.isFinite(Number(limit)) ? Number(limit) : this.rate.limit;
    this.rate.remaining = remaining !== null && Number.isFinite(Number(remaining)) ? Number(remaining) : this.rate.remaining;
    this.rate.resetAt = reset ?? this.rate.resetAt;
    runtime.rate = {
      limit: this.rate.limit,
      remaining: this.rate.remaining,
      resetAt: this.rate.resetAt,
    };
    if (this.rate.remaining !== prev) {
      bus.emit({
        type: "RateBudgetChanged",
        ts: Date.now(),
        remaining: this.rate.remaining,
        limit: this.rate.limit,
        resetAt: this.rate.resetAt,
      });
    }
  }
}

export const transport = new Transport();
