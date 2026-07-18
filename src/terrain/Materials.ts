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
  fractureResistance: number; // Impulse force needed to break
  shardCount: number; // Base number of shards generated on fracture
  processedInto: {
    crushed: string;
    product: string;
    productColor: number;
  };
}

export const Materials: Record<MaterialType, MaterialProperties> = {
  [MaterialType.DIRT]: {
    id: MaterialType.DIRT,
    name: 'Topsoil',
    color: 0x5C4033, // Earth brown
    density: 0.8,
    fractureResistance: 2,
    shardCount: 4,
    processedInto: {
      crushed: 'crushed_dirt',
      product: 'Brick',
      productColor: 0x8B4513 // Brick red
    }
  },
  [MaterialType.SANDSTONE]: {
    id: MaterialType.SANDSTONE,
    name: 'Sandstone',
    color: 0xD2B48C, // Tan
    density: 1.0,
    fractureResistance: 3,
    shardCount: 5,
    processedInto: {
      crushed: 'crushed_sandstone',
      product: 'Glass Block',
      productColor: 0xE0EEEE // Glassy blue-white
    }
  },
  [MaterialType.GRANITE]: {
    id: MaterialType.GRANITE,
    name: 'Granite',
    color: 0x808080, // Dark grey
    density: 1.5,
    fractureResistance: 8,
    shardCount: 6,
    processedInto: {
      crushed: 'crushed_granite',
      product: 'Stone Block',
      productColor: 0x696969 // Dim grey
    }
  },
  [MaterialType.IRON_ORE]: {
    id: MaterialType.IRON_ORE,
    name: 'Iron Ore',
    color: 0x8B0000, // Rusty red-brown
    density: 2.5,
    fractureResistance: 12,
    shardCount: 8,
    processedInto: {
      crushed: 'crushed_iron_ore',
      product: 'Iron Ingot',
      productColor: 0xC0C0C0 // Silver
    }
  },
  [MaterialType.COPPER_ORE]: {
    id: MaterialType.COPPER_ORE,
    name: 'Copper Ore',
    color: 0x008B8B, // Teal/green-blue
    density: 2.2,
    fractureResistance: 10,
    shardCount: 8,
    processedInto: {
      crushed: 'crushed_copper_ore',
      product: 'Copper Ingot',
      productColor: 0xB87333 // Copper orange-brown
    }
  },
  [MaterialType.GOLD_ORE]: {
    id: MaterialType.GOLD_ORE,
    name: 'Gold Ore',
    color: 0xDAA520, // Goldenrod yellow
    density: 3.5,
    fractureResistance: 15,
    shardCount: 10,
    processedInto: {
      crushed: 'crushed_gold_ore',
      product: 'Gold Ingot',
      productColor: 0xFFD700 // Bright gold yellow
    }
  }
};
