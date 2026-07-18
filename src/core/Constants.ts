export const PIXELS_PER_METER = 100; // 1px = 1cm, 100px = 1m

export const WORLD_WIDTH_METERS = 500;
export const WORLD_HEIGHT_METERS = 200;

export const WORLD_WIDTH = WORLD_WIDTH_METERS * PIXELS_PER_METER; // 50,000 px
export const WORLD_HEIGHT = WORLD_HEIGHT_METERS * PIXELS_PER_METER; // 20,000 px

export const VIEWPORT_DEFAULT_WIDTH = 1200;
export const VIEWPORT_DEFAULT_HEIGHT = 800;

// Matter.js collision categories (bitmasks)
export const CollisionCategories = {
  DEFAULT: 0x0001,
  TERRAIN: 0x0002,
  SHARDS: 0x0004,
  BUILDINGS: 0x0008,
  TOOLS: 0x0010,
  EXPLOSIVES: 0x0020
};
