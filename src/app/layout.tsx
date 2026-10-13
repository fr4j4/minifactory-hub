import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ToastProvider } from '@/components/client';
import { SwRegister } from '@/components/sw-register';

export const metadata: Metadata = {
  title: { default: 'MiniFactory', template: '%s · MiniFactory' },
  description: 'Gestión de talleres de impresión 3D: presupuestos, pedidos, inventario, cola y galería.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f3f1ec' }, { media: '(prefers-color-scheme: dark)', color: '#121211' }], width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen antialiased"><ToastProvider>{children}</ToastProvider><SwRegister /></body>
    </html>
  );
}
