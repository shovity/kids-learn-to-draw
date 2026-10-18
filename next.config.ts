import type { NextConfig } from "next";

// GitHub Pages phục vụ dưới /<repo>/ → workflow đặt NEXT_PUBLIC_BASE_PATH=/kids-coloring; local để trống.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
};

export default nextConfig;
