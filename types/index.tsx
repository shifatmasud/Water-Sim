/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Window Management ---
export type WindowId = 'control' | 'code' | 'console';

export interface WindowState {
  id: WindowId;
  title: string;
  isOpen: boolean;
  zIndex: number;
  x: number;
  y: number;
}

// --- Console Logging ---
export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
}
