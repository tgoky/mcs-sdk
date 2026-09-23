import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Its own variable name: globals.css maps the theme's --font-sans to it.
// Naming this "--font-sans" made the theme's `--font-sans: var(--font-sans)`
// refer to itself, which is invalid, so text fell back to the browser's
// default serif.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unified Tools Platform",
  description: "One workspace, one client. Every worker's status, configuration, and analytics in one place.",
  icons: {
    icon: "/logos/homelg.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning prevents Next.js attribute mismatch warnings when next-themes injects the active class
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${geistMono.variable}`}>
      <body
        className={`font-sans antialiased bg-background text-foreground selection:bg-zinc-800 dark:selection:bg-zinc-200 transition-colors duration-200`}
      >
       <ThemeProvider
  attribute="class"
  defaultTheme="dark"
  enableSystem={false}
  disableTransitionOnChange
>
  {children}
</ThemeProvider>
      </body>
    </html>
  );
}