/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // for the ECS Docker image
  allowedDevOrigins: ["10.0.0.75"], // dev-only: allow phone/LAN preview over local IP
};

export default nextConfig;
