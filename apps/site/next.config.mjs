/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  // Keep local dev cache custom dir, but use default production output on Vercel.
  distDir: isVercel ? ".next" : ".next-devcache",
  transpilePackages: ["@ir/ui", "@ir/types", "@ir/mocks", "@ir/config"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false
    };
    return config;
  }
};

export default nextConfig;
