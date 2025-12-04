import {Rect} from "./utils/rect";
import {SubtitleCompositionData, SubtitleData} from "./subtitleData";

/**
 * This handles the low-level PGS loading and rendering. This renderer can operate inside the web worker without being
 * linked to a video element.
 */
export class Renderer {

    private readonly canvas: OffscreenCanvas | HTMLCanvasElement;
    private readonly context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

    // We keep track of the dirty area on the canvas. Clearing the whole canvas is slow when only a small area was used.
    private readonly dirtyArea = new Rect();

    // Cache for ImageBitmap objects to avoid recreating them
    private bitmapCache: Map<ImageData, ImageBitmap> = new Map();
    
    // Check if createImageBitmap is available (much faster than putImageData)
    private static readonly supportsImageBitmap = typeof createImageBitmap === 'function';

    public constructor(canvas: OffscreenCanvas | HTMLCanvasElement) {
        this.canvas = canvas;
        // Use willReadFrequently: false and alpha: true for better performance
        this.context = canvas.getContext('2d', {
            alpha: true,
            desynchronized: true, // Reduces latency on supported browsers
        })! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    }


    /**
     * Renders the given subtitle data to the canvas.
     * @param subtitleData The pre-compiled subtitle data to render.
     */
    public async draw(subtitleData?: SubtitleData) {
        if (!this.canvas || !this.context) return;
        // Clear the canvas on invalid indices. It is possible to seek to a position before the first subtitle while
        // a later subtitle is on screen. This subtitle must be clear, even there is no valid new subtitle data.
        // Ignoring the render would keep the previous subtitle on screen.
        if (!this.dirtyArea.empty) {
            this.context.clearRect(this.dirtyArea.x, this.dirtyArea.y, this.dirtyArea.width, this.dirtyArea.height);
            this.dirtyArea.reset();
        }

        if (!subtitleData)
            return;

        // Resize the canvas if needed.
        if (this.canvas.width !== subtitleData.width || this.canvas.height !== subtitleData.height) {
            this.canvas.width = subtitleData.width;
            this.canvas.height = subtitleData.height;
            // Clear bitmap cache on resize
            this.clearBitmapCache();
        }

        await this.drawSubtitleData(subtitleData, this.dirtyArea);
    }

    /**
     * Clears the bitmap cache and releases resources.
     */
    private clearBitmapCache(): void {
        this.bitmapCache.forEach(bitmap => bitmap.close());
        this.bitmapCache.clear();
    }

    /**
     * Draws the whole subtitle frame to the given context.
     * @param subtitleData The subtitle data to draw.
     * @param dirtyArea If given, it will extend the dirty rect to include the affected subtitle area.
     */
    private async drawSubtitleData(subtitleData: SubtitleData, dirtyArea?: Rect): Promise<void> {
        // Use Promise.all for parallel bitmap creation if supported
        if (Renderer.supportsImageBitmap) {
            const compositions = subtitleData.compositionData;
            const bitmapPromises = compositions.map(c => this.getOrCreateBitmap(c.pixelData));
            const bitmaps = await Promise.all(bitmapPromises);
            
            for (let i = 0; i < compositions.length; i++) {
                this.drawSubtitleCompositionWithBitmap(compositions[i], bitmaps[i], dirtyArea);
            }
        } else {
            for (const composition of subtitleData.compositionData) {
                this.drawSubtitleCompositionData(composition, dirtyArea);
            }
        }
    }

    /**
     * Gets or creates an ImageBitmap from the cache.
     */
    private async getOrCreateBitmap(pixelData: ImageData): Promise<ImageBitmap> {
        let bitmap = this.bitmapCache.get(pixelData);
        if (!bitmap) {
            bitmap = await createImageBitmap(pixelData);
            this.bitmapCache.set(pixelData, bitmap);
        }
        return bitmap;
    }

    /**
     * Draws subtitle composition using ImageBitmap (faster path).
     */
    private drawSubtitleCompositionWithBitmap(
        compositionData: SubtitleCompositionData, 
        bitmap: ImageBitmap,
        dirtyArea?: Rect
    ): void {
        const compositionObject = compositionData.compositionObject;
        
        if (compositionObject.hasCropping) {
            this.context.drawImage(
                bitmap,
                compositionObject.croppingHorizontalPosition,
                compositionObject.croppingVerticalPosition,
                compositionObject.croppingWidth,
                compositionObject.croppingHeight,
                compositionObject.horizontalPosition + compositionObject.croppingHorizontalPosition,
                compositionObject.verticalPosition + compositionObject.croppingVerticalPosition,
                compositionObject.croppingWidth,
                compositionObject.croppingHeight
            );

            dirtyArea?.union(
                compositionObject.horizontalPosition,
                compositionObject.verticalPosition,
                compositionObject.croppingWidth,
                compositionObject.croppingHeight
            );
        } else {
            this.context.drawImage(
                bitmap,
                compositionObject.horizontalPosition,
                compositionObject.verticalPosition
            );

            dirtyArea?.union(
                compositionObject.horizontalPosition,
                compositionObject.verticalPosition,
                bitmap.width,
                bitmap.height
            );
        }
    }

    /**
     * Draws this subtitle composition to the given context.
     * @param compositionData The subtitle composition data to draw.
     * @param dirtyArea If given, it will extend the dirty rect to include the affected subtitle area.
     */
    private drawSubtitleCompositionData(compositionData: SubtitleCompositionData, dirtyArea?: Rect): void {
        const compositionObject = compositionData.compositionObject;
        if (compositionObject.hasCropping) {
            this.context?.putImageData(compositionData.pixelData,
                compositionObject.horizontalPosition, compositionObject.verticalPosition,
                compositionObject.croppingHorizontalPosition, compositionObject.croppingVerticalPosition,
                compositionObject.croppingWidth, compositionObject.croppingHeight);

            dirtyArea?.union(compositionObject.horizontalPosition, compositionObject.verticalPosition,
                compositionObject.croppingWidth, compositionObject.croppingHeight);
        } else {
            this.context?.putImageData(compositionData.pixelData,
                compositionObject.horizontalPosition, compositionObject.verticalPosition);

            dirtyArea?.union(compositionObject.horizontalPosition, compositionObject.verticalPosition,
                compositionData.pixelData.width, compositionData.pixelData.height);
        }
    }

    /**
     * Disposes the renderer and clears resources.
     */
    public dispose(): void {
        this.clearBitmapCache();
    }
}
