import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ToastProvider } from '@/components/client';
import { SwRegister } from '@/components/sw-register';
import { I18nProvider } from '@/i18n/client';
import { LOCALE_TAG } from '@/i18n/config';
import { DICTIONARIES } from '@/i18n/translate';
import { getLocale, getT } from '@/i18n/server';
import { getSettings } from '@/lib/settings';
import { brandCss } from '@/lib/brand';
import { bootScript, isPalette, paletteCss } from '@/lib/palettes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: 'MiniFactory', template: '%s · MiniFactory' },
    description: t('meta.description'),
    manifest: '/manifest.webmanifest',
    icons: { icon: '/icon.svg', apple: '/icon.svg' },
  };
}
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f3f1ec' }, { media: '(prefers-color-scheme: dark)', color: '#121211' }], width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const st = await getSettings().catch(() => null);
  const css = paletteCss() + brandCss(st?.shop.brandColor ?? '');
  const shopPalette = isPalette(st?.shop.palette) ? st!.shop.palette : 'capa';
  return (
    <html lang={LOCALE_TAG[locale]} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: bootScript(shopPalette) }} /></head>
      <body className="min-h-screen antialiased">
        <style dangerouslySetInnerHTML={{ __html: css }} /><I18nProvider locale={locale} messages={DICTIONARIES[locale]}><ToastProvider>{children}</ToastProvider></I18nProvider><SwRegister /></body>
    </html>
  );
}
