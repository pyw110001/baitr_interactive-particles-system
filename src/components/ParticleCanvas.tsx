import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { clampNormalized } from '../lib/runtime';
import { usePointerStore, createPointerKey, type InputPointer } from '../stores/pointerStore';
import { useAppStore } from '../store';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speedMult: number;
  colorIndex: number;
}

interface SimulationContext {
  renderer: THREE.WebGLRenderer;
  rtA: THREE.WebGLRenderTarget;
  rtB: THREE.WebGLRenderTarget;
  fadeMaterial: THREE.ShaderMaterial;
  copyMaterial: THREE.ShaderMaterial;
  fadeScene: THREE.Scene;
  copyScene: THREE.Scene;
  particleScene: THREE.Scene;
  particleGeometry: THREE.BufferGeometry;
  particleMaterial: THREE.PointsMaterial;
  orthoCamera: THREE.OrthographicCamera;
  particles: Particle[];
  time: number;
  noise3D: ReturnType<typeof createNoise3D>;
  animationFrameId: number;
  cachedImageData: ImageData | null;
}

interface ParticleCanvasProps {
  enableLocalPointer: boolean;
}

function mulberry32(a: number) {
  return function random() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointerToCanvasSpace(pointer: InputPointer, width: number, height: number) {
  return {
    x: pointer.normalizedX * width,
    y: pointer.normalizedY * height,
  };
}

export const ParticleCanvas: React.FC<ParticleCanvasProps> = ({ enableLocalPointer }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimulationContext | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = useAppStore();

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(state.width, state.height, false);
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.maxHeight = '100%';
    renderer.domElement.style.aspectRatio = `${state.width} / ${state.height}`;
    renderer.autoClear = false;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const rtA = new THREE.WebGLRenderTarget(state.width, state.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    const rtB = new THREE.WebGLRenderTarget(state.width, state.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

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
    fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial));

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
    copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial));

    const particleScene = new THREE.Scene();
    const particleGeometry = new THREE.BufferGeometry();

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(16, 16, 16, 0, Math.PI * 2);
    context.fill();

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

    particleScene.add(new THREE.Points(particleGeometry, particleMaterial));

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

    initParticles();

    const updateLocalPointer = (event: PointerEvent, isDown: boolean) => {
      if (!enableLocalPointer) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const normalizedX = clampNormalized((event.clientX - rect.left) / rect.width);
      const normalizedY = clampNormalized((event.clientY - rect.top) / rect.height);
      const key = createPointerKey('local', event.pointerId);
      usePointerStore.getState().upsertPointer({
        key,
        pointerId: event.pointerId,
        normalizedX,
        normalizedY,
        isDown,
        timestamp: Date.now(),
        source: 'local',
        sourceRole: 'standalone',
      });

      if (!isDown) {
        usePointerStore.getState().removePointer(key);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      updateLocalPointer(event, true);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pointerKey = createPointerKey('local', event.pointerId);
      const existingPointer = usePointerStore.getState().pointers[pointerKey];
      if (!existingPointer && event.buttons === 0) {
        return;
      }

      updateLocalPointer(event, existingPointer?.isDown ?? event.buttons > 0);
    };

    const handlePointerUp = (event: PointerEvent) => {
      updateLocalPointer(event, false);
    };

    const handlePointerLeave = (event: PointerEvent) => {
      updateLocalPointer(event, false);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    renderLoop();

    return () => {
      if (simRef.current) {
        cancelAnimationFrame(simRef.current.animationFrameId);
      }
      usePointerStore.getState().clearPointersBySource('local');
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.dispose();
      rtA.dispose();
      rtB.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      fadeMaterial.dispose();
      copyMaterial.dispose();
      particleTexture.dispose();
    };
  }, [enableLocalPointer, state.height, state.seed, state.trailPersistence, state.width]);

  useEffect(() => {
    if (state.imageUrl) {
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = state.width;
        canvas.height = state.height;
        const context = canvas.getContext('2d');
        if (!context || !simRef.current) {
          return;
        }

        context.drawImage(image, 0, 0, state.width, state.height);
        imageCanvasRef.current = canvas;
        simRef.current.cachedImageData = context.getImageData(0, 0, state.width, state.height);
      };
      image.src = state.imageUrl;
      return;
    }

    imageCanvasRef.current = null;
    if (simRef.current) {
      simRef.current.cachedImageData = null;
    }
  }, [state.height, state.imageUrl, state.width]);

  useEffect(() => {
    if (!simRef.current) {
      return;
    }

    simRef.current.noise3D = createNoise3D(mulberry32(state.seed));
    initParticles();
  }, [state.particleCount, state.seed]);

  useEffect(() => {
    if (!simRef.current) {
      return;
    }

    simRef.current.fadeMaterial.uniforms.persistence.value = state.trailPersistence;
    simRef.current.particleMaterial.size = state.particleSize;
  }, [state.particleSize, state.trailPersistence]);

  useEffect(() => {
    if (!state.triggerDownload || !simRef.current) {
      return;
    }

    const link = document.createElement('a');
    link.download = 'luminous-resonance.png';
    link.href = simRef.current.renderer.domElement.toDataURL('image/png');
    link.click();
    state.setTriggerDownload(false);
  }, [state, state.triggerDownload]);

  const initParticles = () => {
    if (!simRef.current) {
      return;
    }

    const { particleCount, width, height, flowSpeed } = state;
    const particles: Particle[] = [];
    const random = mulberry32(state.seed);

    for (let i = 0; i < particleCount; i += 1) {
      const angle = random() * Math.PI * 2;
      const speedMult = random() * 0.5 + 0.5;
      particles.push({
        id: i,
        x: random() * width,
        y: random() * height,
        vx: Math.cos(angle) * flowSpeed * speedMult,
        vy: Math.sin(angle) * flowSpeed * speedMult,
        angle,
        speedMult,
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
    if (!simRef.current) {
      return;
    }

    simRef.current.animationFrameId = requestAnimationFrame(renderLoop);
    if (useAppStore.getState().isPaused) {
      return;
    }

    const sim = simRef.current;
    const currentState = useAppStore.getState();
    const { width, height, flowSpeed, vortexStrength, vortexRange, clickRepulsion, useImageColors, colors } = currentState;
    const activePointers = Object.values(usePointerStore.getState().pointers).filter((pointer) => pointer.isDown);

    sim.time += 0.005;

    const positions = sim.particleGeometry.attributes.position.array as Float32Array;
    const colorArray = sim.particleGeometry.attributes.color.array as Float32Array;
    const imageData = useImageColors && sim.cachedImageData ? sim.cachedImageData : null;
    const parsedColors = colors.map((color) => new THREE.Color(color));

    for (let i = 0; i < sim.particles.length; i += 1) {
      const particle = sim.particles[i];

      for (const pointer of activePointers) {
        const canvasPointer = pointerToCanvasSpace(pointer, width, height);
        const dx = canvasPointer.x - particle.x;
        const dy = canvasPointer.y - particle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < vortexRange && dist > 0) {
          const force = (vortexRange - dist) / vortexRange;
          particle.vx += (dy / dist) * force * vortexStrength;
          particle.vy -= (dx / dist) * force * vortexStrength;
          particle.vx += (dx / dist) * force * clickRepulsion * 0.1;
          particle.vy += (dy / dist) * force * clickRepulsion * 0.1;
        }
      }

      const targetSpeed = (particle.speedMult || 1) * flowSpeed;
      const currentSpeed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);

      if (currentSpeed > targetSpeed) {
        particle.vx *= 0.95;
        particle.vy *= 0.95;
      } else if (currentSpeed < targetSpeed && currentSpeed > 0.001) {
        particle.vx += (particle.vx / currentSpeed) * (targetSpeed - currentSpeed) * 0.05;
        particle.vy += (particle.vy / currentSpeed) * (targetSpeed - currentSpeed) * 0.05;
      } else if (currentSpeed <= 0.001) {
        particle.vx = Math.cos(particle.angle) * targetSpeed;
        particle.vy = Math.sin(particle.angle) * targetSpeed;
      }

      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x <= 0) {
        particle.x = 0;
        particle.vx *= -1;
        particle.angle = Math.atan2(particle.vy, particle.vx);
      } else if (particle.x >= width) {
        particle.x = width;
        particle.vx *= -1;
        particle.angle = Math.atan2(particle.vy, particle.vx);
      }

      if (particle.y <= 0) {
        particle.y = 0;
        particle.vy *= -1;
        particle.angle = Math.atan2(particle.vy, particle.vx);
      } else if (particle.y >= height) {
        particle.y = height;
        particle.vy *= -1;
        particle.angle = Math.atan2(particle.vy, particle.vx);
      }

      positions[i * 3] = (particle.x / width) * 2 - 1;
      positions[i * 3 + 1] = -(particle.y / height) * 2 + 1;
      positions[i * 3 + 2] = 0;

      if (useImageColors && imageData) {
        const ix = Math.floor(particle.x);
        const iy = Math.floor(particle.y);
        if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
          const idx = (iy * width + ix) * 4;
          colorArray[i * 3] = imageData.data[idx] / 255;
          colorArray[i * 3 + 1] = imageData.data[idx + 1] / 255;
          colorArray[i * 3 + 2] = imageData.data[idx + 2] / 255;
        }
      } else {
        const color = parsedColors[particle.colorIndex];
        colorArray[i * 3] = color.r;
        colorArray[i * 3 + 1] = color.g;
        colorArray[i * 3 + 2] = color.b;
      }
    }

    sim.particleGeometry.attributes.position.needsUpdate = true;
    sim.particleGeometry.attributes.color.needsUpdate = true;
    sim.fadeMaterial.uniforms.tDiffuse.value = sim.rtA.texture;
    sim.renderer.setRenderTarget(sim.rtB);
    sim.renderer.render(sim.fadeScene, sim.orthoCamera);
    sim.renderer.autoClear = false;
    sim.renderer.render(sim.particleScene, sim.orthoCamera);
    sim.renderer.autoClear = true;
    sim.copyMaterial.uniforms.tDiffuse.value = sim.rtB.texture;
    sim.renderer.setRenderTarget(null);
    sim.renderer.clear();
    sim.renderer.render(sim.copyScene, sim.orthoCamera);

    const temp = sim.rtA;
    sim.rtA = sim.rtB;
    sim.rtB = temp;
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {state.useImageColors && state.imageUrl && (
        <img
          src={state.imageUrl}
          alt="Background"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ opacity: state.imageOpacity }}
        />
      )}
      <div ref={containerRef} className="relative z-10 flex h-full w-full items-center justify-center" />
    </div>
  );
};
