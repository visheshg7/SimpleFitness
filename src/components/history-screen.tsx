"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, SlidersHorizontal, Trash2, X } from "lucide-react";
import { deleteHistoryEntry } from "@/lib/actions/delete";
import { getHistoryData } from "@/lib/queries/history";

type HistoryData = Awaited<ReturnType<typeof getHistoryData>>;
type HistoryEntry = HistoryData[number];
type HistoryFilter = "all" | "workout" | "meal" | "body";

export function HistoryScreen({ data }: { data: HistoryData }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filtered = data.filter((entry) => {
    if (filter !== "all" && entry.type !== filter) return false;
    const entryDate = dateKey(entry.date);
    return (!fromDate || entryDate >= fromDate) && (!toDate || entryDate <= toDate);
  });
  const grouped = groupByDay(filtered);
  const hasDateFilter = Boolean(fromDate || toDate);
  const filterSummary = hasDateFilter ? formatRange(fromDate, toDate) : "All time";
  function remove(entry: HistoryEntry) { if (!window.confirm("Delete this journal entry? This cannot be undone.")) return; startTransition(async () => { await deleteHistoryEntry(entry.type === "body" ? "meal" : entry.type, entry.id); setSelected(null); router.refresh(); }); }
  return <><div className="page-intro"><div><div className="eyebrow">The record</div><h1 className="page-title">History</h1><p className="page-subtitle">A reverse-chronological view of the entries that make progress legible.</p></div></div><div className="history-toolbar"><div className="history-toolbar-copy"><span className="history-toolbar-label">Showing</span><strong>{filterLabel(filter)}</strong><span className="history-toolbar-range">{filterSummary}</span></div><button className={`history-filter-button${showFilters || filter !== "all" || hasDateFilter ? " active" : ""}`} type="button" aria-expanded={showFilters} onClick={() => setShowFilters((visible) => !visible)}><SlidersHorizontal size={15} /> Filter{(filter !== "all" || hasDateFilter) && <span className="history-filter-count">{(filter !== "all" ? 1 : 0) + (hasDateFilter ? 1 : 0)}</span>}</button></div>{showFilters && <div className="history-filter-panel"><div className="filter-section"><span className="filter-section-label">Entry type</span><div className="filter-row" aria-label="Filter by entry type">{(["all", "workout", "meal", "body"] as const).map((option) => <button className={`filter${filter === option ? " active" : ""}`} key={option} onClick={() => setFilter(option)}>{option}</button>)}</div></div><div className="filter-section"><div className="filter-section-heading"><span className="filter-section-label">Date range</span>{hasDateFilter && <button className="filter-reset" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</button>}</div><div className="date-filter-fields"><label className="date-filter-field"><span>From</span><input className="date-filter-input" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label><label className="date-filter-field"><span>To</span><input className="date-filter-input" type="date" min={fromDate || undefined} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div>{invalidDateRange && <span className="date-filter-error">Choose an end date on or after the start date.</span>}</div></div>}{filtered.length && !invalidDateRange ? <div className="history-groups">{grouped.map((group) => <section className="history-group" key={group.date}><div className="history-group-heading"><h2>{group.label}</h2><span>{group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}</span></div><div className="timeline">{group.entries.map((entry) => <button className="timeline-row" key={`${entry.type}-${entry.id}`} onClick={() => setSelected(entry)}><span className={`timeline-marker ${entry.type}`} aria-hidden="true" /><span className="timeline-copy"><span className="timeline-title">{entry.title}</span><span className="timeline-subtitle">{entry.subtitle}</span></span><span className="timeline-value">{entry.value}</span><ChevronRight size={16} className="timeline-chevron" aria-hidden="true" /></button>)}</div></section>)}</div> : <div className="empty-state"><strong>{invalidDateRange ? "That date range is not valid." : "Nothing in this view yet."}</strong>{invalidDateRange ? "Choose an end date on or after the start date." : "Finish a workout or confirm a meal to begin your record."}</div>}{selected && <HistoryDetail entry={selected} onClose={() => setSelected(null)} onDelete={() => remove(selected)} pending={pending} />}</>;
}

function HistoryDetail({ entry, onClose, onDelete, pending }: { entry: HistoryEntry; onClose: () => void; onDelete: () => void; pending: boolean }) {
  return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="sheet"><div className="sheet-heading"><div><div className="eyebrow">{formatDate(entry.date)}</div><h2 className="sheet-title">{entry.title}</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><p className="status-text">{entry.subtitle}</p>{entry.type === "workout" && "details" in entry && <div className="review-table" style={{ marginTop: 18 }}>{entry.details.map((detail, index) => <div className="library-exercise" key={`${detail.exercise}-${index}`}><span>{detail.exercise}</span><span>{detail.completed ? "Completed" : "Logged"} · {detail.weightKg ? `${detail.weightKg.toFixed(1)} kg` : "bodyweight"}{detail.reps ? ` × ${detail.reps}` : ""}</span></div>)}</div>}{entry.type === "meal" && <div className="notice" style={{ marginTop: 18 }}>Nutrition values are estimates. {entry.subtitle}</div>}{entry.type === "body" && <div className="notice" style={{ marginTop: 18 }}>This body snapshot is kept as captured so future profile changes do not rewrite history.</div>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Close</button>{entry.type !== "body" && <button className="button secondary" disabled={pending} onClick={onDelete}><Trash2 size={14} /> Delete</button>}</div></div></div>;
}

function formatDate(value: string) { return new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

function dateKey(value: string) { const date = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function groupByDay(entries: HistoryData) { return entries.reduce<Array<{ date: string; label: string; entries: HistoryEntry[] }>>((groups, entry) => { const date = dateKey(entry.date); const current = groups.at(-1); if (current?.date === date) current.entries.push(entry); else groups.push({ date, label: formatGroupDate(entry.date), entries: [entry] }); return groups; }, []); }

function formatGroupDate(value: string) { const date = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`); const today = new Date(); const todayKey = dateKey(today.toISOString()); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1); const yesterdayKey = dateKey(yesterday.toISOString()); const key = dateKey(value); if (key === todayKey) return "Today"; if (key === yesterdayKey) return "Yesterday"; return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }

function formatRange(from: string, to: string) { if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`; if (from) return `From ${formatShortDate(from)}`; return `Through ${formatShortDate(to)}`; }

function formatShortDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

function filterLabel(filter: HistoryFilter) { return filter === "all" ? "Everything" : filter === "body" ? "Body metrics" : filter === "meal" ? "Meals" : "Workouts"; }
