import type { Metadata, Viewport } from 'next';
import { pressStart2P } from '@/lib/fonts';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Shifting Pixel',
  description: 'A 2D platformer with AI-generated levels.',
  manifest: '/manifest.json', // Link to the manifest file
  icons: { // Recommended for iOS PWA icons
    apple: 'https://placehold.co/180x180.png?text=SP&font=press-start-2p',
  },
};

export const viewport: Viewport = {
  themeColor: '#9400D3', // Vibrant Purple
  colorScheme: 'dark', // Assuming your app is primarily dark themed
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${pressStart2P.variable} font-sans antialiased h-full bg-background text-foreground overflow-hidden`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
