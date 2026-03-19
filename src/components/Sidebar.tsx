import React, { useRef } from 'react';
import { useAppStore } from '../store';
import { ChevronLeft, ChevronRight, Settings, Upload, Download, Pause, Play, Save, FolderOpen } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Sidebar: React.FC = () => {
  const state = useAppStore();
  const [isOpen, setIsOpen] = React.useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsInputRef = useRef<HTMLInputElement>(null);

  const handleSaveSettings = () => {
    const {
      resolution, width, height, seed, particleCount, flowSpeed, noiseScale,
      trailPersistence, vortexStrength, vortexRange, clickRepulsion, particleSize,
      useImageColors, imageOpacity, colors
    } = state;
    
    const settings = {
      resolution, width, height, seed, particleCount, flowSpeed, noiseScale,
      trailPersistence, vortexStrength, vortexRange, clickRepulsion, particleSize,
      useImageColors, imageOpacity, colors
    };
    
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'particle-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const settings = JSON.parse(event.target?.result as string);
          state.setAppState(settings);
        } catch (error) {
          console.error('Failed to parse settings JSON', error);
          alert('Invalid settings file.');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    state.setAppState({ resolution: val });
    if (val !== 'custom') {
      const [w, h] = val.split('x').map(Number);
      state.setAppState({ width: w, height: h });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        state.setAppState({ imageUrl: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="absolute top-4 left-4 z-50 bg-black/80 text-white p-2 rounded-md border border-white/20 hover:bg-black flex items-center gap-2"
      >
        <Settings size={16} /> Open Settings
      </button>
    );
  }

  return (
    <div className="absolute top-0 left-0 h-full w-80 bg-black/90 text-white border-r border-white/10 overflow-y-auto z-50 flex flex-col font-mono text-sm">
      <div className="p-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-black/90 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-1 rounded">
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold">Hide Settings</span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Luminous Resonance</h2>
          <p className="text-xs text-gray-400">Interactive particle field responding to mouse movement with organic flow dynamics</p>
        </div>

        <Section title="Canvas Resolution">
          <select 
            value={state.resolution} 
            onChange={handleResolutionChange}
            className="w-full bg-black border border-white/20 rounded p-1 mb-2 text-sm"
          >
            <option value="custom">Custom...</option>
            <option value="1920x1080">1920 x 1080 (FHD)</option>
            <option value="1280x720">1280 x 720 (HD)</option>
            <option value="800x600">800 x 600</option>
          </select>
          <div className="flex gap-2 items-center">
            <input 
              type="number" 
              value={state.width} 
              onChange={e => state.setAppState({ width: Number(e.target.value) })}
              className="w-1/2 bg-black border border-white/20 rounded p-1 text-sm"
              disabled={state.resolution !== 'custom'}
            />
            <span>x</span>
            <input 
              type="number" 
              value={state.height} 
              onChange={e => state.setAppState({ height: Number(e.target.value) })}
              className="w-1/2 bg-black border border-white/20 rounded p-1 text-sm"
              disabled={state.resolution !== 'custom'}
            />
          </div>
        </Section>

        <Section title="Seed">
          <div className="flex gap-2">
            <input 
              type="number" 
              value={state.seed} 
              onChange={e => state.setAppState({ seed: Number(e.target.value) })}
              className="flex-1 bg-black border border-white/20 rounded p-1 text-sm"
            />
            <button 
              onClick={() => state.setAppState({ seed: Math.floor(Math.random() * 100000) })}
              className="bg-white/10 hover:bg-white/20 px-2 rounded border border-white/20 text-xs"
            >
              Random
            </button>
          </div>
        </Section>

        <Section title="Parameters">
          <Slider label="Particle Count" value={state.particleCount} min={100} max={15000} step={100} onChange={v => state.setAppState({ particleCount: v })} />
          <Slider label="Flow Speed" value={state.flowSpeed} min={0.1} max={5.0} step={0.1} onChange={v => state.setAppState({ flowSpeed: v })} />
          <Slider label="Noise Scale" value={state.noiseScale} min={0.001} max={0.01} step={0.001} onChange={v => state.setAppState({ noiseScale: v })} />
          <Slider label="Trail Persistence" value={state.trailPersistence} min={0} max={0.99} step={0.01} onChange={v => state.setAppState({ trailPersistence: v })} />
          <Slider label="Vortex Strength" value={state.vortexStrength} min={0} max={1} step={0.05} onChange={v => state.setAppState({ vortexStrength: v })} />
          <Slider label="Vortex Range" value={state.vortexRange} min={10} max={1000} step={10} onChange={v => state.setAppState({ vortexRange: v })} />
          <Slider label="Vortex Attraction" value={state.clickRepulsion} min={0} max={10} step={0.5} onChange={v => state.setAppState({ clickRepulsion: v })} />
          <Slider label="Particle Size" value={state.particleSize} min={0.5} max={5.0} step={0.1} onChange={v => state.setAppState({ particleSize: v })} />
        </Section>

        <Section title="Image Color Mapping">
          <div className="flex items-center gap-2 mb-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-white/10 hover:bg-white/20 py-1 px-2 rounded border border-white/20 flex items-center justify-center gap-2 text-sm"
            >
              <Upload size={14} /> Upload Image
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <span className="text-xs text-gray-400 truncate w-24">
              {state.imageUrl ? 'Image loaded' : 'No file chosen'}
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
            <input 
              type="checkbox" 
              checked={state.useImageColors} 
              onChange={e => state.setAppState({ useImageColors: e.target.checked })}
              className="accent-white"
            />
            Enable color mapping from image
          </label>
          
          {state.useImageColors && (
            <Slider 
              label="Background Image Opacity" 
              value={state.imageOpacity} 
              min={0} 
              max={1} 
              step={0.05} 
              onChange={v => state.setAppState({ imageOpacity: v })} 
            />
          )}
        </Section>

        <Section title="Colors">
          {state.colors.map((color, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input 
                type="color" 
                value={color} 
                onChange={e => {
                  const newColors = [...state.colors];
                  newColors[i] = e.target.value;
                  state.setAppState({ colors: newColors });
                }}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
              />
              <span className="text-sm">{color.toUpperCase()}</span>
            </div>
          ))}
        </Section>

        <Section title="Actions">
          <div className="flex gap-2 mb-2">
            <button 
              onClick={() => state.setAppState({ isPaused: !state.isPaused })}
              className="flex-1 bg-white/10 hover:bg-white/20 py-2 px-2 rounded border border-white/20 flex items-center justify-center gap-2 text-sm"
            >
              {state.isPaused ? <Play size={14} /> : <Pause size={14} />}
              {state.isPaused ? 'Play' : 'Pause'}
            </button>
            <button 
              onClick={() => state.setTriggerDownload(true)}
              className="flex-1 bg-white/10 hover:bg-white/20 py-2 px-2 rounded border border-white/20 flex items-center justify-center gap-2 text-sm"
            >
              <Download size={14} /> Download PNG
            </button>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleSaveSettings}
              className="flex-1 bg-white/10 hover:bg-white/20 py-2 px-2 rounded border border-white/20 flex items-center justify-center gap-2 text-sm"
            >
              <Save size={14} /> Save Settings
            </button>
            <button 
              onClick={() => settingsInputRef.current?.click()}
              className="flex-1 bg-white/10 hover:bg-white/20 py-2 px-2 rounded border border-white/20 flex items-center justify-center gap-2 text-sm"
            >
              <FolderOpen size={14} /> Load Settings
            </button>
            <input 
              type="file" 
              ref={settingsInputRef} 
              onChange={handleLoadSettings} 
              accept=".json" 
              className="hidden" 
            />
          </div>
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-t border-white/10 pt-4">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-1 h-1 bg-white rounded-full"></span>
      {title}
    </h3>
    {children}
  </div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }> = ({ label, value, min, max, step, onChange }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs mb-1">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step} 
      value={value} 
      onChange={e => onChange(Number(e.target.value))}
      className="w-full accent-white h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
    />
  </div>
);
