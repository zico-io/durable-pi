// Start the hub (registry, device monitor, stream mux) with the server, not on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") (await import("./hub/hub")).start();
}
