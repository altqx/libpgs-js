/**
 * @jest-environment jsdom
 */

import {Renderer} from "../src/renderer";
import * as fs from "node:fs";
import {Pgs} from "../src/pgs";

beforeEach(() => {
    // This makes `ImageData` available in Jest.
    global.ImageData = require('canvas').ImageData;
});

test('load and render full pgs subtitle', async () => {


    const dataSup = fs.readFileSync(`${__dirname}/files/test.sup`);
    // Convert Buffer to ArrayBuffer using Uint8Array for proper typing
    const uint8Array = new Uint8Array(dataSup);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const renderer = new Renderer(canvas);
    const pgs = new Pgs();
    await pgs.loadFromBuffer(uint8Array.buffer as ArrayBuffer);

    // Helper function to render and compare the image in the test directory.
    // Since we only set pixel data and don't use font rendering this should be deterministic on every machine.
    const expectImageAtTimestamp = async (filename: string, timestamp: number) => {
        const expectedData = fs.readFileSync(`${__dirname}/files/${filename}`);

        const subtitleData = pgs.getSubtitleAtTimestamp(timestamp);
        await renderer.draw(subtitleData);
        const resultData = context.getImageData(0, 0, canvas.width, canvas.height).data;

        // Compare the resulted pixel data with a pre-calculated expected pixel data.
        expect(resultData.length).toBe(expectedData.length);
        for (let i = 0; i < resultData.length; i++) {
            expect(resultData[i]).toBe(expectedData[i]);
        }
    }

    await expectImageAtTimestamp('test-0.rgba', 1.5);
    await expectImageAtTimestamp('test-1.rgba', 2.5);
    await expectImageAtTimestamp('test-2.rgba', 3.5);
});
