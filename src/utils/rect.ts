/**
 * A simple rectangular class optimized for minimal branching.
 */
export class Rect {
    /**
     * Gets if the rect is still empty and doesn't contain any area.
     */
    public empty: boolean = true;

    /**
     * Gets the x coordinate of the rectangular area if not empty.
     */
    public x: number = 0;

    /**
     * Gets the y coordinate of the rectangular area if not empty.
     */
    public y: number = 0;

    /**
     * Gets the width of the rectangular area if not empty.
     */
    public width: number = 0;

    /**
     * Gets the height of the rectangular area if not empty.
     */
    public height: number = 0;

    /**
     * Clears the rectangular.
     */
    public reset(): void {
        this.empty = true;
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
    }

    /**
     * Sets the rectangular area directly.
     * @param x The x coordinate of the new area.
     * @param y The y coordinate of the new area.
     * @param width The width of the new area. Negative values are not supported.
     * @param height The height of the new area. Negative values are not supported.
     */
    public set(x: number, y: number, width: number = 0, height: number = 0): void {
        this.empty = false;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * Grows this rectangular area to include the given area.
     * Optimized using Math.min/max which modern JS engines inline efficiently.
     * @param x The x coordinate of the new area to include.
     * @param y The y coordinate of the new area to include.
     * @param width The width of the new area to include. Negative values are not supported.
     * @param height The height of the new area to include. Negative values are not supported.
     */
    public union(x: number, y: number, width: number = 0, height: number = 0): void {
        if (this.empty) {
            // First sub-rect added
            this.empty = false;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        } else {
            // Calculate right and bottom edges
            const right = x + width;
            const bottom = y + height;
            const thisRight = this.x + this.width;
            const thisBottom = this.y + this.height;
            
            // Use Math.min/max - modern JIT compilers optimize these well
            const newX = Math.min(this.x, x);
            const newY = Math.min(this.y, y);
            const newRight = Math.max(thisRight, right);
            const newBottom = Math.max(thisBottom, bottom);
            
            this.x = newX;
            this.y = newY;
            this.width = newRight - newX;
            this.height = newBottom - newY;
        }
    }
}
