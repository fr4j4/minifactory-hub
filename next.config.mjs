/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.MF_STANDALONE ? 'standalone' : undefined, // solo para los paquetes de release (packaging/build.mjs); Docker usa next start
  outputFileTracingRoot: import.meta.dirname, // sin esto Next puede tomar como raíz una carpeta superior con otro lockfile
  serverExternalPackages: ['@electric-sql/pglite', 'sharp', 'pg', '@node-rs/argon2', 'playwright', 'exceljs'],
  experimental: { serverActions: { bodySizeLimit: '50mb' } },
  poweredByHeader: false,
  // Marca para que el lanzador reconozca su propio servidor en el puerto (packaging/launcher.mjs).
  headers: async () => [{ source: '/:path*', headers: [{ key: 'X-MiniFactory', value: '1' }] }],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
