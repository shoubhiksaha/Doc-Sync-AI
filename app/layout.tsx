import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import Navbar from "./components/Navbar";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "DocSync AI - Document Ingestion for Sheets & Notion",
  description: "Agentic document ingestion for MSMEs and NGOs. Extract structured data from paper documents into your own Google Sheets and Notion.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DocSync AI",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={geist.className}>
        <Providers>
          <Navbar />
          {children}
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  );
}
