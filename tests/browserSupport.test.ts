import {BrowserSupport} from "../src/browserSupport";
import {PgsRendererMode} from "../src/pgsRendererMode";

// Modern browser test cases - we no longer support ancient browsers (Chrome <80, Firefox <75)
const devices = [
    {
        name: 'WebOS 1.2 (legacy WebKit)',
        userAgent: 'Mozilla/5.0 (Web0S; Linux i686) AppleWebKit/537.41 (KHTML, like Gecko) Large Screen WebAppManager Safari/537.41',
        worker: true,
        offscreenCanvas: false,
        // No Chrome version detected, so modern feature-based detection applies
        expectedMode: PgsRendererMode.workerWithoutOffscreenCanvas
    },
    {
        name: 'WebOS 5.0 (Chrome 68)',
        userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager',
        worker: true,
        offscreenCanvas: false,
        // WebOS with Chrome <= 79 falls back to mainThread due to known worker issues
        expectedMode: PgsRendererMode.mainThread
    },
    {
        name: 'WebOS 6.0 (Chrome 87)',
        userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
        worker: true,
        offscreenCanvas: true,
        // WebOS with Chrome > 79 uses full worker support
        expectedMode: PgsRendererMode.worker
    },
    {
        name: 'Chrome 80 (minimum supported)',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36',
        worker: true,
        offscreenCanvas: true,
        expectedMode: PgsRendererMode.worker
    },
    {
        name: 'Chrome 128',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        worker: true,
        offscreenCanvas: true,
        expectedMode: PgsRendererMode.worker
    },
    {
        name: 'Firefox 75 (minimum supported)',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:75.0) Gecko/20100101 Firefox/75.0',
        worker: true,
        offscreenCanvas: false,
        expectedMode: PgsRendererMode.workerWithoutOffscreenCanvas
    },
    {
        name: 'Firefox 130',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
        worker: true,
        offscreenCanvas: true,
        expectedMode: PgsRendererMode.worker
    },
    {
        name: 'Safari 14 (minimum supported)',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
        worker: true,
        offscreenCanvas: false,
        expectedMode: PgsRendererMode.workerWithoutOffscreenCanvas
    },
    {
        name: 'No worker support (fallback)',
        userAgent: 'Mozilla/5.0 (Unknown)',
        worker: false,
        offscreenCanvas: false,
        expectedMode: PgsRendererMode.mainThread
    }
];

describe.each(devices)('on $name', (device) => {
    beforeEach(() => {
        Object.defineProperty(global, 'navigator', {
            configurable: true,
            value: {
                userAgent: device.userAgent
            }
        });

        Object.defineProperty(global, 'Worker', {
            configurable: true,
            value: device.worker ? class Worker {} : undefined,
        });

        Object.defineProperty(global, 'HTMLCanvasElement', {
            configurable: true,
            value: {
                prototype: {
                    transferControlToOffscreen: device.offscreenCanvas ? () => {} : undefined
                }
            }
        });
    });
    afterEach(() => jest.resetAllMocks());

    it(`worker support is ${device.worker}`, () => {
        expect(BrowserSupport.isWorkerSupported()).toBe(device.worker);
    });

    it(`offscreen canvas support is ${device.offscreenCanvas}`, () => {
        expect(BrowserSupport.isOffscreenCanvasSupported()).toBe(device.offscreenCanvas);
    });

    it(`render mode is ${device.expectedMode}`, () => {
        expect(BrowserSupport.getRendererModeByPlatform()).toBe(device.expectedMode);
    });
});
