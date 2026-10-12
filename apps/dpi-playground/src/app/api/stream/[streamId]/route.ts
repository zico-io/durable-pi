import { hub } from "@/hub/hub";
import { readJson, safe } from "@/hub/http";

export const PUT = (request: Request, { params }: { params: Promise<{ streamId: string }> }) =>
  safe(async () => {
    const body = (await readJson(request)) as { subs?: unknown } | undefined;
    return Response.json(hub().mux.subscribe((await params).streamId, body?.subs));
  });
