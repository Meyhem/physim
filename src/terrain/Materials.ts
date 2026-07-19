export enum MaterialType {
  DIRT = 'dirt',
  SANDSTONE = 'sandstone',
  GRANITE = 'granite',
  IRON_ORE = 'iron_ore',
  COPPER_ORE = 'copper_ore',
  GOLD_ORE = 'gold_ore'
}

export interface MaterialProperties {
  id: MaterialType;
  name: string;
  color: number; // PixiJS hex color
  density: number; // Physics density multiplier
}

export const Materials: Record<MaterialType, MaterialProperties> = {
  [MaterialType.DIRT]: {
    id: MaterialType.DIRT,
    name: 'Topsoil',
    color: 0x5C4033, // Earth brown
    density: 0.8,
  },
  [MaterialType.SANDSTONE]: {
    id: MaterialType.SANDSTONE,
    name: 'Sandstone',
    color: 0xD2B48C, // Tan
    density: 1.0,
  },
  [MaterialType.GRANITE]: {
    id: MaterialType.GRANITE,
    name: 'Granite',
    color: 0x808080, // Dark grey
    density: 1.5,
  },
  [MaterialType.IRON_ORE]: {
    id: MaterialType.IRON_ORE,
    name: 'Iron Ore',
    color: 0x8B0000, // Rusty red-brown
    density: 2.5,
  },
  [MaterialType.COPPER_ORE]: {
    id: MaterialType.COPPER_ORE,
    name: 'Copper Ore',
    color: 0x008B8B, // Teal/green-blue
    density: 2.2,
  },
  [MaterialType.GOLD_ORE]: {
    id: MaterialType.GOLD_ORE,
    name: 'Gold Ore',
    color: 0xDAA520, // Goldenrod yellow
    density: 3.5,
  },
};
