"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Boxes,
  SquarePlus,
  TriangleAlert,
  ChartColumnIncreasing,
  Handshake,
  ClipboardList,
  BarChart3,
  Settings,
  ChevronRight,
  LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/products", label: "Add Inventory", icon: SquarePlus },
      { href: "/inventory-order", label: "Low/Out of Stock", icon: TriangleAlert },
    ],
  },
  {
    title: "Planning",
    items: [
      { href: "/stock-projection", label: "Stock Projection", icon: ChartColumnIncreasing },
      { href: "/suppliers", label: "Suppliers", icon: Handshake },
      { href: "/purchase-orders", label: "Orders", icon: ClipboardList },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="nav-groups">
      {navGroups.map((group) => (
        <div key={group.title} className="nav-group">
          <p className="nav-group-title">{group.title}</p>
          <div className="nav-panel">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);

              return (
                <Link
                  key={href}
                  className={`nav-link ${active ? "nav-link-active" : ""}`}
                  href={href}
                  aria-current={active ? "page" : undefined}
                >
                  <span>
                    <span className="nav-icon-wrap">
                      <Icon className="nav-icon" />
                    </span>
                    {label}
                  </span>
                  <ChevronRight className="nav-link-chevron" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
