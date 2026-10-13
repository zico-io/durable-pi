import type { Metadata, Viewport } from "next";
import "../styles/tailwind.css";

export const metadata: Metadata = {
  title: "Durable Pi | Network",
  icons: { icon: { url: "/icons/durable-pi.svg", type: "image/svg+xml" } },
};

export const viewport: Viewport = { themeColor: "#171214" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
