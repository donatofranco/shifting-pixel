import type { Metadata } from 'next';
import { pressStart2P } from '@/lib/fonts';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Shifting Pixel',
  description: 'A 2D platformer with AI-generated levels.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${pressStart2P.variable} font-sans antialiased h-full bg-background text-foreground overflow-hidden`}> {/* Added overflow-hidden */}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
