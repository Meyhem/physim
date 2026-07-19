import type { Graphics } from 'pixi.js';
import { Building } from './Building.ts';
import { Crusher } from './Crusher.ts';
import { Furnace } from './Furnace.ts';
import { Miner } from './Miner.ts';
import { CustomShape } from './CustomShape.ts';
import type { CustomShapeDef } from './CustomShape.ts';
import { getPolygonsBounds } from './CustomShape.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import { MaterialType } from '../terrain/Materials.ts';

export interface GhostBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Context handed to a definition's `create` so it can resolve environment
 * dependencies (terrain sampling, custom-shape defs) without each call site
 * re-implementing per-type construction logic.
 */
export interface BuildingCreateContext {
  terrainManager: TerrainManager;
  customShapeDefs: CustomShapeDef[];
  /**
   * Optional saved material for Miner. Omitted → sample from the terrain
   * directly beneath the placement position (used for live placement).
   */
  minerMaterialType?: MaterialType;
}

/** Optional toolbar presentation metadata for static building types. */
export interface BuildingToolbarInfo {
  icon: string;
  label: string;
  tooltip: string;
}

/**
 * Data-driven description of a buildable type. Adding a new building type now
 * means adding one entry here (or one CustomShapeDef at runtime) instead of
 * editing a string-switch in every manager/renderer.
 */
export interface BuildingDefinition {
  type: string;
  /** Construct an instance at a world position. */
  create: (id: string, x: number, y: number, ctx: BuildingCreateContext) => Building;
  /** Draw the placement ghost in local space. */
  drawGhost: (g: Graphics, color: number) => void;
  /** World-space AABB of the ghost given a center position. */
  ghostBounds: (x: number, y: number) => GhostBounds;
  /** Toolbar button metadata (static types only). */
  toolbar?: BuildingToolbarInfo;
}

/** Default fallback footprint when a custom def has no geometry yet. */
const DEFAULT_HALF = 40;

function centeredBounds(x: number, y: number, width: number, height: number): GhostBounds {
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - height / 2,
    maxY: y + height / 2,
  };
}

/**
 * Registry of buildable types. Static types (crusher/furnace/miner) are known
 * at module load; custom shapes are resolved dynamically from their defs.
 */
export class BuildingRegistry {
  private staticDefs: Map<string, BuildingDefinition> = new Map();

  constructor() {
    this.register({
      type: 'crusher',
      create: (id, x, y) => new Crusher(id, x, y),
      drawGhost: (g, color) => Crusher.drawGhost(g, color),
      ghostBounds: (x, y) => centeredBounds(x, y, Crusher.WIDTH, Crusher.HEIGHT),
      toolbar: { icon: '⚙️', label: 'Crusher', tooltip: 'Drag to place a Crusher. Q/E to rotate.' },
    });

    this.register({
      type: 'furnace',
      create: (id, x, y) => new Furnace(id, x, y),
      drawGhost: (g, color) => Furnace.drawGhost(g, color),
      ghostBounds: (x, y) => centeredBounds(x, y, Furnace.WIDTH, Furnace.HEIGHT),
      toolbar: { icon: '🔥', label: 'Furnace', tooltip: 'Drag to place a Furnace. Q/E to rotate.' },
    });

    this.register({
      type: 'miner',
      create: (id, x, y, ctx) => {
        const mat = ctx.minerMaterialType
          ?? ctx.terrainManager.getMaterialBelow(x, y)?.materialType
          ?? MaterialType.DIRT;
        return new Miner(id, x, y, ctx.terrainManager, mat);
      },
      drawGhost: (g, color) => Miner.drawGhost(g, color),
      ghostBounds: (x, y) => centeredBounds(x, y, Miner.WIDTH, Miner.HEIGHT),
      toolbar: {
        icon: '⛏️',
        label: 'Miner',
        tooltip: 'Drag to place a Miner. Mines the terrain it is mounted on. Q/E to rotate.',
      },
    });
  }

  private register(def: BuildingDefinition): void {
    this.staticDefs.set(def.type, def);
  }

  /** Static definition for a known building type, or null for custom shapes. */
  public get(type: string): BuildingDefinition | null {
    return this.staticDefs.get(type) ?? null;
  }

  /** All statically-registered building types (for toolbar generation). */
  public listStatic(): BuildingDefinition[] {
    return Array.from(this.staticDefs.values());
  }

  /**
   * A BuildingDefinition view over a custom-shape def. The def is captured in
   * the closures so callers can treat custom and static types uniformly.
   */
  public forCustomShape(def: CustomShapeDef): BuildingDefinition {
    return {
      type: def.id,
      create: (id, x, y) => new CustomShape(id, def, x, y),
      drawGhost: (g, color) => CustomShape.drawGhostForDef(g, def, color),
      ghostBounds: (x, y) => {
        if (def.polygons && def.polygons.length > 0) {
          const b = getPolygonsBounds(def.polygons);
          return {
            minX: x + b.minX,
            maxX: x + b.maxX,
            minY: y + b.minY,
            maxY: y + b.maxY,
          };
        }
        return centeredBounds(x, y, DEFAULT_HALF * 2, DEFAULT_HALF * 2);
      },
    };
  }

  /**
   * Resolve any placement type string (a static building type or a custom-shape
   * def id) to a definition, or null if unknown.
   */
  public resolve(type: string, customShapeDefs: CustomShapeDef[]): BuildingDefinition | null {
    const staticDef = this.get(type);
    if (staticDef) return staticDef;
    const def = customShapeDefs.find(d => d.id === type);
    return def ? this.forCustomShape(def) : null;
  }
}
