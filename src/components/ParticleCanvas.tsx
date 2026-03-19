import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { useAppStore } from '../store';

// Simple seeded random function
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ParticleCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useAppStore();
  
  // Refs for mutable state that shouldn't trigger re-renders
  const simRef = useRef<any>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, isDown: false });
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.setSize(state.width, state.height, false);
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.maxHeight = '100%';
    renderer.domElement.style.aspectRatio = `${state.width} / ${state.height}`;
    renderer.autoClear = false;
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    // Cameras
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Render Targets for Trails (Ping-Pong)
    let rtA = new THREE.WebGLRenderTarget(state.width, state.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    let rtB = new THREE.WebGLRenderTarget(state.width, state.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    // Fade Scene
    const fadeScene = new THREE.Scene();
    const fadeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        persistence: { value: state.trailPersistence },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float persistence;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          gl_FragColor = vec4(texel.rgb * persistence, texel.a * persistence);
        }
      `,
      transparent: false,
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
    });
    const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial);
    fadeScene.add(fadeQuad);

    // Copy Scene (to screen)
    const copyScene = new THREE.Scene();
    const copyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
      transparent: false,
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
    });
    const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial);
    copyScene.add(copyQuad);

    // Particle Scene
    const particleScene = new THREE.Scene();
    const particleGeometry = new THREE.BufferGeometry();
    
    // Create circular particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    const particleTexture = new THREE.CanvasTexture(canvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: state.particleSize,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      map: particleTexture,
      depthWrite: false,
      depthTest: false,
    });
    const particlesMesh = new THREE.Points(particleGeometry, particleMaterial);
    particleScene.add(particlesMesh);

    // Save to ref
    simRef.current = {
      renderer,
      rtA,
      rtB,
      fadeMaterial,
      copyMaterial,
      fadeScene,
      copyScene,
      particleScene,
      particleGeometry,
      particleMaterial,
      orthoCamera,
      particles: [],
      time: 0,
      noise3D: createNoise3D(mulberry32(state.seed)),
      animationFrameId: 0,
      cachedImageData: null,
    };

    // Initialize particles
    initParticles();

    // Event Listeners
    const handleMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const scaleX = state.width / rect.width;
      const scaleY = state.height / rect.height;
      mouseRef.current.x = (e.clientX - rect.left) * scaleX;
      mouseRef.current.y = (e.clientY - rect.top) * scaleY;
    };
    const handleMouseDown = () => { mouseRef.current.isDown = true; };
    const handleMouseUp = () => { mouseRef.current.isDown = false; };
    const handleMouseLeave = () => { mouseRef.current.x = -1000; mouseRef.current.y = -1000; mouseRef.current.isDown = false; };

    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('mouseleave', handleMouseLeave);

    // Start loop
    renderLoop();

    return () => {
      cancelAnimationFrame(simRef.current.animationFrameId);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave);
      renderer.dispose();
      rtA.dispose();
      rtB.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      fadeMaterial.dispose();
      copyMaterial.dispose();
      particleTexture.dispose();
    };
  }, [state.width, state.height]); // Re-init on resize

  // Handle Image Upload for Color Mapping
  useEffect(() => {
    if (state.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = state.width;
        canvas.height = state.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, state.width, state.height);
          imageCanvasRef.current = canvas;
          simRef.current.cachedImageData = ctx.getImageData(0, 0, state.width, state.height);
        }
      };
      img.src = state.imageUrl;
    } else {
      imageCanvasRef.current = null;
      if (simRef.current) simRef.current.cachedImageData = null;
    }
  }, [state.imageUrl, state.width, state.height]);

  // Update parameters without re-init
  useEffect(() => {
    if (!simRef.current) return;
    simRef.current.noise3D = createNoise3D(mulberry32(state.seed));
    initParticles();
  }, [state.seed, state.particleCount]);

  useEffect(() => {
    if (!simRef.current) return;
    simRef.current.fadeMaterial.uniforms.persistence.value = state.trailPersistence;
    simRef.current.particleMaterial.size = state.particleSize;
  }, [state.trailPersistence, state.particleSize]);

  useEffect(() => {
    if (state.triggerDownload && simRef.current) {
      const link = document.createElement('a');
      link.download = 'luminous-resonance.png';
      link.href = simRef.current.renderer.domElement.toDataURL('image/png');
      link.click();
      state.setTriggerDownload(false);
    }
  }, [state.triggerDownload]);

  const initParticles = () => {
    if (!simRef.current) return;
    const { particleCount, width, height, flowSpeed } = state;
    const particles = [];
    const random = mulberry32(state.seed);
    
    for (let i = 0; i < particleCount; i++) {
      const angle = random() * Math.PI * 2;
      const speedMult = random() * 0.5 + 0.5;
      particles.push({
        id: i,
        x: random() * width,
        y: random() * height,
        vx: Math.cos(angle) * flowSpeed * speedMult,
        vy: Math.sin(angle) * flowSpeed * speedMult,
        angle: angle,
        speedMult: speedMult,
        colorIndex: Math.floor(random() * 3),
      });
    }
    simRef.current.particles = particles;

    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    simRef.current.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    simRef.current.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };

  const renderLoop = () => {
    if (!simRef.current) return;
    simRef.current.animationFrameId = requestAnimationFrame(renderLoop);

    if (useAppStore.getState().isPaused) return;

    const sim = simRef.current;
    const currentState = useAppStore.getState();
    const { width, height, flowSpeed, noiseScale, vortexStrength, vortexRange, clickRepulsion, useImageColors, colors } = currentState;
    const mouse = mouseRef.current;

    sim.time += 0.005;

    const positions = sim.particleGeometry.attributes.position.array as Float32Array;
    const colorArray = sim.particleGeometry.attributes.color.array as Float32Array;

    let imageData: ImageData | null = null;
    if (useImageColors && sim.cachedImageData) {
      imageData = sim.cachedImageData;
    }

    const parsedColors = colors.map(c => new THREE.Color(c));

    for (let i = 0; i < sim.particles.length; i++) {
      const p = sim.particles[i];

      // Vortex on click
      if (mouse.isDown) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < vortexRange && dist > 0) {
          const force = (vortexRange - dist) / vortexRange;
          
          // Vortex (perpendicular)
          p.vx += (dy / dist) * force * vortexStrength;
          p.vy -= (dx / dist) * force * vortexStrength;
          
          // Inward attraction to form a cohesive swirling vortex
          p.vx += (dx / dist) * force * clickRepulsion * 0.1;
          p.vy += (dy / dist) * force * clickRepulsion * 0.1;
        }
      }

      // Speed regulation
      const targetSpeed = (p.speedMult || 1) * flowSpeed;
      const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      
      if (currentSpeed > targetSpeed) {
        // Dampen excess speed from vortex
        p.vx *= 0.95;
        p.vy *= 0.95;
      } else if (currentSpeed < targetSpeed && currentSpeed > 0.001) {
        // Accelerate back to base speed smoothly
        p.vx += (p.vx / currentSpeed) * (targetSpeed - currentSpeed) * 0.05;
        p.vy += (p.vy / currentSpeed) * (targetSpeed - currentSpeed) * 0.05;
      } else if (currentSpeed <= 0.001) {
        p.vx = Math.cos(p.angle) * targetSpeed;
        p.vy = Math.sin(p.angle) * targetSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Bounce off walls
      if (p.x <= 0) {
        p.x = 0;
        p.vx *= -1;
        p.angle = Math.atan2(p.vy, p.vx);
      } else if (p.x >= width) {
        p.x = width;
        p.vx *= -1;
        p.angle = Math.atan2(p.vy, p.vx);
      }
      
      if (p.y <= 0) {
        p.y = 0;
        p.vy *= -1;
        p.angle = Math.atan2(p.vy, p.vx);
      } else if (p.y >= height) {
        p.y = height;
        p.vy *= -1;
        p.angle = Math.atan2(p.vy, p.vx);
      }

      // Map to WebGL coordinates [-1, 1]
      positions[i * 3] = (p.x / width) * 2 - 1;
      positions[i * 3 + 1] = -(p.y / height) * 2 + 1;
      positions[i * 3 + 2] = 0;

      // Colors
      if (useImageColors && imageData) {
        const ix = Math.floor(p.x);
        const iy = Math.floor(p.y);
        if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
          const idx = (iy * width + ix) * 4;
          colorArray[i * 3] = imageData.data[idx] / 255;
          colorArray[i * 3 + 1] = imageData.data[idx + 1] / 255;
          colorArray[i * 3 + 2] = imageData.data[idx + 2] / 255;
        }
      } else {
        const color = parsedColors[p.colorIndex];
        colorArray[i * 3] = color.r;
        colorArray[i * 3 + 1] = color.g;
        colorArray[i * 3 + 2] = color.b;
      }
    }

    sim.particleGeometry.attributes.position.needsUpdate = true;
    sim.particleGeometry.attributes.color.needsUpdate = true;

    // Ping-Pong Rendering for Trails
    
    // 1. Render previous frame (rtA) to rtB with fade
    sim.fadeMaterial.uniforms.tDiffuse.value = sim.rtA.texture;
    sim.renderer.setRenderTarget(sim.rtB);
    sim.renderer.render(sim.fadeScene, sim.orthoCamera);

    // 2. Render new particles to rtB
    sim.renderer.autoClear = false;
    sim.renderer.render(sim.particleScene, sim.orthoCamera);
    sim.renderer.autoClear = true;

    // 3. Render rtB to screen
    sim.copyMaterial.uniforms.tDiffuse.value = sim.rtB.texture;
    sim.renderer.setRenderTarget(null);
    sim.renderer.clear();
    sim.renderer.render(sim.copyScene, sim.orthoCamera);

    // 4. Swap rtA and rtB
    const temp = sim.rtA;
    sim.rtA = sim.rtB;
    sim.rtB = temp;
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden relative">
      {state.useImageColors && state.imageUrl && (
        <img 
          src={state.imageUrl} 
          alt="Background" 
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: state.imageOpacity }}
        />
      )}
      <div 
        ref={containerRef} 
        className="w-full h-full flex items-center justify-center relative z-10"
      />
    </div>
  );
};
