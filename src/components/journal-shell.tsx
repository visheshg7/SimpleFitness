"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { BarChart3, BookOpen, CalendarDays, ChevronRight, Dumbbell, Flame, House, Moon, PersonStanding, Plus, Sun, UtensilsCrossed, X } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";

const links = [{ href: "/today", label: "Today", icon: House }, { href: "/progress", label: "Progress", icon: BarChart3 }, { href: "/history", label: "History", icon: CalendarDays }, { href: "/library", label: "Library", icon: BookOpen }];
const addActions = [
  { href: "/today?action=meal", label: "Log a meal", description: "Record what you ate", icon: UtensilsCrossed, tone: "meal" },
  { href: "/today?action=body", label: "Body check-in", description: "Track weight and measurements", icon: PersonStanding, tone: "body" },
  { href: "/today?action=workout", label: "Log a workout", description: "Start a session or describe your sets", icon: Dumbbell, tone: "workout" },
] as const;
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

function AddActionMenu({ onClose }: { onClose: () => void }) {
  return <div className="add-menu-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="add-menu" role="dialog" aria-modal="true" aria-labelledby="add-menu-title">
      <div className="add-menu-heading">
        <div>
          <div className="eyebrow">Quick log</div>
          <h2 className="add-menu-title" id="add-menu-title">What are you adding?</h2>
        </div>
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
      </div>
      <div className="add-menu-options">
        {addActions.map(({ href, label, description, icon: Icon, tone }) => <Link className={`add-menu-option ${tone}`} href={href} key={href} onClick={onClose}>
          <span className="add-menu-option-icon"><Icon size={19} /></span>
          <span className="add-menu-option-copy"><strong>{label}</strong><small>{description}</small></span>
          <ChevronRight className="add-menu-option-chevron" size={17} aria-hidden="true" />
        </Link>)}
      </div>
    </section>
  </div>;
}

export function JournalShell({ children, streak }: { children: React.ReactNode; streak: number }) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  return <div className="app-shell"><header className="shell-header"><Link href="/today" className="brand"><Flame className="brand-mark" size={17} strokeWidth={0} fill="currentColor" />Simple<span>Fitness</span></Link><div className="header-meta"><span className="date-meta">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><span className="streak-chip"><Flame className="streak-flame" size={13} strokeWidth={0} fill="currentColor" /><strong>{streak}</strong> {streak === 1 ? "day" : "days"} streak</span><ThemeToggle /><form action={logout}><button className="logout-button" type="submit">Log out</button></form></div></header><div className="shell-body"><nav className="side-nav" aria-label="Primary navigation">{links.map(({ href, label }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}>{label}</Link>)}</nav><main className="content-column">{children}</main></div><nav className="mobile-nav" aria-label="Mobile navigation">{links.slice(0, 2).map(({ href, label, icon: Icon }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}><span className="mobile-nav-icon"><Icon size={17} strokeWidth={pathname.startsWith(href) ? 2.5 : 1.5} /></span>{label}</Link>)}<button className={`mobile-add-button${addOpen ? " open" : ""}`} type="button" onClick={() => setAddOpen(true)} aria-label="Add a log" aria-haspopup="dialog" aria-expanded={addOpen}><Plus size={29} strokeWidth={2.2} /></button>{links.slice(2).map(({ href, label, icon: Icon }) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}><span className="mobile-nav-icon"><Icon size={17} strokeWidth={pathname.startsWith(href) ? 2.5 : 1.5} /></span>{label}</Link>)}</nav>{addOpen && <AddActionMenu onClose={() => setAddOpen(false)} />}</div>;
}
