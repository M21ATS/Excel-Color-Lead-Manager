/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "./components/FileUploader";
import { LeadTable } from "./components/LeadTable";
import { ExtractionResult, Lead } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { FileSpreadsheet, RefreshCcw, Layers, Terminal, LogIn, LogOut, Loader2, Save } from "lucide-react";
import { auth, db } from "./lib/firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from "firebase/auth";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  setDoc, 
  doc, 
  writeBatch,
  getDocs
} from "firebase/firestore";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExtractionResult | null>(null);
  const [systemTime, setSystemTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const persistLeads = useCallback(async (result: ExtractionResult, currentUser: User) => {
    setSaving(true);
    try {
      // Clear old leads first
      const q = query(collection(db, "leads"), where("userId", "==", currentUser.uid));
      const oldDocs = await getDocs(q);
      
      // chunk deletion
      const docsToDelete = oldDocs.docs;
      for (let i = 0; i < docsToDelete.length; i += 500) {
        const batch = writeBatch(db);
        docsToDelete.slice(i, i + 500).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Save new leads in chunks of 500 (Firestore limit)
      for (let i = 0; i < result.leads.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = result.leads.slice(i, i + 500);
        
        chunk.forEach((lead) => {
          // Ensure we prefix local leads, but if they already come from Firestore they'll have prefix
          const finalId = lead.id.startsWith(currentUser.uid) ? lead.id : `${currentUser.uid}_${lead.id}`;
          const leadRef = doc(db, "leads", finalId);
          batch.set(leadRef, {
            ...lead,
            id: finalId, 
            userId: currentUser.uid,
            updatedAt: Date.now()
          });
        });
        await batch.commit();
      }
      setLastSaved(Date.now());
    } catch (error) {
      console.error("Failed to save leads", error);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setData(null);
      setLastSaved(null);
      return;
    }

    const q = query(collection(db, "leads"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInitialFetchDone(true);
      // If we are currently saving, don't overwrite from snapshot yet to avoid flickering or partial states
      if (saving) return;

      const fetchedLeadsMap = new Map<string, Lead>();
      snapshot.forEach((doc) => {
        const leadData = doc.data() as Lead;
        // Force the ID to be the Firestore document ID to ensure cross-session uniqueness
        const id = doc.id;
        fetchedLeadsMap.set(id, { ...leadData, id });
      });
      
      const fetchedLeads = Array.from(fetchedLeadsMap.values());

      if (fetchedLeads.length > 0) {
        const colors = Array.from(new Set(fetchedLeads.map(l => l.color?.toUpperCase()).filter(Boolean))) as string[];
        
        setData(prev => {
          // Compare current IDs to fetched IDs to detect real changes
          const currentIds = prev?.leads.map(l => l.id).sort().join(",") || "";
          const newIds = fetchedLeads.map(l => l.id).sort().join(",") || "";
          
          if (!prev || currentIds !== newIds) {
            return { leads: [...fetchedLeads], availableColors: colors };
          }
          return prev;
        });
        setLastSaved(Date.now());
      } else if (!data && !saving) {
        // Only clear if we aren't in the middle of an upload and haven't found any remote leads
        setData(null);
        setLastSaved(null);
      }
    });

    return () => unsubscribe();
  }, [user, saving, !!data]);

  // Auto-save local data after login
  useEffect(() => {
    if (user && data && !lastSaved && !saving) {
      persistLeads(data, user);
    }
  }, [user, !!data, lastSaved, saving, persistLeads, data]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSystemTime(now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) + " UTC");
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleUploadSuccess = async (result: ExtractionResult) => {
    const uniqueLeadsMap = new Map<string, Lead>();
    result.leads.forEach(l => {
      const stableId = l.id?.trim();
      if (stableId) {
        uniqueLeadsMap.set(stableId, { ...l, id: stableId });
      }
    });
    const uniqueLeads = Array.from(uniqueLeadsMap.values());

    const finalResult = { ...result, leads: uniqueLeads };
    setData(finalResult);
    setLastSaved(null); 

    if (user) {
      persistLeads(finalResult, user);
    }
  };

  const toggleComplete = async (id: string) => {
    if (!data || !user) return;
    const lead = data.leads.find(l => l.id === id);
    if (!lead) return;

    try {
      const leadRef = doc(db, "leads", id);
      await setDoc(leadRef, { ...lead, completed: !lead.completed, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const reset = async () => {
    if (user && window.confirm("This will clear all saved leads. Continue?")) {
      const batch = writeBatch(db);
      const q = query(collection(db, "leads"), where("userId", "==", user.uid));
      const snapshot = await getDocs(q);
      snapshot.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    setData(null);
    setInitialFetchDone(false); // Reset to re-trigger uploader gracefully if no more data
  };

  const goBack = () => {
    setData(null);
    setInitialFetchDone(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-sans">
      {/* Professional Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-[#1E293B] border-b border-slate-800 shrink-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white font-bold shadow-md">LE</div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            LeadExtractor <span className="text-slate-500 font-normal">v3.1</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {saving && (
              <motion.div
                key="syncing-badge"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest"
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                Syncing...
              </motion.div>
            )}
            {user && !saving && lastSaved && (
              <motion.div
                key="synced-badge"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase tracking-widest"
              >
                <Save className="w-3 h-3" />
                Cloud Synced
              </motion.div>
            )}
            {data && (
              <motion.div 
                key="dataset-badge"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="px-4 py-2 bg-slate-800 border border-dashed border-slate-700 rounded-md text-xs font-medium text-slate-400 hidden lg:block"
              >
                Lead Dataset Loaded ({data.leads.length} records)
              </motion.div>
            )}
          </AnimatePresence>
          
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Account</span>
                <span className="text-xs text-white max-w-[120px] truncate">{user.email}</span>
              </div>
              <button 
                onClick={logout}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md transition-colors"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={login}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md shadow-sm transition-colors flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}

          {data && (
            <div className="flex items-center gap-2">
              <button 
                onClick={goBack}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm font-medium rounded-md transition-colors"
              >
                Home
              </button>
              <button 
                onClick={reset}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="max-w-7xl mx-auto h-full">
          <AnimatePresence mode="wait">
            {user && !initialFetchDone ? (
              <motion.div
                key="loading-db"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse"></div>
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin relative" />
                </div>
                <div className="flex flex-col items-center">
                  <h3 className="text-xl font-bold text-white mb-2">Restoring Your Database</h3>
                  <p className="text-slate-400 text-sm">Syncing latest leads from Google Cloud Firestore...</p>
                </div>
              </motion.div>
            ) : !data ? (
              <motion.div
                key="uploader"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center min-h-[60vh]"
              >
                <div className="text-center mb-12">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-4"
                  >
                    <Layers className="w-3 h-3" />
                    Enterprise Data Extraction
                  </motion.div>
                  <h2 className="text-4xl font-bold tracking-tight text-white mb-4">Transfer Leads Professionally</h2>
                  <p className="text-slate-400 max-w-md mx-auto mb-8">Upload your color-coded Excel leads to extract structured details and filter by row color.</p>
                  
                  {!user && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-6 rounded-2xl bg-blue-500/5 border border-blue-500/10 max-w-sm mx-auto"
                    >
                      <p className="text-sm text-blue-300/80 mb-4 font-medium italic">Sign in to save your leads and access them from any device later.</p>
                      <button 
                        onClick={login}
                        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-3 active:scale-95"
                      >
                        <LogIn className="w-5 h-5" />
                        Sign In with Google to Save
                      </button>
                    </motion.div>
                  )}
                </div>

                <FileUploader onUploadSuccess={handleUploadSuccess} />
                
                <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                  {[
                    { icon: FileSpreadsheet, title: "XLSX Native", desc: "Native support for workbook cell styling and ARGB mappings." },
                    { icon: RefreshCcw, title: "Gemini Mapping", desc: "AI-powered column inference for non-standard lead formats." },
                    { icon: Layers, title: "Color Segment", desc: "Filter records by highlight colors for priority management." }
                  ].map((feature, i) => (
                    <motion.div 
                      key={`feat-${i}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="p-6 rounded-xl bg-[#1E293B] border border-slate-800 hover:border-slate-700 hover:shadow-xl transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-blue-400 mb-4">
                        <feature.icon className="w-5 h-5" />
                      </div>
                      <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                      <p className="text-slate-400 text-xs leading-relaxed">{feature.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                <LeadTable leads={data.leads} availableColors={data.availableColors} onToggleComplete={toggleComplete} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Professional Footer Status Bar */}
      <footer className="bg-[#0F172A] text-slate-500 px-8 py-2 text-[10px] flex justify-between items-center shrink-0 border-t border-slate-800">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            Connected: Microsoft Excel Engine
          </span>
          <span className="w-px h-3 bg-slate-800" />
          <span className="flex items-center gap-2">
            <Terminal className="w-3 h-3" />
            Ready for Transfer
          </span>
        </div>
        <div className="uppercase tracking-widest font-medium">
          System Time: {systemTime}
        </div>
      </footer>
    </div>
  );
}
