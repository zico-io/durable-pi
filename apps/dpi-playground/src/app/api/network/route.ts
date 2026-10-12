import { hub } from "@/hub/hub";

export function GET() {
  const { configFile, monitor } = hub();
  return Response.json({ configFile, devices: monitor.network() });
}
