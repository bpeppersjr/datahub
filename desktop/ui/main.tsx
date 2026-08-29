import React from 'react';
import { createRoot } from 'react-dom/client';
import CoTiveCollector from '../../app/page';
import '../../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Co*Tive Collector could not find its application root.');

createRoot(root).render(
  <React.StrictMode>
    <CoTiveCollector />
  </React.StrictMode>,
);
