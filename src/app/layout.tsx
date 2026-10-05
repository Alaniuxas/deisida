import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Deisida - gamybos sistema",
  description:
    "Deisida gamybos sistema — pasiūlymai, eilė, cechas ir konvejeriai.",
  icons: {
    icon: [
      { url: "/deisida-mark.svg", type: "image/svg+xml" },
      { url: "/deisida-icon.jpg", type: "image/jpeg", sizes: "512x512" },
    ],
    apple: "/deisida-icon.jpg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="lt" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
