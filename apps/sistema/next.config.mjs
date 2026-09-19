/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ir/ui", "@ir/types", "@ir/core", "@ir/mocks", "@ir/config"]
};

export default nextConfig;
