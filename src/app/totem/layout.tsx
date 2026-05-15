import type { Metadata } from "next";
import { getSaasBranding } from "@/lib/branding/server";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getSaasBranding();
  return {
    title: `${b.nome} · Autoatendimento`,
    description: `Autoatendimento ${b.nome}`,
    manifest: "/manifest.json",
    themeColor: "#10b981",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: b.nome,
    },
    viewport: {
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
    },
  };
}

import { KioskMirror } from "@/components/KioskMirror";

export default function TotemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <KioskMirror />{/* só ativa se houver agent_token salvo */}
      {/* Register service worker */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').catch(function(err) {
                  console.warn('SW registration failed:', err);
                });
              });
            }
          `,
        }}
      />
    </>
  );
}
