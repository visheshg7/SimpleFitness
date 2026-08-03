"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, CalendarDays, Dumbbell } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";

const links = [{ href: "/today", label: "Today", icon: Dumbbell }, { href: "/progress", label: "Progress", icon: BarChart3 }, { href: "/history", label: "History", icon: CalendarDays }, { href: "/library", label: "Library", icon: BookOpen }];

export function JournalShell({ children, streak }: { children: React.ReactNode; streak: number }) {
  const pathname = usePathname();
  return <div className="app-shell"><header className="shell-header"><Link href="/today" className="brand">Simple <span>Fitness</span></Link><div className="header-meta"><span className="date-meta">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><span className="streak-chip"><strong>{streak}</strong> day streak</span><form action={logout}><button className="logout-button" type="submit">Log out</button></form></div></header><div className="shell-body"><nav className="side-nav" aria-label="Primary navigation">{links.map(({ href, label }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}>{label}</Link>)}</nav><main className="content-column">{children}</main></div><nav className="mobile-nav" aria-label="Mobile navigation">{links.map(({ href, label, icon: Icon }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}><span className="mobile-nav-icon"><Icon size={17} strokeWidth={pathname.startsWith(href) ? 2.5 : 1.5} /></span>{label}</Link>)}</nav></div>;
}
