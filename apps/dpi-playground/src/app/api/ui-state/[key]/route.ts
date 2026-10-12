import { hub } from "@/hub/hub";
import { readJson, safe } from "@/hub/http";

type Context = { params: Promise<{ key: string }> };

export async function GET(_: Request, { params }: Context) {
  return Response.json({ value: hub().registry.uiGet((await params).key) ?? null });
}

export const PUT = (request: Request, { params }: Context) =>
  safe(async () => {
    const body = (await readJson(request)) as { value?: unknown } | undefined;
    hub().registry.uiSet((await params).key, body?.value ?? null);
    return Response.json({ ok: true });
  });
