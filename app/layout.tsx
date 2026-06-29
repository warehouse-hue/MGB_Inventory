import "./globals.css";
import Link from "next/link";
import AppBootstrap from "./components/app-bootstrap";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-950 antialiased">
        <div className="min-h-screen flex">

          {/* SIDEBAR */}
          <aside className="w-72 min-h-screen bg-white border-r border-slate-200 p-6 shadow-sm">
            <div className="mb-8">
              <p className="text-xs uppercase text-slate-500 tracking-[0.3em] mb-2">
                Warehouse Suite
              </p>
              <h1 className="text-2xl font-semibold">MGB Inventory</h1>
            </div>

            <nav className="space-y-2 text-sm text-slate-700">
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/dashboard">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3h8v8H3z" />
                    <path d="M13 3h8v4h-8z" />
                    <path d="M13 11h8v10h-8z" />
                    <path d="M3 13h8v8H3z" />
                  </svg>
                  Dashboard
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/inventory">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
                    <path d="M3 7l9 4 9-4" />
                    <path d="M12 11v10" />
                  </svg>
                  Inventory
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/inventory-order">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16" />
                    <path d="M4 11h16" />
                    <path d="M4 15h16" />
                    <path d="M4 19h16" />
                  </svg>
                  Inventory order
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/products">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5-5 5 5-5 5-5-5z" />
                    <path d="M20 4v16" />
                    <path d="M4 20h16" />
                  </svg>
                  Products
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/suppliers">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3h14a2 2 0 0 1 2 2v16H3V5a2 2 0 0 1 2-2z" />
                    <path d="M8 11h8" />
                    <path d="M8 15h8" />
                  </svg>
                  Suppliers
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/purchase-orders">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 3h6" />
                    <path d="M7 7h10" />
                    <path d="M6 21h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2z" />
                  </svg>
                  Orders
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/import">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="M8 11l4 4 4-4" />
                    <path d="M5 21h14" />
                  </svg>
                  Import CSV
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/reports">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19h16" />
                    <path d="M7 15V9" />
                    <path d="M12 19V5" />
                    <path d="M17 15V11" />
                  </svg>
                  Reports
                </span>
              </Link>
              <Link className="block rounded-2xl px-4 py-3 transition duration-200 ease-out hover:-translate-x-1 hover:bg-slate-100" href="/settings">
                <span className="inline-flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 8.6 15a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 8.6 9a1.65 1.65 0 0 0 .33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 13 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 15 8.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 15z" />
                  </svg>
                  Settings
                </span>
              </Link>
            </nav>
          </aside>

          {/* MAIN AREA */}
          <main className="flex-1 p-6 xl:px-10">
            <div className="max-w-[1600px] mx-auto">
              <AppBootstrap>{children}</AppBootstrap>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
