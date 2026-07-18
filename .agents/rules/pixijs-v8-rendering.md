# PixiJS v8 Graphics Rendering Rule

Rule preventing usage of legacy canvas transformations on PixiJS Graphics objects.

## Context
PixiJS v8 `Graphics` instances do not inherit canvas-like state machine transformations. Method signatures like `save()`, `restore()`, `translate()`, and `rotate()` are undefined.

## Requirements
*   Do **NOT** use `graphics.save()`, `graphics.restore()`, `graphics.translate()`, or `graphics.rotate()`.
*   To rotate drawn shapes relative to a pivot:
    1.  **Trigonometric math**: Calculate rotated vertex points in local space using cos/sin vectors:
        $$x' = x \cos(\theta) - y \sin(\theta)$$
        $$y' = x \sin(\theta) + y \cos(\theta)$$
    2.  **Container hierarchies**: Create a `Container` instance, set container `rotation`/`position`, and append a pre-drawn `Graphics` child.
