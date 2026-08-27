import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Can You Be Me? — Fool the AI Detective',
  description: 'Two friends, two phones, one secret Mirror. Can an AI Detective tell who is real?',
  openGraph: {
    title: 'Can You Be Me? — Fool the AI Detective',
    description: 'Two friends, two phones, one secret Mirror. Can an AI Detective tell who is real?',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Can You Be Me? AI detective party game' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Can You Be Me? — Fool the AI Detective',
    description: 'Two friends, two phones, one secret Mirror. Can an AI Detective tell who is real?',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
