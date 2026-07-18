# TypeScript Type-Only Imports Rule

Strict rule for managing TypeScript imports under `verbatimModuleSyntax`.

## Context
Our Vite/TypeScript configuration enforces type-erasure compile check validations. Standard runtime imports of non-class interfaces cause compilation aborts.

## Requirements
*   Always import interfaces, type aliases, and custom signatures using `import type`.
    *   **Incorrect**: `import { Point2D } from './PolygonUtils.ts';`
    *   **Correct**: `import type { Point2D } from './PolygonUtils.ts';`
*   If both classes and types are imported from the same module, split them or use inline `type` specifiers:
    *   `import { ClassA, type InterfaceB } from './Module.ts';`
