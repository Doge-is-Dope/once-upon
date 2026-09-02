import type { Metadata } from 'next';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource-variable/caveat/wght.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import './globals.css';
import '../components/frames/desk/styles/index.css';

export const metadata: Metadata = {
  applicationName: 'Once Upon',
  title: {
    default: 'Once Upon',
    template: '%s | Once Upon',
  },
  description:
    'A living manuscript where every discovery changes what AI can do.',
  openGraph: {
    type: 'website',
    siteName: 'Once Upon',
    title: 'Once Upon',
    description:
      'A living manuscript where every discovery changes what AI can do.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Once Upon' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Once Upon',
    description:
      'A living manuscript where every discovery changes what AI can do.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* The manuscript's paper grain paints on first render. */}
        <link as="image" href="/textures/paper-grain.webp" rel="preload" />
      </head>
      <body>{children}</body>
    </html>
  );
}
