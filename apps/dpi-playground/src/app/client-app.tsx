"use client";
import dynamic from "next/dynamic";

// The page is a live view of the hub's streams with nothing to render on the server.
const App = dynamic(() => import("../App"), { ssr: false });

export default function ClientApp() {
  return <App />;
}
