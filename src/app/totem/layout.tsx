import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cardápio",
  description: "Autoatendimento",
  manifest: "/manifest.json",
  themeColor: "#10b981",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cardápio",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function TotemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
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
