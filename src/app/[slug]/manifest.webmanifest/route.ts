import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;

  const manifest = {
    name: `Cardápio Digital - ${slug}`,
    short_name: "Cardápio",
    start_url: `/${slug}`,
    scope: `/${slug}`,
    display: "fullscreen",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    icons: []
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json"
    }
  });
}
