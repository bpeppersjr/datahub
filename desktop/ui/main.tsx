import React from 'react';
import { createRoot } from 'react-dom/client';
import AtlasRunner from '../../app/page';
import '../../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Atlas Runner could not find its application root.');

createRoot(root).render(
  <React.StrictMode>
    <AtlasRunner />
  </React.StrictMode>,
);
