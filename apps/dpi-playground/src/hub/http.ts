export const err = (code: string, message: string) => ({ error: { code, message } });

export const fail = (status: number, message: string) => Object.assign(Error(message), { status });

const MAX_BODY = 256 * 1024;

/** The request's JSON body, or undefined when it has none. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw fail(413, "Request body too large");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, "Invalid JSON body");
  }
}

/** Run a route handler; a thrown error answers as JSON with its status (default 400). */
export async function safe(fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    return Response.json(err(status === 404 ? "not_found" : "invalid", (e as Error).message), {
      status,
    });
  }
}
