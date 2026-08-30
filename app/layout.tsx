import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Once Upon',
  title: {
    default: 'Once Upon',
    template: '%s | Once Upon',
  },
  description:
    'Interactive stories where you choose the action, the page resolves the outcome, and AI tells the story.',
  openGraph: {
    type: 'website',
    siteName: 'Once Upon',
    title: 'Once Upon',
    description:
      'Interactive stories where you choose the action, the page resolves the outcome, and AI tells the story.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Once Upon' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Once Upon',
    description:
      'Interactive stories where you choose the action, the page resolves the outcome, and AI tells the story.',
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
