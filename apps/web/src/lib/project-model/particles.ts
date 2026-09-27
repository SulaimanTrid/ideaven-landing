import type { PropsMap } from "@/types/project";

/**
 * Particle system core (SYSTEM 18): the ONE particle simulation, shared by
 * the scene runtime, the editor preview, and (mirrored in vanilla JS) the
 * export engine. Authored configuration comes from the canonical model;
 * particle instances are RUNTIME-ONLY state that never touches the model.
 *
 * Deterministic and dt-based: continuous emission uses an accumulator
 * (fractional emission carries across frames — no drift), particles age by
 * elapsed seconds, size/opacity interpolate start→end over the lifetime, and
 * every array is bounded by the emitter's maxParticles (hard cap 1000).
 */

export interface ParticleEmitterConfig {
  enabled: boolean;
  /** Particles per second (continuous emission). */
  emissionRate: number;
  lifetime: number;
  speed: number;
  /** Emission direction in degrees; 0 = up, positive = clockwise. */
  direction: number;
  /** Cone half-angle in degrees (0 = a beam, 180 = all directions). */
  spread: number;
  startSize: number;
  endSize: number;
  startOpacity: number;
  endOpacity: number;
  gravity: number;
  color: string;
  maxParticles: number;
  /** Loop = continuous emission; a one-shot emits for one lifetime window
   * and then stops until restarted/re-burst. */
  loop: boolean;
  /** Particles spawned by one burst command. */
  burstCount: number;
  /** Optional asset ref ("asset:<id>" or URL) — absent = colored circle. */
  texture: string;
}

export interface ParticleInstance {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  startSize: number;
  endSize: number;
  startOpacity: number;
  endOpacity: number;
  color: string;
  texture: string;
}

export const PARTICLE_LIMITS = {
  /** Hard cap on active particles per emitter, regardless of config. */
  maxParticles: 1000,
  maxEmitters: 8,
  emissionRate: 500,
  lifetime: 30,
  speed: 2000,
  size: 500,
  gravity: 2000,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const num = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parses an emitter's props into a safe, clamped configuration. */
export function parseEmitter(props: PropsMap | undefined): ParticleEmitterConfig {
  const maxParticles = Math.round(clamp(num(props?.maxParticles, 120), 1, PARTICLE_LIMITS.maxParticles));
  return {
    enabled: props?.enabled !== false,
    emissionRate: clamp(num(props?.emissionRate, 20), 0, PARTICLE_LIMITS.emissionRate),
    lifetime: clamp(num(props?.lifetime, 1), 0.05, PARTICLE_LIMITS.lifetime),
    speed: clamp(num(props?.speed, 80), 0, PARTICLE_LIMITS.speed),
    direction: clamp(num(props?.direction, 0), -3600, 3600),
    spread: clamp(num(props?.spread, 30), 0, 360),
    startSize: clamp(num(props?.startSize, 8), 0, PARTICLE_LIMITS.size),
    endSize: clamp(num(props?.endSize, 2), 0, PARTICLE_LIMITS.size),
    startOpacity: clamp(num(props?.startOpacity, 1), 0, 1),
    endOpacity: clamp(num(props?.endOpacity, 0), 0, 1),
    gravity: clamp(num(props?.gravity, 0), -PARTICLE_LIMITS.gravity, PARTICLE_LIMITS.gravity),
    color: typeof props?.color === "string" && HEX_COLOR.test(props.color.trim()) ? props.color.trim() : "#ffd9a0",
    maxParticles,
    loop: props?.loop !== false,
    burstCount: Math.round(clamp(num(props?.burstCount, 0), 0, maxParticles)),
    texture: typeof props?.texture === "string" && props.texture.trim() !== "" ? props.texture.trim() : "",
  };
}

/**
 * Bounded simulation for ONE emitter. Instances are pooled: expired slots
 * are reused, and spawning stops at maxParticles — arrays never grow beyond
 * the configured bound.
 */
export class ParticleSim {
  readonly particles: ParticleInstance[] = [];
  private accumulator = 0;
  private oneShotEmitted = false;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.round(capacity));
  }

  get count(): number {
    return this.particles.length;
  }

  private spawn(config: ParticleEmitterConfig, cx: number, cy: number): void {
    if (this.particles.length >= Math.min(config.maxParticles, this.capacity)) return;
    // direction: 0° = up, clockwise; spread defines a symmetric cone.
    const half = (config.spread / 2) * (Math.PI / 180);
    const angle = (config.direction * Math.PI) / 180 + (Math.random() * 2 - 1) * half;
    const speed = config.speed;
    this.particles.push({
      x: cx,
      y: cy,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      age: 0,
      lifetime: config.lifetime,
      startSize: config.startSize,
      endSize: config.endSize,
      startOpacity: config.startOpacity,
      endOpacity: config.endOpacity,
      color: config.color,
      texture: config.texture,
    });
  }

  /** Queue a burst (block path): spawns immediately, bounded by capacity. */
  burst(config: ParticleEmitterConfig, cx: number, cy: number, count: number): void {
    const bounded = Math.round(clamp(count, 0, config.maxParticles));
    for (let i = 0; i < bounded; i++) this.spawn(config, cx, cy);
  }

  /**
   * Advance one frame. Continuous emission uses the accumulator: fractional
   * emission carries across frames (no drift). loop=false emits for one
   * lifetime window and then stops until restarted (clear). Every particle
   * ages, feels gravity, and is recycle-removed at age >= lifetime — swap-
   * remove keeps the array bounded and dense.
   */
  step(config: ParticleEmitterConfig, dt: number, cx: number, cy: number): void {
    const emitting = config.enabled && (config.loop || this.window < config.lifetime);
    if (emitting && config.emissionRate > 0) {
      this.window += dt;
      this.accumulator += dt * config.emissionRate;
      while (this.accumulator >= 1) {
        this.spawn(config, cx, cy);
        this.accumulator -= 1;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]!;
      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        const last = this.particles.pop()!;
        if (i < this.particles.length) this.particles[i] = last;
        continue;
      }
      particle.vy += config.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  /** Emission-window seconds accumulated for one-shot emitters. */
  private window = 0;

  clear(): void {
    this.particles.length = 0;
    this.accumulator = 0;
    this.window = 0;
  }

  /** Interpolated size/opacity for rendering one particle (0..1 age fraction). */
  static frame(particle: ParticleInstance): { size: number; opacity: number } {
    const t = particle.lifetime > 0 ? Math.min(particle.age / particle.lifetime, 1) : 1;
    return {
      size: particle.startSize + (particle.endSize - particle.startSize) * t,
      opacity: particle.startOpacity + (particle.endOpacity - particle.startOpacity) * t,
    };
  }
}