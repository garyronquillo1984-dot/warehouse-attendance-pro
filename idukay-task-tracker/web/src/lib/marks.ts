// "Completed" is a PERSONAL mark kept on this device only. It never changes the official
// homework, which every parent sees identically. Stored in localStorage (a per-device
// preference); if storage is blocked the marks simply last until the page is closed.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'itt.done';
type Marks = Record<string, string>;   // `${studentId}:${homeworkId}` → day it was marked (YYYY-MM-DD)

function read(): Marks {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Marks; } catch { return {}; }
}

let memory: Marks = read();
const listeners = new Set<() => void>();

export function useMarks(studentId: string | null) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const markedOn = useCallback((hwId: string) => (studentId ? memory[`${studentId}:${hwId}`] ?? null : null), [studentId]);
  const toggle = useCallback((hwId: string, today: string) => {
    if (!studentId) return;
    const k = `${studentId}:${hwId}`;
    memory = { ...memory };
    if (memory[k]) delete memory[k]; else memory[k] = today;
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* storage blocked */ }
    listeners.forEach(l => l());
  }, [studentId]);
  return { markedOn, toggle };
}
