const releaseBuildId = process.env.UED_RELEASE_BUILD_ID;

if (releaseBuildId !== undefined && !/^rb1-[a-f0-9]{64}$/.test(releaseBuildId)) {
  throw new Error("UED_RELEASE_BUILD_ID must satisfy the pinned release build identity contract.");
}

const nextConfig = {
  output: "standalone",
  experimental: { isrFlushToDisk: false },
  ...(process.env.UED_LOCAL_TEST_MODE === "true" ? { distDir: ".next-local-test" } : {}),
  ...(releaseBuildId ? { generateBuildId: async () => releaseBuildId } : {}),
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  }
};

export default nextConfig;
