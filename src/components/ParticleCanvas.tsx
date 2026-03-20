import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { useAppStore } from '../store';

function resolveSyncWsUrl(): string | null {
  const s = useAppStore.getState();
  const envBase = (import.meta.env.VITE_SYNC_WS_BASE as string | undefined)?.trim() ?? '';
  const override = (s.syncWsBaseUrl || envBase).trim();
  if (override) {
    return override.replace(/\/$/, '');
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:8081`;
}

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

  const [wsConnected, setWsConnected] = useState(false);
  const [wsDiag, setWsDiag] = useState<string>('');
  const syncRole = useAppStore((s) => s.syncRole);
  const roomId = useAppStore((s) => s.roomId);
  const syncWsBaseUrl = useAppStore((s) => s.syncWsBaseUrl);

  // Refs for mutable state that shouldn't trigger re-renders
  const simRef = useRef<any>(null);
  // Multi-pointer input state (key: `${clientId}:${pointerId}`)
  const pointersRef = useRef<Record<string, { x: number; y: number; isDown: boolean }>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>('');
  const suppressBroadcastRef = useRef<boolean>(false);
  const lastPointerSendAtRef = useRef<number>(0);
  const lastParamsSendAtRef = useRef<number>(0);

  // pointerId 生成（兼容没有 crypto.randomUUID 的环境）
  if (!clientIdRef.current) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientIdRef.current = (crypto as any)?.randomUUID?.() || String(Math.random()).slice(2);
    } catch {
      clientIdRef.current = String(Math.random()).slice(2);
    }
  }
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 单机模式：不建立 WebSocket（本地 pointer 仍工作）
    if (syncRole === 'standalone') {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
      setWsConnected(false);
      setWsDiag('单机模式（未连接同步）');
      return;
    }

    const rid = roomId.trim();
    if (!rid) {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
      setWsConnected(false);
      setWsDiag('请设置房间 ID（PAD 与电脑需一致）');
      return;
    }

    const wsUrl = resolveSyncWsUrl();
    if (!wsUrl) {
      setWsConnected(false);
      setWsDiag('无法解析同步服务地址');
      return;
    }

    setWsDiag(`连接中: ${wsUrl} · room=${rid} · ${syncRole}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      setWsDiag(`Sync ON: ${wsUrl} · room=${rid} · ${syncRole}`);
      try {
        ws.send(JSON.stringify({ type: 'sync-join', roomId: rid }));

        ws.send(
          JSON.stringify({
            type: 'particle-sync',
            action: 'hello',
            data: { clientId: clientIdRef.current, role: syncRole },
            originId: clientIdRef.current,
            source: syncRole,
          }),
        );

        const s = useAppStore.getState();
        const params = {
          resolution: s.resolution,
          width: s.width,
          height: s.height,
          seed: s.seed,
          particleCount: s.particleCount,
          flowSpeed: s.flowSpeed,
          noiseScale: s.noiseScale,
          trailPersistence: s.trailPersistence,
          vortexStrength: s.vortexStrength,
          vortexRange: s.vortexRange,
          clickRepulsion: s.clickRepulsion,
          particleSize: s.particleSize,
          colors: s.colors,
          useImageColors: s.useImageColors,
          imageOpacity: s.imageOpacity,
        };
        ws.send(
          JSON.stringify({
            type: 'particle-sync',
            action: 'params',
            data: params,
            originId: clientIdRef.current,
            source: syncRole,
          }),
        );
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type !== 'particle-sync') return;
        const originId = msg?.originId;

        if (originId && originId === clientIdRef.current) {
          return;
        }

        if (msg.action === 'params' && msg.data) {
          suppressBroadcastRef.current = true;
          useAppStore.getState().setAppState(msg.data);
          window.setTimeout(() => {
            suppressBroadcastRef.current = false;
          }, 50);
          return;
        }

        if (msg.action === 'pointer' && msg.data) {
          const data = msg.data as {
            nx?: number;
            ny?: number;
            x?: number;
            y?: number;
            isDown?: boolean;
            pointerId?: string;
          };
          const dims = useAppStore.getState();
          let x: number;
          let y: number;
          if (typeof data.nx === 'number' && typeof data.ny === 'number') {
            x = data.nx * dims.width;
            y = data.ny * dims.height;
          } else if (typeof data.x === 'number' && typeof data.y === 'number') {
            x = data.x;
            y = data.y;
          } else {
            return;
          }
          const key = `${originId || 'remote'}:${data.pointerId ?? 'mouse'}`;
          pointersRef.current[key] = { x, y, isDown: Boolean(data.isDown) };
          return;
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
      setWsDiag(`Sync OFF (error): ${wsUrl}`);
    };

    ws.onclose = () => {
      setWsConnected(false);
      setWsDiag(`Sync OFF (close): ${wsUrl}`);
    };

    return () => {
      try {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [syncRole, roomId, syncWsBaseUrl]);

  useEffect(() => {
    // 监听粒子参数变化并广播给其他客户端
    const unsubscribe = useAppStore.subscribe((newState, prevState) => {
      if (suppressBroadcastRef.current) return;
      if (newState.syncRole === 'standalone') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const now = Date.now();
      if (now - lastParamsSendAtRef.current < 80) return; // throttle

      // 只广播会影响外观/运动的参数子集
      const params = {
        resolution: newState.resolution,
        width: newState.width,
        height: newState.height,
        seed: newState.seed,
        particleCount: newState.particleCount,
        flowSpeed: newState.flowSpeed,
        noiseScale: newState.noiseScale,
        trailPersistence: newState.trailPersistence,
        vortexStrength: newState.vortexStrength,
        vortexRange: newState.vortexRange,
        clickRepulsion: newState.clickRepulsion,
        particleSize: newState.particleSize,
        // 颜色相关（如果你也需要可同步）
        colors: newState.colors,
        useImageColors: newState.useImageColors,
        imageOpacity: newState.imageOpacity,
      };

      // 粗略判断：避免和 prevState 无任何变化时广播
      const prev = prevState as any;
      const changed = Object.keys(params).some((k) => (params as any)[k] !== (prev as any)[k]);
      if (!changed) return;

      ws.send(
        JSON.stringify({
          type: 'particle-sync',
          action: 'params',
          data: params,
          originId: clientIdRef.current,
          source: newState.syncRole,
        }),
      );
      lastParamsSendAtRef.current = now;
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.setSize(state.width, state.height, false);
    // Prevent the browser from handling touch gestures (scroll/pinch) over the canvas.
    renderer.domElement.style.touchAction = 'none';
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

    // Event Listeners（坐标：相对 canvas 包围盒归一化到 [0,1]，线上只传 nx/ny）
    const setLocalPointer = (pointerId: string, clientX: number, clientY: number, isDown: boolean) => {
      const app = useAppStore.getState();
      if (app.syncRole === 'display') {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const rw = Math.max(1e-6, rect.width);
      const rh = Math.max(1e-6, rect.height);
      const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rw));
      const ny = Math.min(1, Math.max(0, (clientY - rect.top) / rh));

      const x = nx * app.width;
      const y = ny * app.height;
      const key = `${clientIdRef.current}:${pointerId}`;
      const prev = pointersRef.current[key];
      pointersRef.current[key] = { x, y, isDown };

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (app.syncRole !== 'controller') return;

      const now = Date.now();
      const isDownChanged = prev ? prev.isDown !== isDown : isDown;
      const shouldSend = isDownChanged || now - lastPointerSendAtRef.current >= 33;
      if (!shouldSend) return;

      ws.send(
        JSON.stringify({
          type: 'particle-sync',
          action: 'pointer',
          originId: clientIdRef.current,
          source: 'controller',
          data: { nx, ny, isDown, pointerId },
        }),
      );
      lastPointerSendAtRef.current = now;
    };

    // Mouse (desktop)
    const handleMouseMove = (e: MouseEvent) => {
      const key = `${clientIdRef.current}:mouse`;
      const current = pointersRef.current[key];
      setLocalPointer('mouse', e.clientX, e.clientY, current?.isDown ?? false);
    };
    const handleMouseDown = (e: MouseEvent) => {
      setLocalPointer('mouse', e.clientX, e.clientY, true);
    };
    const handleMouseUp = (e: MouseEvent) => {
      setLocalPointer('mouse', e.clientX, e.clientY, false);
    };
    const handleMouseLeave = () => {
      const app = useAppStore.getState();
      if (app.syncRole === 'display') return;

      const key = `${clientIdRef.current}:mouse`;
      const current = pointersRef.current[key];
      const x = current?.x ?? -1000;
      const y = current?.y ?? -1000;
      pointersRef.current[key] = { x, y, isDown: false };

      if (app.syncRole !== 'controller') return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const nx = current
          ? Math.min(1, Math.max(0, current.x / Math.max(1, app.width)))
          : 0;
        const ny = current
          ? Math.min(1, Math.max(0, current.y / Math.max(1, app.height)))
          : 0;
        ws.send(
          JSON.stringify({
            type: 'particle-sync',
            action: 'pointer',
            originId: clientIdRef.current,
            source: 'controller',
            data: { nx, ny, isDown: false, pointerId: 'mouse' },
          }),
        );
        lastPointerSendAtRef.current = Date.now();
      }
    };

    // Pointer Events (covers touch + pen + mouse in modern browsers)
    const handlePointerMove = (e: PointerEvent) => {
      const pid = String(e.pointerId ?? 'pointer');
      const key = `${clientIdRef.current}:${pid}`;
      const current = pointersRef.current[key];
      setLocalPointer(pid, e.clientX, e.clientY, current?.isDown ?? false);
    };
    const handlePointerDown = (e: PointerEvent) => {
      const pid = String(e.pointerId ?? 'pointer');
      setLocalPointer(pid, e.clientX, e.clientY, true);
      // Keep receiving events even if the pointer leaves the element briefly.
      try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    };
    const handlePointerUp = (e: PointerEvent) => {
      const pid = String(e.pointerId ?? 'pointer');
      setLocalPointer(pid, e.clientX, e.clientY, false);
    };
    const handlePointerLeave = () => {
      const app = useAppStore.getState();
      if (app.syncRole === 'display') return;

      const cid = clientIdRef.current;
      for (const k of Object.keys(pointersRef.current)) {
        if (k.startsWith(`${cid}:`)) {
          const pt = pointersRef.current[k];
          pointersRef.current[k] = { ...pt, isDown: false };
          const pointerId = k.split(':')[1] ?? 'pointer';
          if (app.syncRole !== 'controller') continue;
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            const nx = Math.min(1, Math.max(0, pt.x / Math.max(1, app.width)));
            const ny = Math.min(1, Math.max(0, pt.y / Math.max(1, app.height)));
            ws.send(
              JSON.stringify({
                type: 'particle-sync',
                action: 'pointer',
                originId: clientIdRef.current,
                source: 'controller',
                data: { nx, ny, isDown: false, pointerId },
              }),
            );
            lastPointerSendAtRef.current = Date.now();
          }
        }
      }
    };

    // Touch fallback (in case pointer events are not supported on the PAD browser)
    const handleTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      setLocalPointer('touch0', t.clientX, t.clientY, pointersRef.current[`${clientIdRef.current}:touch0`]?.isDown ?? false);
    };
    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      setLocalPointer('touch0', t.clientX, t.clientY, true);
      // Prevent browser scroll while interacting with the particle field.
      e.preventDefault();
    };
    const handleTouchEnd = () => {
      const key = `${clientIdRef.current}:touch0`;
      const current = pointersRef.current[key];
      pointersRef.current[key] = { x: current?.x ?? -1000, y: current?.y ?? -1000, isDown: false };
    };

    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('mouseleave', handleMouseLeave);

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchend', handleTouchEnd);
    renderer.domElement.addEventListener('touchcancel', handleTouchEnd);

    // Start loop
    renderLoop();

    return () => {
      cancelAnimationFrame(simRef.current.animationFrameId);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave);

      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);

      renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.domElement.removeEventListener('touchend', handleTouchEnd);
      renderer.domElement.removeEventListener('touchcancel', handleTouchEnd);
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
    // dt 用于尽量减少不同设备 FPS 导致的状态漂移
    const now = performance.now();
    const lastTs = sim.lastTs ?? now;
    const dt = Math.min(2, Math.max(0.25, (now - lastTs) / 16.6667));
    sim.lastTs = now;

    sim.time += 0.005 * dt;

    const positions = sim.particleGeometry.attributes.position.array as Float32Array;
    const colorArray = sim.particleGeometry.attributes.color.array as Float32Array;

    let imageData: ImageData | null = null;
    if (useImageColors && sim.cachedImageData) {
      imageData = sim.cachedImageData;
    }

    const parsedColors = colors.map(c => new THREE.Color(c));

    // 同时来自多设备/多触点的输入点
    const activePointers = Object.values(pointersRef.current).filter(
      (pt): pt is { x: number; y: number; isDown: boolean } =>
        Boolean(pt && typeof pt === 'object' && (pt as { isDown?: boolean }).isDown),
    );

    for (let i = 0; i < sim.particles.length; i++) {
      const p = sim.particles[i];

      // Vortex on click
      for (const pt of activePointers) {
        const dx = pt.x - p.x;
        const dy = pt.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < vortexRange && dist > 0) {
          const force = (vortexRange - dist) / vortexRange;

          // Vortex (perpendicular)
          p.vx += (dy / dist) * force * vortexStrength * dt;
          p.vy -= (dx / dist) * force * vortexStrength * dt;

          // Inward attraction to form a cohesive swirling vortex
          p.vx += (dx / dist) * force * clickRepulsion * 0.1 * dt;
          p.vy += (dy / dist) * force * clickRepulsion * 0.1 * dt;
        }
      }

      // Speed regulation
      const targetSpeed = (p.speedMult || 1) * flowSpeed;
      const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      
      if (currentSpeed > targetSpeed) {
        // Dampen excess speed from vortex
        const damp = Math.pow(0.95, dt);
        p.vx *= damp;
        p.vy *= damp;
      } else if (currentSpeed < targetSpeed && currentSpeed > 0.001) {
        // Accelerate back to base speed smoothly
        p.vx += (p.vx / currentSpeed) * (targetSpeed - currentSpeed) * 0.05 * dt;
        p.vy += (p.vy / currentSpeed) * (targetSpeed - currentSpeed) * 0.05 * dt;
      } else if (currentSpeed <= 0.001) {
        p.vx = Math.cos(p.angle) * targetSpeed;
        p.vy = Math.sin(p.angle) * targetSpeed;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

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
      <div
        className="absolute top-16 right-3 z-[9999] px-3 py-1 text-[11px] leading-tight rounded bg-black/70 border border-white/20 text-white pointer-events-none"
      >
        <div>
          {syncRole === 'standalone' ? '单机' : syncRole === 'controller' ? '控制端 PAD' : '显示端 PC'} · Sync{' '}
          {syncRole === 'standalone' ? '—' : wsConnected ? 'ON' : 'OFF'}
        </div>
        {syncRole !== 'standalone' && roomId ? (
          <div className="opacity-90">room: {roomId}</div>
        ) : null}
        {wsDiag ? <div className="opacity-90">{wsDiag}</div> : null}
      </div>
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
