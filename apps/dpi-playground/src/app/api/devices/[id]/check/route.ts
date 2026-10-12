import { hub } from "@/hub/hub";
import { fail, safe } from "@/hub/http";

// Devices are configured in dpi-network.yaml and `just net register`; the hub only reads them.
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  safe(async () => {
    const { id } = await params;
    const { registry, monitor } = hub();
    if (!registry.get(id)) throw fail(404, `No device ${id}`);
    monitor.check(id);
    return Response.json(await monitor.settled(id));
  });
