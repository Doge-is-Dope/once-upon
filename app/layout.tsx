import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Last Manuscript',
  description: 'A six-turn mystery you play with ChatGPT.',
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
