/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/sistema",
  transpilePackages: ["@ir/ui", "@ir/types", "@ir/mocks", "@ir/config"]
};

export default nextConfig;
