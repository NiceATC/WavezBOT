import "./globals.css";
import "react-data-grid/lib/styles.css";
import { Space_Grotesk, Bebas_Neue } from "next/font/google";
import Providers from "./providers";

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

export const metadata = {
  title: "WavezBOT Dashboard",
  description: "Real-time dashboard for WavezBOT.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="/api/fontawesome"
        />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
