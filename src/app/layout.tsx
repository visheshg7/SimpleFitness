import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["400", "500", "600", "700"] });
const themeScript = `try { if (localStorage.getItem("simple-fitness-theme") === "light") document.documentElement.dataset.theme = "light"; } catch {}`;

export const metadata: Metadata = {
  title: "Simple Fitness",
  description: "A focused workout, nutrition, and progress journal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body className={outfit.variable}>{children}</body></html>;
}
