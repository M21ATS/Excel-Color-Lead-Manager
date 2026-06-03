/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FileUploaderProps {
  onUploadSuccess: (data: any) => void;
}

export function FileUploader({ onUploadSuccess }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      setError("Supported formats: XLSX, XLS only.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("File too large for Vercel (Limit: 4.5MB).");
        }
        if (response.status === 504) {
          throw new Error("Analysis took too long (Vercel timeout). Try a smaller file.");
        }
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      onUploadSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [onUploadSuccess]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative group cursor-pointer rounded-xl border border-slate-800 bg-[#1E293B] transition-all duration-300 p-10 text-center shadow-lg",
          isDragging ? "border-blue-500 bg-blue-500/5 ring-4 ring-blue-500/10" : "hover:border-slate-700 hover:shadow-2xl",
          isLoading && "pointer-events-none opacity-50"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          type="file"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={onSelect}
          accept=".xlsx, .xls"
        />

        <div className="flex flex-col items-center">
          <div className={cn(
            "mb-6 w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-all duration-300",
            isDragging && "scale-110 text-blue-400 bg-blue-500/20"
          )}>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            {isLoading ? "Analyzing Workbook..." : "Import Lead Spreadsheet"}
          </h3>
          <p className="text-slate-400 text-xs mb-8 max-w-[240px] mx-auto leading-relaxed">
            Drag and drop your file here, or click to browse your local directory.
          </p>
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <FileText className="w-4 h-4 text-slate-700" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Excel Files</span>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-slate-700" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Color Sync</span>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-8 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center justify-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
