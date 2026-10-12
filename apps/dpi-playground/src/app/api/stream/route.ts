import { hub } from "@/hub/hub";

export function GET(request: Request) {
  return hub().mux.open(request.signal);
}
