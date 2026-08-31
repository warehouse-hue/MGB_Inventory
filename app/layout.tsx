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
      <body className="min-h-screen antialiased">
        <div className="min-h-screen flex flex-col lg:flex-row">

          {/* SIDEBAR */}
          <aside className="w-full border-b border-slate-700/50 bg-slate-950 p-5 lg:w-72 lg:min-h-screen lg:border-b-0 lg:border-r">
            <div className="mb-6 border-b border-slate-700/50 px-3 pb-5 lg:mb-7">
              <p className="mb-2 text-[0.82rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
                R.P.O.S
              </p>
              <h1 className="text-xl font-semibold text-white">MGB Inventory</h1>
              <p className="mt-2 text-xs text-slate-300">Inventory control and purchasing in one place.</p>
              <div className="mt-4 inline-flex items-center rounded-md border border-slate-700/50 bg-slate-900/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                MGB Operations
              </div>
            </div>

            <SidebarNav />

            <div className="mt-5 hidden border-t border-slate-700/50 px-3 pt-4 text-xs text-slate-200/75 lg:block">
              Unified workspace for inventory, procurement, suppliers, and reporting.
            </div>
          </aside>

          {/* MAIN AREA */}
          <main className="flex-1 bg-slate-950/95 p-3 sm:p-5 xl:px-8">
            <div className="mx-auto min-h-screen max-w-[1600px]">
              <div className="min-h-screen overflow-hidden rounded-lg border border-slate-200/10 bg-white">
                <AppBootstrap>{children}</AppBootstrap>
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
