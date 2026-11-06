import { vi } from "vitest";
import { API } from "./fixtures";

type Reply = { status: number; body?: unknown };
/** A function handler may return a promise, to hold a response back (see deferred()). */
type Handler = Reply | ((call: RecordedCall) => Reply | Promise<Reply>);

export type RecordedCall = {
  method: string;
  path: string;
  headers: Headers;
  body: BodyInit | null | undefined;
  json: () => unknown;
};

export const ok = (body: unknown, status = 200): Reply => ({ status, body });
export const noContent = (): Reply => ({ status: 204 });
export const apiError = (status: number, code: string, message = code): Reply => ({
  status,
  body: { error: { code, message } },
});

/**
 * A reply the test sends later, for asserting what shows while a request is in flight:
 *
 *   const refresh = deferred();
 *   mockApi({ "GET /posts/10": refresh.handler });
 *   ...
 *   await act(async () => refresh.resolve(ok(post)));
 */
export function deferred() {
  let resolve!: (reply: Reply) => void;
  const promise = new Promise<Reply>((r) => (resolve = r));
  return { handler: () => promise, resolve };
}

/**
 * Replaces global fetch with a route table keyed by "METHOD /path".
 * Unmatched requests fail the test loudly instead of hanging.
 *
 *   const api = mockApi({ "GET /posts": ok([makePost()]) });
 *   ...
 *   expect(api.calls("POST /posts")[0].json()).toEqual({...});
 */
export function mockApi(routes: Record<string, Handler>) {
  const recorded: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.origin !== API) {
      throw new Error(`mockApi: request to unexpected origin ${url.origin}`);
    }
    const method = (init.method ?? "GET").toUpperCase();
    const call: RecordedCall = {
      method,
      path: url.pathname,
      headers: new Headers(init.headers),
      body: init.body,
      json: () => JSON.parse(String(init.body)),
    };
    recorded.push(call);

    const key = `${method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) {
      throw new Error(`mockApi: no route for ${key}. Known: ${Object.keys(routes).join(", ")}`);
    }
    const reply = typeof handler === "function" ? await handler(call) : handler;
    const body = reply.status === 204 || reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(body, {
      status: reply.status,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    });
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetch: fetchMock,
    calls: (key?: string) =>
      key ? recorded.filter((c) => `${c.method} ${c.path}` === key) : recorded,
  };
}
