/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NoteField {
  label: string;
  value: string;
}

export interface Lead {
  id: string;
  companyName: string;
  phoneNumber: string;
  email: string;
  notes: string;
  noteFields?: NoteField[];
  sector: string;
  rating: string;
  color?: string; // Hex color or basic name
  originalColor?: string; // Excel color object or string
  completed?: boolean;
  userId?: string;
  updatedAt?: number;
}

export interface ExtractionResult {
  leads: Lead[];
  availableColors: string[];
}
