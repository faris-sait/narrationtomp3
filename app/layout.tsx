import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NarrateToMP3 — script to MP3",
  description:
    "Paste a narration script, pick a free male or female voice, download the MP3.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}