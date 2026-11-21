import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON-safe serializer: BigInt → string, Bytes are never sent. */
export function json(data: unknown, init?: ResponseInit) {
  return new NextResponse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? undefined : v)),
    { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } },
  );
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) return json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      console.error("[api]", err);
      return json({ error: "Internal error" }, { status: 500 });
    }
  };
}
