import "./globals.css";
import Link from "next/link";
import AppBootstrap from "./components/app-bootstrap";
import { Manrope, IBM_Plex_Mono } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${ibmPlexMono.variable} min-h-screen text-slate-900 antialiased`}
      >
        <div className="min-h-screen flex flex-col lg:flex-row">

          {/* SIDEBAR */}
          <aside className="w-full border-b border-slate-700/60 bg-[linear-gradient(180deg,#1f2937_0%,#334155_100%)] p-6 shadow-sm lg:w-72 lg:min-h-screen lg:border-b-0 lg:border-r">
            <div className="mb-6 lg:mb-8">
              <p className="mb-2 text-[1.08rem] font-medium uppercase tracking-[0.34em] text-slate-200/80">
                R.P.O.S
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">MGB Inventory</h1>
              <p className="mt-2 text-xs text-slate-200/75">Inventory control and purchasing in one place.</p>
            </div>

            <nav className="nav-panel grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <Link className="nav-link" href="/dashboard">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3h8v8H3z" />
                    <path d="M13 3h8v4h-8z" />
                    <path d="M13 11h8v10h-8z" />
                    <path d="M3 13h8v8H3z" />
                  </svg>
                  Dashboard
                </span>
              </Link>
              <Link className="nav-link" href="/inventory">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
                    <path d="M3 7l9 4 9-4" />
                    <path d="M12 11v10" />
                  </svg>
                  Inventory
                </span>
              </Link>
              <Link className="nav-link" href="/inventory-order">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16" />
                    <path d="M4 11h16" />
                    <path d="M4 15h16" />
                    <path d="M4 19h16" />
                  </svg>
                  Low/Out of Stock
                </span>
              </Link>
              <Link className="nav-link" href="/products">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5-5 5 5-5 5-5-5z" />
                    <path d="M20 4v16" />
                    <path d="M4 20h16" />
                  </svg>
                  Add Inventory
                </span>
              </Link>
              <Link className="nav-link" href="/suppliers">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3h14a2 2 0 0 1 2 2v16H3V5a2 2 0 0 1 2-2z" />
                    <path d="M8 11h8" />
                    <path d="M8 15h8" />
                  </svg>
                  Suppliers
                </span>
              </Link>
              <Link className="nav-link" href="/purchase-orders">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 3h6" />
                    <path d="M7 7h10" />
                    <path d="M6 21h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2z" />
                  </svg>
                  Orders
                </span>
              </Link>
              <Link className="nav-link" href="/reports">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19h16" />
                    <path d="M7 15V9" />
                    <path d="M12 19V5" />
                    <path d="M17 15V11" />
                  </svg>
                  Reports
                </span>
              </Link>
              <Link className="nav-link" href="/settings">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 8.6 15a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 8.6 9a1.65 1.65 0 0 0 .33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 13 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 15 8.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 15z" />
                  </svg>
                  Settings
                </span>
              </Link>
            </nav>

            <div className="mt-4 hidden rounded-2xl border border-slate-200/15 bg-white/[0.04] px-4 py-3 text-xs text-slate-200/75 lg:block">
              Unified workspace for inventory, procurement, suppliers, and reporting.
            </div>
          </aside>

          {/* MAIN AREA */}
          <main className="flex-1 p-4 sm:p-6 xl:px-10">
            <div className="app-shell max-w-[1600px] mx-auto p-4 sm:p-6">
              <AppBootstrap>{children}</AppBootstrap>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
