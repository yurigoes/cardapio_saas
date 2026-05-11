/** @type {import('next').NextConfig} */
const isDockerBuild = process.env.NEXT_PHASE === "phase-production-build";

const nextConfig = {
  output: "standalone",
  // Pula type-check e lint no build Docker — acelera de ~400s para ~90s
  typescript: { ignoreBuildErrors: isDockerBuild },
  eslint:     { ignoreDuringBuilds: isDockerBuild },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  }
};

module.exports = nextConfig;
