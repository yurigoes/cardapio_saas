import { MetadataRoute } from "next";
import { getSaasBranding } from "@/lib/branding/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getSaasBranding();
  return {
    name:             b.nome,
    short_name:       b.nome.length > 12 ? b.nome.slice(0, 12) : b.nome,
    description:      "Sistema de gestão para restaurantes",
    start_url:        "/",
    display:          "standalone",
    background_color: "#020617",
    theme_color:      "#10B981",
    orientation:      "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    categories: ["food", "business"],
  };
}
