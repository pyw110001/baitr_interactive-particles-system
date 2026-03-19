/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sidebar } from './components/Sidebar';
import { ParticleCanvas } from './components/ParticleCanvas';

export default function App() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      <Sidebar />
      <ParticleCanvas />
    </div>
  );
}
