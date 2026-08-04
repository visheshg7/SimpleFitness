"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { deleteHistoryEntry } from "@/lib/actions/delete";
import { getHistoryData } from "@/lib/queries/history";

type HistoryData = Awaited<ReturnType<typeof getHistoryData>>;
type HistoryEntry = HistoryData[number];

export function HistoryScreen({ data }: { data: HistoryData }) {
  const [filter, setFilter] = useState<"all" | "workout" | "meal" | "body">("all");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const filtered = data.filter((entry) => filter === "all" || entry.type === filter);
  function remove(entry: HistoryEntry) { if (!window.confirm("Delete this journal entry? This cannot be undone.")) return; startTransition(async () => { await deleteHistoryEntry(entry.type === "body" ? "meal" : entry.type, entry.id); setSelected(null); router.refresh(); }); }
  return <><div className="page-intro"><div><div className="eyebrow">The record</div><h1 className="page-title">History</h1><p className="page-subtitle">A reverse-chronological view of the entries that make progress legible.</p></div></div><div className="filter-row">{(["all", "workout", "meal", "body"] as const).map((option) => <button className={`filter${filter === option ? " active" : ""}`} key={option} onClick={() => setFilter(option)}>{option}</button>)}</div>{filtered.length ? <div className="timeline">{filtered.map((entry) => <button className="timeline-row" key={`${entry.type}-${entry.id}`} onClick={() => setSelected(entry)}><span className="timeline-date">{formatDate(entry.date)}</span><span className={`type-label ${entry.type}`}>{entry.type}</span><span><span className="timeline-title">{entry.title}</span><span className="timeline-subtitle">{entry.subtitle}</span></span><span className="timeline-value">{entry.value}</span></button>)}</div> : <div className="empty-state"><strong>Nothing in this view yet.</strong>Finish a workout or confirm a meal to begin your record.</div>}{selected && <HistoryDetail entry={selected} onClose={() => setSelected(null)} onDelete={() => remove(selected)} pending={pending} />}</>;
}

function HistoryDetail({ entry, onClose, onDelete, pending }: { entry: HistoryEntry; onClose: () => void; onDelete: () => void; pending: boolean }) {
  return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="sheet"><div className="sheet-heading"><div><div className="eyebrow">{formatDate(entry.date)}</div><h2 className="sheet-title">{entry.title}</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><p className="status-text">{entry.subtitle}</p>{entry.type === "workout" && "details" in entry && <div className="review-table" style={{ marginTop: 18 }}>{entry.details.map((detail, index) => <div className="library-exercise" key={`${detail.exercise}-${index}`}><span>{detail.exercise}</span><span>{detail.completed ? "Completed" : "Logged"} · {detail.weightKg ? `${detail.weightKg.toFixed(1)} kg` : "bodyweight"}{detail.reps ? ` × ${detail.reps}` : ""}</span></div>)}</div>}{entry.type === "meal" && <div className="notice" style={{ marginTop: 18 }}>Nutrition values are estimates. {entry.subtitle}</div>}{entry.type === "body" && <div className="notice" style={{ marginTop: 18 }}>This body snapshot is kept as captured so future profile changes do not rewrite history.</div>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Close</button>{entry.type !== "body" && <button className="button secondary" disabled={pending} onClick={onDelete}><Trash2 size={14} /> Delete</button>}</div></div></div>;
}

function formatDate(value: string) { return new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
