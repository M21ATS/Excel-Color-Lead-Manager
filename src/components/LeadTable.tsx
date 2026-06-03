/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Lead } from "../types";
import { 
  Filter, 
  Copy, 
  X, 
  FileJson,
  Download,
  Search,
  Activity
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Simple color helper for labels
function getColorName(hex: string): string {
  const map: Record<string, string> = {
    '#FFFF00': 'Yellow',
    '#FF0000': 'Red',
    '#00FF00': 'Green',
    '#0000FF': 'Blue',
    '#FFA500': 'Orange',
    '#A52A2A': 'Brown',
    '#800080': 'Purple',
    '#008080': 'Teal',
    '#C0C0C0': 'Silver',
    '#808080': 'Gray',
    '#000080': 'Navy',
    '#800000': 'Maroon',
    '#FFFFE0': 'Light Yellow',
    '#E0FFFF': 'Light Blue',
    '#FFC0CB': 'Pink',
    '#90EE90': 'Light Green',
    '#ADD8E6': 'Light Blue',
    '#F08080': 'Light Coral',
    '#4F81BD': 'Azure (Theme)',
    '#C0504D': 'Soft Red (Theme)',
    '#9BBB59': 'Olive (Theme)',
    '#8064A2': 'Purple (Theme)',
    '#4BACC6': 'Cyan (Theme)',
    '#F79646': 'Orange (Theme)',
  };
  return map[hex.toUpperCase()] || hex;
}

interface LeadTableProps {
  leads: Lead[];
  availableColors: string[];
  onToggleComplete: (id: string) => void;
}

export function LeadTable({ leads, availableColors, onToggleComplete }: LeadTableProps) {
  const [search, setSearch] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "completed" | "all">("pending");
  const [copied, setCopied] = useState(false);
  const [fieldCopied, setFieldCopied] = useState<string | null>(null);

  const uniqueAvailableColors = useMemo(() => {
    return Array.from(new Set(availableColors.map(c => c.toUpperCase())));
  }, [availableColors]);

  const filteredLeads = useMemo(() => {
    // Safety deduplication to prevent duplicate key errors in rendering
    const uniqueLeadsMap = new Map<string, Lead>();
    leads.forEach(l => {
      const stableId = l.id?.trim();
      if (stableId) {
        uniqueLeadsMap.set(stableId, { ...l, id: stableId });
      }
    });
    const uniqueLeads = Array.from(uniqueLeadsMap.values());

    return uniqueLeads.filter((lead) => {
      const matchesSearch = Object.values(lead).some(val => 
        String(val).toLowerCase().includes(search.toLowerCase())
      );
      const matchesColor = !selectedColor || lead.color?.toUpperCase() === selectedColor.toUpperCase();
      
      let matchesStatus = true;
      if (statusFilter === "pending") matchesStatus = !lead.completed;
      else if (statusFilter === "completed") matchesStatus = !!lead.completed;
      
      return matchesSearch && matchesColor && matchesStatus;
    });
  }, [leads, search, selectedColor, statusFilter]);

  const copyField = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setFieldCopied(fieldId);
    setTimeout(() => setFieldCopied(null), 1500);
  };

  const copyTable = () => {
    const headers = ["Company", "Phone", "Email", "Sector", "Rating", "Notes"];
    const rows = filteredLeads.map(l => [l.companyName, l.phoneNumber, l.email, l.sector, l.rating, l.notes].join("\t"));
    const text = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(null), 2000);
  };

  const exportCSV = () => {
    const headers = ["Company", "Phone", "Email", "Sector", "Rating", "Notes"];
    const rows = filteredLeads.map(l => [l.companyName, l.phoneNumber, l.email, l.sector, l.rating, l.notes].map(v => `"${v}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Sub-Header / Filter Bar */}
      <div className="bg-[#1E293B] border border-slate-800 rounded-xl px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-6 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">Status:</span>
          <div className="flex bg-[#0F172A] p-1 rounded-lg border border-slate-800">
            {(['pending', 'completed', 'all'] as const).map((s) => (
              <button
                key={`status-${s}`}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  statusFilter === s ? "bg-[#1E293B] text-white shadow-md border border-slate-700" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {s === 'pending' ? 'Pending' : s === 'completed' ? 'Completed' : 'All'}
              </button>
            ))}
          </div>

          <span className="w-px h-4 bg-slate-800" />

          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">Filter by Excel Color:</span>
          <div className="flex items-center gap-2">
            <button 
              key="color-all"
              onClick={() => setSelectedColor(null)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all",
                !selectedColor ? "bg-blue-600 text-white" : "bg-[#0F172A] border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              All
            </button>
            {uniqueAvailableColors.map(color => (
              <button
                key={`color-${color}`}
                onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 bg-[#0F172A] border rounded-full text-xs font-medium text-slate-400 transition-all",
                  selectedColor === color ? "ring-2 ring-blue-500 border-blue-400 text-white" : "border-slate-800 hover:border-slate-600 hover:text-white"
                )}
              >
                <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }}></span>
                {getColorName(color)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative group flex-1 md:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Quick search..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#0F172A] border border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500 focus:bg-[#1e293b] transition-all text-white placeholder:text-slate-600"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={copyTable}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded flex items-center gap-2 transition-all shrink-0",
              copied ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-500"
            )}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? "Copied!" : "Copy Table"}</span>
          </button>
          <button 
            onClick={exportCSV}
            className="px-3 py-1.5 bg-[#0F172A] border border-slate-800 text-slate-400 text-xs font-medium rounded hover:bg-slate-800 hover:text-white flex items-center gap-2 shrink-0 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 bg-[#1E293B] border border-slate-800 rounded-xl shadow-lg overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto scrollbar-thin scrollbar-thumb-slate-700">
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 bg-[#1E293B] z-10 shadow-sm">
              <tr className="bg-[#1E293B] border-b border-slate-800">
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800 w-12">Done</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Email</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Company Name</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Phone Number</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Sector</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Rating</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <AnimatePresence initial={false}>
                {filteredLeads.map((lead) => (
                  <motion.tr
                    key={`lead-${lead.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ 
                      opacity: lead.completed && statusFilter === 'pending' ? 0 : 1,
                      x: lead.completed && statusFilter === 'pending' ? -20 : 0
                    }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "hover:bg-[#2D3748]/40 transition-colors group",
                      lead.color && "bg-opacity-10",
                      lead.completed && "opacity-30 grayscale-[0.5]"
                    )}
                    style={lead.color ? { backgroundColor: `${lead.color}15` } : undefined}
                  >
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => onToggleComplete(lead.id)}
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          lead.completed ? "bg-green-500 border-green-500 text-white" : "bg-[#0F172A] border-slate-700 hover:border-blue-500"
                        )}
                      >
                        {lead.completed && <X className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <span className="text-sm text-slate-300">{lead.email}</span>
                        {lead.email && (
                          <button
                            onClick={() => copyField(lead.email, `${lead.id}-email`)}
                            className={cn(
                              "ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all whitespace-nowrap",
                              fieldCopied === `${lead.id}-email` ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-slate-800 text-slate-500 hover:bg-blue-500/20 hover:text-blue-400"
                            )}
                          >
                            <Copy className="w-2.5 h-2.5" />
                            {fieldCopied === `${lead.id}-email` ? "تم" : "نسخ"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">{lead.companyName}</div>
                        <button
                          onClick={() => copyField(lead.companyName, `${lead.id}-name`)}
                          className={cn(
                            "ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all whitespace-nowrap",
                            fieldCopied === `${lead.id}-name` ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-slate-800 text-slate-500 hover:bg-blue-500/20 hover:text-blue-400"
                          )}
                        >
                          <Copy className="w-2.5 h-2.5" />
                          {fieldCopied === `${lead.id}-name` ? "تم" : "نسخ"}
                        </button>
                      </div>
                      {lead.color && (
                        <div className="text-[10px] font-bold uppercase tracking-tighter mt-1 opacity-80" style={{ color: lead.color }}>
                          Source: {getColorName(lead.color)} Row
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <span className="text-sm text-slate-300">{lead.phoneNumber}</span>
                        {lead.phoneNumber && (
                          <button
                            onClick={() => copyField(lead.phoneNumber, `${lead.id}-phone`)}
                            className={cn(
                              "ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all whitespace-nowrap",
                              fieldCopied === `${lead.id}-phone` ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-slate-800 text-slate-500 hover:bg-blue-500/20 hover:text-blue-400"
                            )}
                          >
                            <Copy className="w-2.5 h-2.5" />
                            {fieldCopied === `${lead.id}-phone` ? "تم" : "نسخ"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                        {lead.sector || "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <span className="text-sm font-bold">{lead.rating}</span>
                        <div className="flex text-[10px] opacity-20">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={`star-${lead.id}-${i}`} className={i < Math.floor(Number(lead.rating)) ? "opacity-100" : ""}>{i < Math.floor(Number(lead.rating)) ? "★" : "☆"}</span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2 max-w-[200px]">
                        {lead.noteFields && lead.noteFields.length > 0 ? (
                          lead.noteFields.map((field, fIdx) => (
                            <div key={`field-${lead.id}-${fIdx}`} className="flex flex-col gap-1 p-2 rounded bg-[#0F172A]/50 border border-slate-800 group/note">
                              <div className="flex items-center justify-between gap-2 overflow-hidden">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 truncate">{field.label}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyField(field.value, `${lead.id}-note-${fIdx}`);
                                  }}
                                  className={cn(
                                    "flex items-center gap-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase transition-all whitespace-nowrap",
                                    fieldCopied === `${lead.id}-note-${fIdx}` ? "bg-green-500/20 text-green-400" : "bg-slate-800 text-slate-500 hover:bg-blue-500/20 hover:text-blue-400 opacity-0 group-hover/note:opacity-100"
                                  )}
                                >
                                  <Copy className="w-2 h-2" />
                                  {fieldCopied === `${lead.id}-note-${fIdx}` ? "تم" : "نسخ"}
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-tight italic line-clamp-1 group-hover/note:line-clamp-none">
                                {field.value}
                              </p>
                            </div>
                          ))
                        ) : lead.notes ? (
                          <p className="text-[11px] text-slate-500 italic leading-tight">
                            {lead.notes}
                          </p>
                        ) : (
                          <span className="text-[10px] text-slate-700 italic">No notes</span>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {filteredLeads.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-slate-600">
              <div className="p-4 rounded-full bg-[#0F172A] mb-4 border border-slate-800">
                <Search className="w-8 h-8 opacity-20" />
              </div>
              <p className="text-sm font-medium">No records matching the filter criteria.</p>
            </div>
          )}
        </div>

        {/* Table Footer */}
        <div className="mt-auto border-t border-slate-800 px-6 py-4 bg-[#0F172A]/50 flex flex-col sm:flex-row items-center justify-between rounded-b-xl gap-4">
          <span className="text-[11px] text-slate-500 font-medium italic">
            Showing {filteredLeads.length} filtered records from active dataset
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Extraction Quality:</span>
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="w-full h-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                </div>
                <span className="text-[10px] font-bold text-green-500">100%</span>
              </div>
            </div>
            <div className="flex bg-[#0F172A] border border-slate-800 rounded divide-x divide-slate-800 shadow-sm overflow-hidden">
              <button className="px-3 py-1 text-[10px] uppercase font-bold text-slate-600 cursor-not-allowed">Prev</button>
              <button className="px-4 py-1 text-[10px] uppercase font-bold text-blue-400 bg-blue-500/10">1</button>
              <button className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 hover:bg-slate-800 hover:text-white">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
