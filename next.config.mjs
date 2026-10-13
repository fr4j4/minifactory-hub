/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'sharp', 'pg', '@node-rs/argon2', 'playwright', 'exceljs'],
  experimental: { serverActions: { bodySizeLimit: '50mb' }, instrumentationHook: true },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
