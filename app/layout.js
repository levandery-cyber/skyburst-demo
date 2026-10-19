import { Big_Shoulders, Big_Shoulders_Stencil, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Big Shoulders is tall and industrial: the multiplier reads like a scoreboard. Its stencil cut
// stamps the burst result. Hanken Grotesk carries the interface; the mono face is only for hashes.
const display = Big_Shoulders({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display', display: 'swap', adjustFontFallback: false });
const stencil = Big_Shoulders_Stencil({ subsets: ['latin'], axes: ['opsz'], variable: '--font-stencil', display: 'swap', adjustFontFallback: false });
const ui = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const title = 'Skyburst: cash out before the shell breaks';
const description =
  'A night-sky crash game. Light the fuse, ride the shell, bank the multiplier before it bursts. A Next.js demo with virtual credits only.';

export const metadata = {
  title,
  description,
  applicationName: 'Skyburst',
  openGraph: { title, description, type: 'website', siteName: 'Skyburst' },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0e2e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${stencil.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
