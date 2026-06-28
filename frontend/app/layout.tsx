import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NOVA",
  description: "NOVA: Synthetic data engine for finance",
};

function Nav() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-bg/80 border-b border-line">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span className="block w-2.5 h-2.5 bg-accent live-dot" />
          <span className="font-mono font-semibold tracking-tight text-fg">
            NO<span className="text-accent">V</span>A
          </span>
        </Link>
        <nav className="flex items-center gap-7 text-sm">
          <Link href="/#problem" className="text-muted hover:text-fg no-underline hidden sm:block">
            Problem
          </Link>
          <Link href="/#how" className="text-muted hover:text-fg no-underline hidden sm:block">
            How it works
          </Link>
          <Link
            href="/studio"
            className="rounded-xl text-bg bg-accent px-4 py-2 font-medium no-underline hover:opacity-90"
          >
            Open studio →
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row gap-4 justify-between text-sm text-faint">
        <span>Built by Balisa</span>
        <span className="flex gap-5">
          <a href="https://github.com/Balisa50/nova" className="hover:text-fg no-underline">
            GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
