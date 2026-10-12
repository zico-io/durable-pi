import { hub } from "@/hub/hub";
import { safe } from "@/hub/http";
import { proxyDevice } from "@/hub/device-proxy";

const handler = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  safe(async () => {
    const { registry, monitor } = hub();
    return proxyDevice(request, (await params).id, registry, monitor);
  });

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
