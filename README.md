# 2D Physics-Simulated Mining & Ore Processing Sandbox

A web-based 2D physical sandbox game focused on destructible terrain mining, ore sorting, crushing, smelting, and automated logistics. Built using **Vite**, **TypeScript**, **PixiJS (v8)** for WebGL graphic rendering, and **Matter.js** for 2D rigid-body physics.

---

## 🚀 Quick Start

### 1. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 2. Run Locally (Development Server)
Launch the local dev server:
```bash
npm run dev
```

### 3. Production Build
Compile TypeScript and bundle code for production:
```bash
npm run build
```

---

## 🎮 Game Controls & Interface

### 🎥 Camera Movement
*   **Pan Map**: Use `WASD` keys or **Right-Click Drag** the mouse.
*   **Zoom**: Scroll the **Mouse Wheel** (zooms dynamically centered around your cursor).
*   **Rotate Buildings**: Press `Q` and `E` keys when holding a building ghost.

### 🖐 Toolbar Tools
1.  **Grab & Move**: Click and drag any dynamic shards, ingots, or custom shapes with your mouse.
2.  **Buildings**:
    *   **Crusher**: Funnels dynamic ores into vibrating jaws to break them into smaller crushed shards.
    *   **Furnace**: Smelts crushed shards into refined products (Ingots / Bricks) and physically ejects them.
4.  **Custom Shape Tool**:
    *   `➕ Draw New Tool`: Opens a blueprint canvas to draw custom paths.
    *   Select **Solid Wall** to draw rigid structures (e.g. buckets, scoops, funnels).
    *   Select **Conveyor Belt** to draw paths that physically accelerate objects placed on them.

### ⏱ Speed HUD (Top-Right)
*   `⏸`: Pause physics loop (Shortcut: `Space`).
*   `1x`: Normal speed (Shortcut: `1`).
*   `2x`: Fast forward (Shortcut: `2`).
*   `4x`: Super fast forward (Shortcut: `3`).

### 📂 Save & Escape Menu (`Escape`)
Press `Escape` to toggle the system operations menu:
*   **Save Game**: 5 manual slots to write the entire world state to IndexedDB.
*   **Load Game**: Restore any previously saved world state.
*   **Restart World**: Wipes the current level and restarts.
*   **Autosave**: Automatically saves progress to a rolling buffer keeping the last 5 saves (every 5 minutes).

---

## 🧱 Processing Recipes
Drop crushed ore pieces into the Furnace:
*   **Iron Ore (Crushed)** $\rightarrow$ **Iron Ingot**
*   **Copper Ore (Crushed)** $\rightarrow$ **Copper Ingot**
*   **Gold Ore (Crushed)** $\rightarrow$ **Gold Ingot**
*   **Sandstone / Granite (Crushed)** $\rightarrow$ **Slate Brick**
*   **Dirt (Crushed)** $\rightarrow$ *Burns away*

---

## 📂 Project Architecture

```
physim/
├── src/
│   ├── core/              # Game loop, Camera, Keyboard/Mouse input
│   ├── physics/           # Matter.js initialization, Voronoi fracture, Polygon clipping
│   ├── terrain/           # Procedural noise generation, Material parameters
│   ├── buildings/         # Crusher and Furnace base logic
│   ├── tools/             # Explosives paint, Custom shape instances
│   ├── rendering/         # PixiJS viewport structures, dynamic render loops
│   ├── save/              # Promise-based IndexedDB serializers
│   └── ui/                # HTML/CSS UI Overlays, Canvas drawing popup
├── index.html             # Document root layout
└── tsconfig.json          # TypeScript config (verbatimModuleSyntax enabled)
```
