import "./globals.css";
import AppBootstrap from "./components/app-bootstrap";
import SidebarNav from "./components/sidebar-nav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen text-slate-900 antialiased">
        <div className="min-h-screen flex flex-col lg:flex-row">

          {/* SIDEBAR */}
          <aside className="w-full bg-slate-950 p-4 lg:w-80 lg:min-h-screen">
            <div className="mb-5 p-4 lg:mb-8 lg:p-5">
              <p className="mb-2 text-[1.08rem] font-medium uppercase tracking-[0.34em] text-slate-400">
                R.P.O.S
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">MGB Inventory</h1>
              <p className="mt-2 text-xs text-slate-300">Inventory control and purchasing in one place.</p>
              <div className="mt-4 inline-flex items-center rounded-full border border-slate-700/50 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                Operations Desk
              </div>
            </div>

            <SidebarNav />

            <div className="mt-4 hidden px-4 py-3 text-xs text-slate-200/75 lg:block">
              Unified workspace for inventory, procurement, suppliers, and reporting.
            </div>
          </aside>

          {/* MAIN AREA */}
          <main className="flex-1 bg-slate-950/95 p-4 sm:p-6 xl:px-10">
            <div className="mx-auto min-h-screen max-w-[1600px] px-0 sm:px-2 overflow-x-auto">
              <div className="overflow-visible sm:overflow-hidden rounded-[30px] border border-slate-200/10 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.14)]">
                <AppBootstrap>{children}</AppBootstrap>
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
