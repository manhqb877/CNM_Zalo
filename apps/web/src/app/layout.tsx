import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-be-vietnam-pro',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'ZYNC - Developer Community Workspace',
  description: 'Real-time chat, community knowledge sharing, and AI support for developers.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    (function() {
      try {
        var savedTheme = localStorage.getItem('zync.dashboard.theme');
        var theme = savedTheme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset['zyncTheme'] = theme;
        
        var savedFontSize = localStorage.getItem('zync.dashboard.messageFontSize');
        var messageFontSize = savedFontSize === 'small' || savedFontSize === 'medium' || savedFontSize === 'large' ? savedFontSize : 'medium';
        document.documentElement.dataset['zyncMessageSize'] = messageFontSize;
      } catch (e) {}
    })();
  `;

  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${beVietnamPro.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
