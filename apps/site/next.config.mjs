/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next-devcache",
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
