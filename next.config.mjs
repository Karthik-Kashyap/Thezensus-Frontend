/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // for the ECS Docker image (DESIGN-001 §6.1)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "voteanything-static-prod.s3.amazonaws.com" },
    ],
  },
};

export default nextConfig;
