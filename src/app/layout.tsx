import { Geist, Geist_Mono } from "next/font/google";
import { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// export const metadata: Metadata = {
//   title: "PixPot",
//   description: "Reveal pixels, guess the image, win the pot — on Base",
// };

export async function generateMetadata(): Promise<Metadata> {
  return {
    other: {
      'fc:miniapp': JSON.stringify({
        version: 'next',
        imageUrl: 'https://pixpot.fun/cover.png',
        button: {
          title: `Open PixPot`,
          action: {
            type: 'launch_miniapp',
            name: 'PixPot',
            url: 'https://pixpot.fun',
            splashImageUrl: 'https://pixpot.fun/logo.png',
            splashBackgroundColor: '#1E90FF',
          },
        },
      }),
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // console.log("DB_USER:", process.env.DB_USER);
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
