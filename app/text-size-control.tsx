'use client';

import { useEffect, useSyncExternalStore } from 'react';

const storageKey = 'collector-text-size';
const sizes = [100, 110, 125, 150, 175, 200];
let sessionSize: number | null = null;
function snapshot() {
  if (sessionSize !== null) return sessionSize;
  try { const saved = Number(localStorage.getItem(storageKey)); return sizes.includes(saved) ? saved : 100; } catch { return 100; }
}
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      sessionSize = null;
      listener();
    }
  };
  window.addEventListener('collector-text-size', listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('collector-text-size', listener);
    window.removeEventListener('storage', onStorage);
  };
}

export default function TextSizeControl() {
  const size = useSyncExternalStore(subscribe, snapshot, () => 100);
  useEffect(() => {
    document.documentElement.style.fontSize = `${size}%`;
    document.documentElement.dataset.textSize = String(size);
  }, [size]);
  function change(value: number) {
    sessionSize = value;
    try { localStorage.setItem(storageKey, String(value)); } catch { /* Session preference only. */ }
    window.dispatchEvent(new Event('collector-text-size'));
  }
  return <div className="text-size-control">
    <label htmlFor="text-size">Text size</label>
    <select id="text-size" value={size} onChange={event => change(Number(event.target.value))}>
      {sizes.map(value => <option key={value} value={value}>{value}%</option>)}
    </select>
    <button className="ghost-button" onClick={() => change(100)} disabled={size === 100}>Reset text size</button>
  </div>;
}
