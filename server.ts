/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import multer from "multer";
import ExcelJS from "exceljs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup Gemini
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// Helper to sanitize/map colors to simple names if they are standard theme colors
function getHexColor(fill: ExcelJS.Fill | undefined): string | undefined {
  if (!fill) return undefined;
  
  if (fill.type === 'pattern') {
    const colors = [fill.fgColor, fill.bgColor].filter(Boolean) as any[];
    
    for (const color of colors) {
      if (!color) continue;

      // 1. Core ARGB detection (AARRGGBB)
      if (color.argb) {
        let hex = color.argb;
        if (hex.length === 8) hex = hex.substring(2);
        const upperHex = `#${hex.toUpperCase()}`;
        // Skip default white/transparent/black backgrounds if they are likely just empty
        if (upperHex === '#FFFFFF' || upperHex === '#000000' || upperHex === '#00000000') continue;
        return upperHex;
      }

      // 2. Theme color fallback (Excel palettes)
      if (color.theme !== undefined) {
        const themePalette = [
          '#FFFFFF', '#000000', '#EEECE1', '#1F497D', '#4F81BD', 
          '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646'
        ];
        const match = themePalette[color.theme];
        if (match && match !== '#FFFFFF' && match !== '#000000') return match;
      }

      // 3. Indexed color fallback
      if (color.indexed !== undefined) {
        const indexedPalette: Record<number, string> = {
          2: "#FF0000", 3: "#00FF00", 4: "#0000FF", 5: "#FFFF00", 6: "#FF00FF", 7: "#00FFFF",
          8: "#800000", 9: "#008000", 10: "#000080", 11: "#808000", 12: "#800080", 13: "#008080",
          14: "#C0C0C0", 15: "#808080", 16: "#9999FF"
        };
        const match = indexedPalette[color.indexed];
        if (match) return match;
      }
    }
  } else if (fill.type === 'gradient' && fill.stops && fill.stops.length > 0) {
    const firstStop = fill.stops[0].color as any;
    if (firstStop && 'argb' in firstStop && firstStop.argb) {
      let a = firstStop.argb;
      if (a.length === 8) a = a.substring(2);
      return `#${a.toUpperCase()}`;
    }
  }
  
  return undefined;
}

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString() || `Column ${colNumber}`;
    });

    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const rowData: any = {
        _rowNumber: rowNumber,
        _rowColor: undefined
      };

      // Check row fill first
      if (row.fill) {
        rowData._rowColor = getHexColor(row.fill);
      }

      // Scan all cells in the row to find the first meaningful background color
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber] || `Column ${colNumber}`;
        const cellValue = cell.value;
        
        if (cellValue && typeof cellValue === 'object' && 'richText' in cellValue) {
          rowData[header] = (cellValue as any).richText.map((rt: any) => rt.text).join("");
        } else {
          rowData[header] = cellValue;
        }

        if (!rowData._rowColor) {
          const color = getHexColor(cell.fill);
          if (color) {
            rowData._rowColor = color;
          }
        }
      });

      rows.push(rowData);
    });

    // Use Gemini to map columns to our expected fields
    const prompt = `
      I have an Excel sheet with these headers: ${headers.filter(Boolean).join(", ")}.
      I need to extract the following fields for each lead:
      - companyName
      - phoneNumber
      - email
      - sector
      - rating
      - noteColumns: An ARRAY of ALL column headers that contain notes, comments, remarks, or any descriptive text. Identify EVERY column that looks like a note.

      Please provide a JSON mapping of my field names to the Excel header names.
      If a field doesn't seem to exist, map it to null.
      Excel headers: ${JSON.stringify(headers.filter(Boolean))}
    `;

    const mappingResponse = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            companyName: { type: Type.STRING },
            phoneNumber: { type: Type.STRING },
            email: { type: Type.STRING },
            noteColumns: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            sector: { type: Type.STRING },
            rating: { type: Type.STRING },
          }
        }
      }
    });

    const mapping = JSON.parse(mappingResponse.text);

    const leads = rows.map((row, idx) => {
      // Define the set of headers already mapped to core fields
      const coreFields = [
        mapping.companyName,
        mapping.phoneNumber,
        mapping.email,
        mapping.sector,
        mapping.rating
      ].filter(Boolean);

      // Automatically capture ANY column that isn't one of the core fields but contains data
      const extraFields = Object.keys(row)
        .filter(key => !key.startsWith('_') && !coreFields.includes(key))
        .map(key => {
          const value = row[key];
          if (value && String(value).trim() && String(value) !== "[object Object]") {
            return { label: key, value: String(value).trim() };
          }
          return null;
        })
        .filter((f): f is { label: string; value: string } => f !== null);

      return {
        id: `row-${row._rowNumber}-${idx}`,
        companyName: row[mapping.companyName] || "",
        phoneNumber: String(row[mapping.phoneNumber] || ""),
        email: row[mapping.email] || "",
        noteFields: extraFields,
        notes: extraFields.map(f => `${f.label}: ${f.value}`).join(" | "),
        sector: row[mapping.sector] || "",
        rating: String(row[mapping.rating] || ""),
        color: row._rowColor ? row._rowColor.toUpperCase() : undefined,
      };
    });

    const availableColors = Array.from(new Set(leads.map(l => l.color?.toUpperCase()).filter(Boolean))) as string[];

    res.json({ leads, availableColors });

  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
