import {PgsRendererMode} from "./pgsRendererMode";

export class BrowserSupport {
    /**
     * Checks if the web worker is supported in the current environment.
     */
    public static isWorkerSupported(): boolean {
        return typeof Worker !== 'undefined';
    }

    /**
     * Checks if the offscreen-canvas and `transferControlToOffscreen` are supported in the current environment.
     */
    public static isOffscreenCanvasSupported(): boolean {
        return typeof HTMLCanvasElement !== 'undefined' && 
               typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
    }

    /**
     * Checks if ImageBitmap is supported for faster rendering.
     */
    public static isImageBitmapSupported(): boolean {
        return typeof createImageBitmap === 'function';
    }

    /**
     * Returns the optimal PGS renderer mode for the current platform.
     * Optimized for modern browsers (2020+).
     */
    public static getRendererModeByPlatform(): PgsRendererMode {
        // Modern feature detection - no longer checking for ancient browser versions
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

        // Detect WebOS (Smart TVs) - they may have quirks
        const webOS = userAgent.includes('Web0S') || userAgent.includes('webOS');
        
        // Detect Chrome version for WebOS edge cases
        const chromeMatch = /Chrome\/(\d+)/.exec(userAgent);
        const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

        // WebOS with older Chrome versions may have worker issues
        if (webOS && chromeVersion > 0 && chromeVersion <= 79) {
            return PgsRendererMode.mainThread;
        }

        // Feature-based detection for all other platforms
        const isWorkerSupported = this.isWorkerSupported();
        const isOffscreenCanvasSupported = this.isOffscreenCanvasSupported();
        
        if (isWorkerSupported) {
            if (isOffscreenCanvasSupported) {
                return PgsRendererMode.worker;
            } else {
                return PgsRendererMode.workerWithoutOffscreenCanvas;
            }
        } else {
            return PgsRendererMode.mainThread;
        }
    }
}
