import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Once Upon',
  title: {
    default: 'Once Upon',
    template: '%s | Once Upon',
  },
  description:
    'You choose. The web keeps the truth. Your agent tells the story.',
  openGraph: {
    type: 'website',
    siteName: 'Once Upon',
    title: 'Once Upon',
    description:
      'You choose. The web keeps the truth. Your agent tells the story.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Once Upon' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Once Upon',
    description:
      'You choose. The web keeps the truth. Your agent tells the story.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
