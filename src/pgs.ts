import {BigEndianBinaryReader} from "./utils/bigEndianBinaryReader";
import {DisplaySet} from "./pgs/displaySet";
import {BinaryReader} from "./utils/binaryReader";
import {ArrayBinaryReader} from "./utils/arrayBinaryReader";
import {StreamBinaryReader} from "./utils/streamBinaryReader";
import {SubtitleCompositionData, SubtitleData} from "./subtitleData";
import {CompositionObject} from "./pgs/presentationCompositionSegment";
import {PaletteDefinitionSegment} from "./pgs/paletteDefinitionSegment";
import {ObjectDefinitionSegment} from "./pgs/objectDefinitionSegment";
import {CombinedBinaryReader} from "./utils/combinedBinaryReader";
import {RunLengthEncoding} from "./utils/runLengthEncoding";
import {WindowDefinition} from "./pgs/windowDefinitionSegment";
import {PgsRendererHelper} from "./pgsRendererHelper";

export interface PgsLoadOptions {
    /**
     * Async pgs streams can return partial updates. When invoked, the `displaySets` and `updateTimestamps` are updated
     * to the last available subtitle. There is a minimum threshold of one-second to prevent to many updates.
     */
    onProgress?: () => void;
}

/**
 * Simple LRU cache for subtitle data.
 */
class SubtitleCache {
    private readonly maxSize: number;
    private readonly cache: Map<number, SubtitleData | undefined>;
    
    constructor(maxSize: number = 8) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    
    get(index: number): SubtitleData | undefined | null {
        const value = this.cache.get(index);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(index);
            this.cache.set(index, value);
            return value;
        }
        return null; // null means not in cache, undefined means cached empty result
    }
    
    set(index: number, value: SubtitleData | undefined): void {
        if (this.cache.has(index)) {
            this.cache.delete(index);
        } else if (this.cache.size >= this.maxSize) {
            // Remove oldest entry (first key)
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(index, value);
    }
    
    clear(): void {
        this.cache.clear();
    }
}

/**
 * The PGS subtitle data class. This can load and cache sup files from a buffer or url.
 * It can also build image data for a given timestamp or timestamp index.
 */
export class Pgs {

    /**
     * The currently loaded display sets.
     */
    public displaySets: DisplaySet[] = [];

    /**
     * The PGS timestamps when a display set with the same index is presented.
     */
    public updateTimestamps: number[] = [];

    /**
     * LRU cache for computed subtitle data.
     */
    private subtitleCache = new SubtitleCache(8);

    /**
     * Loads the subtitle file from the given url.
     * @param url The url to the PGS file.
     * @param options Optional loading options. Use `onProgress` as callback for partial update while loading.
     */
    public async loadFromUrl(url: string, options?: PgsLoadOptions): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        // The `body` and therefore readable streams are only available since Chrome 105. With this available we can utilize
        // partial reading while downloading. As a fallback we wait for the whole file to download before reading.
        const stream = response.body?.getReader();
        let reader: BinaryReader;
        if (stream) {
            reader = new StreamBinaryReader(stream);
        } else {
            const buffer = await response.arrayBuffer();
            reader = new ArrayBinaryReader(new Uint8Array(buffer));
        }

        await this.loadFromReader(reader, options);
    }

    /**
     * Loads the subtitle file from the given buffer.
     * @param buffer The PGS data.
     * @param options Optional loading options. Use `onProgress` as callback for partial update while loading.
     */
    public async loadFromBuffer(buffer: ArrayBuffer, options?: PgsLoadOptions): Promise<void> {
        await this.loadFromReader(new ArrayBinaryReader(new Uint8Array(buffer)), options);
    }

    /**
     * Loads the subtitle file from the given buffer.
     * @param reader The PGS data reader.
     * @param options Optional loading options. Use `onProgress` as callback for partial update while loading.
     */
    public async loadFromReader(reader: BinaryReader, options?: PgsLoadOptions): Promise<void> {
        this.displaySets = [];
        this.updateTimestamps = [];
        this.subtitleCache.clear();

        let lastUpdateTime = performance.now();

        const bigEndianReader = new BigEndianBinaryReader(reader);
        while (!reader.eof) {
            const displaySet = new DisplaySet();
            await displaySet.read(bigEndianReader, true);
            this.displaySets.push(displaySet);
            this.updateTimestamps.push(displaySet.presentationTimestamp);

            // For async loading, we support frequent progress updates. Sending one update for every new display set
            // would be too much. Instead, we use a one-second threshold.
            if (options?.onProgress) {
                const now = performance.now();
                if (now > lastUpdateTime + 1000) {
                    lastUpdateTime = now;
                    options.onProgress();
                }
            }
        }

        // Call final update.
        if (options?.onProgress) {
            options.onProgress();
        }
    }

    /**
     * Pre-compiles and caches the subtitle data for the given index.
     * This will speed up the next call to `getSubtitleAtIndex` with the same index.
     * @param index The index of the display set to cache.
     */
    public cacheSubtitleAtIndex(index: number): void {
        // Only cache if not already cached
        if (this.subtitleCache.get(index) === null) {
            const subtitleData = this.computeSubtitleAtIndex(index);
            this.subtitleCache.set(index, subtitleData);
        }
    }

    /**
     * Renders the subtitle at the given timestamp.
     * @param time The timestamp in seconds.
     */
    public getSubtitleAtTimestamp(time: number): SubtitleData | undefined {
        const index = PgsRendererHelper.getIndexFromTimestamps(time, this.updateTimestamps);
        return this.getSubtitleAtIndex(index);
    }

    /**
     * Gets the subtitle data at the given index, using cache when available.
     * @param index The index of the display set to render.
     */
    public getSubtitleAtIndex(index: number): SubtitleData | undefined {
        // Check cache first
        const cached = this.subtitleCache.get(index);
        if (cached !== null) {
            return cached;
        }
        
        // Compute and cache
        const result = this.computeSubtitleAtIndex(index);
        this.subtitleCache.set(index, result);
        return result;
    }

    /**
     * Pre-compiles the required subtitle data (windows and pixel data) for the frame at the given index.
     * @param index The index of the display set to render.
     */
    private computeSubtitleAtIndex(index: number): SubtitleData | undefined {
        if (index < 0 || index >= this.displaySets.length) {
            return undefined;
        }

        const displaySet = this.displaySets[index];
        if (!displaySet.presentationComposition) return undefined;

        // We need to collect all valid objects and palettes up to this point. PGS can update and reuse elements from
        // previous display sets. The `compositionState` defines if the previous elements should be cleared.
        // If it is `0` previous elements should be kept. Because the user can seek through the file, we can not store
        // previous elements, and we should collect these elements for every new render.
        const ctxObjects: ObjectDefinitionSegment[] = [];
        const ctxPalettes: PaletteDefinitionSegment[] = [];
        const ctxWindows: WindowDefinition[] = [];
        let curIndex = index;
        while (curIndex >= 0) {
            const currentSet = this.displaySets[curIndex];
            // Because we are moving backwards, we would end up with the inverted array order.
            // We'll use `unshift` to add these elements to the front of the array.
            ctxObjects.unshift(...currentSet.objectDefinitions);
            ctxPalettes.unshift(...currentSet.paletteDefinitions);
            // `flatMap` is available since Chrome 69.
            for (const windowDefinition of currentSet.windowDefinitions) {
                ctxWindows.unshift(...windowDefinition.windows);
            }

            // Any other state that `0` frees all previous segments, so we can stop here.
            if (currentSet.presentationComposition?.compositionState !== 0) {
                break;
            }

            curIndex--;
        }

        // Find the used palette for this composition.
        const palette = ctxPalettes
            .find(w => w.id === displaySet.presentationComposition?.paletteId);
        if (!palette) return undefined;

        const compositionData: SubtitleCompositionData[] = [];
        for (const compositionObject of displaySet.presentationComposition.compositionObjects) {
            // Find the window to draw on.
            const window = ctxWindows.find(w => w.id === compositionObject.windowId);
            if (!window) continue;

            // Builds the subtitle.
            const pixelData = this.getPixelDataFromComposition(compositionObject, palette, ctxObjects);
            if (pixelData) {
                compositionData.push(new SubtitleCompositionData(compositionObject, window, pixelData));
            }
        }

        if (compositionData.length === 0) return undefined;

        return new SubtitleData(displaySet.presentationComposition.width, displaySet.presentationComposition.height,
            compositionData);
    }


    private getPixelDataFromComposition(composition: CompositionObject, palette: PaletteDefinitionSegment,
                                        ctxObjects: ObjectDefinitionSegment[]): ImageData | undefined {
        // Multiple object definition can define a single subtitle image.
        // However, only the first element in sequence hold the image size.
        let width: number = 0;
        let height: number = 0;
        const dataChunks: Uint8Array[] = [];
        for (const ods of ctxObjects) {
            if (ods.id != composition.id) continue;
            if (ods.isFirstInSequence) {
                width = ods.width;
                height = ods.height;
            }

            if (ods.data) {
                dataChunks.push(ods.data);
            }
        }
        if (dataChunks.length == 0) {
            return undefined;
        }

        // Using a combined reader instead of stitching the data together.
        // This hopefully avoids a larger memory allocation.
        const data = new CombinedBinaryReader(dataChunks);

        // Detect if we are running in a web-worker or in main browser
        if (typeof document !== 'undefined') {
            // We have to use the canvas api to create image data.
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d")!;
            const imageData = context.createImageData(width, height);
            const imageBuffer = new Uint32Array(imageData.data.buffer);

            // The pixel data is run-length encoded. The decoded value is the palette entry index.
            RunLengthEncoding.decode(data, palette.rgba, imageBuffer);

            return imageData;
        } else {
            // Building a canvas element with the subtitle image data.
            const imageBuffer = new Uint32Array(width * height);

            // The pixel data is run-length encoded. The decoded value is the palette entry index.
            RunLengthEncoding.decode(data, palette.rgba, imageBuffer);

            // We can use the image data constructor in web-workers.
            return new ImageData(new Uint8ClampedArray(imageBuffer.buffer), width, height);
        }
    }

}
