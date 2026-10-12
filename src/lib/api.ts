import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Wraps a route handler so thrown ApiErrors / unexpected errors become JSON. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid input", result.error.issues);
  }
  return result.data;
}

export async function requireUser(roles?: UserRole[]) {
  const session = await getSession();
  if (!session.user || !session.profile) throw new ApiError(401, "Please sign in first");
  if (roles && !roles.includes(session.profile.role)) throw new ApiError(403, "You don't have access to this");
  return session as typeof session & {
    user: NonNullable<typeof session.user>;
    profile: NonNullable<typeof session.profile>;
  };
}

/** Maps Postgres errors raised by our RPCs to friendly API errors. */
export function fromPgError(error: { message: string; code?: string }): ApiError {
  const status =
    error.code === "28000" ? 401 :
    error.code === "42501" ? 403 :
    error.code === "P0002" ? 404 :
    error.code === "P0001" ? 409 :
    error.code === "22023" ? 400 : 500;
  return new ApiError(status, status === 500 ? "Database error. Please try again." : error.message);
}
