import "./globals.css";
import AppBootstrap from "./components/app-bootstrap";
import SidebarNav from "./components/sidebar-nav";
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
          <aside className="w-full border-b border-slate-700/50 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_42%),linear-gradient(180deg,#0b1120_0%,#1e293b_100%)] p-6 shadow-sm lg:w-80 lg:min-h-screen lg:border-b-0 lg:border-r">
            <div className="mb-6 rounded-3xl border border-sky-200/25 bg-white/[0.06] p-5 lg:mb-8">
              <p className="mb-2 text-[1.08rem] font-medium uppercase tracking-[0.34em] text-slate-200/80">
                R.P.O.S
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">MGB Inventory</h1>
              <p className="mt-2 text-xs text-slate-200/75">Inventory control and purchasing in one place.</p>
              <div className="mt-4 inline-flex items-center rounded-full border border-cyan-200/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
                Operations Desk
              </div>
            </div>

            <SidebarNav />

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
