"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BarChart3, BookOpen, CalendarDays, Flame, House, Moon, Sun } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";

const links = [{ href: "/today", label: "Today", icon: House }, { href: "/progress", label: "Progress", icon: BarChart3 }, { href: "/history", label: "History", icon: CalendarDays }, { href: "/library", label: "Library", icon: BookOpen }];
const THEME_STORAGE_KEY = "simple-fitness-theme";
const THEME_EVENT = "simple-fitness-theme-change";

type Theme = "dark" | "light";

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  const nextTheme = theme === "dark" ? "light" : "dark";

  function toggleTheme() {
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${nextTheme} theme`} aria-pressed={theme === "light"} title={`Switch to ${nextTheme} theme`}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>;
}

export function JournalShell({ children, streak }: { children: React.ReactNode; streak: number }) {
  const pathname = usePathname();
  return <div className="app-shell"><header className="shell-header"><Link href="/today" className="brand"><Flame className="brand-mark" size={17} strokeWidth={0} fill="currentColor" />Simple<span>Fitness</span></Link><div className="header-meta"><span className="date-meta">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><span className="streak-chip"><Flame className="streak-flame" size={13} strokeWidth={0} fill="currentColor" /><strong>{streak}</strong> day streak</span><ThemeToggle /><form action={logout}><button className="logout-button" type="submit">Log out</button></form></div></header><div className="shell-body"><nav className="side-nav" aria-label="Primary navigation">{links.map(({ href, label }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}>{label}</Link>)}</nav><main className="content-column">{children}</main></div><nav className="mobile-nav" aria-label="Mobile navigation">{links.map(({ href, label, icon: Icon }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}><span className="mobile-nav-icon"><Icon size={17} strokeWidth={pathname.startsWith(href) ? 2.5 : 1.5} /></span>{label}</Link>)}</nav></div>;
}
