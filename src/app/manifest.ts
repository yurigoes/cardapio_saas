import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "Cardápio SaaS",
    short_name:       "Cardápio",
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
