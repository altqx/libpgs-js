import {BinaryReader} from "./binaryReader";
import {ArrayBinaryReader} from "./arrayBinaryReader";

/**
 * Handles run length encoded images.
 */
export abstract class RunLengthEncoding {
    /**
     * Decodes the run length encoded image.
     * Optimized version using direct array access and minimizing function calls.
     * @param reader The run length encoded binary data reader or buffer.
     * @param source The source maps the index value to the raw output pixel data.
     * @param target The pixel data is written to the output.
     * @return Returns the number of decoded pixels.
     */
    static decode(reader: BinaryReader | Uint8Array,
        source: number[] | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array,
        target: number[] | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array): number {
        
        // Fast path for Uint8Array input - avoid BinaryReader overhead
        if (reader instanceof Uint8Array) {
            return this.decodeFast(reader, source, target);
        }

        let idx = 0;
        const len = reader.length;
        
        while (reader.position < len) {
            const byte1 = reader.readByte();
            // Raw byte (most common case first)
            if (byte1 !== 0) {
                target[idx++] = source[byte1];
                continue;
            }

            const byte2 = reader.readByte();
            // End of line
            if (byte2 === 0) {
                continue;
            }

            // Decode run-length encoded sequence
            const bit8 = byte2 & 0x80;
            const bit7 = byte2 & 0x40;
            let num = byte2 & 0x3F;
            
            if (bit7) {
                num = (num << 8) | reader.readByte();
            }
            
            const value = bit8 ? source[reader.readByte()] : source[0];
            
            // Unrolled fill loop for better performance
            const end = idx + num;
            while (idx + 4 <= end) {
                target[idx] = value;
                target[idx + 1] = value;
                target[idx + 2] = value;
                target[idx + 3] = value;
                idx += 4;
            }
            while (idx < end) {
                target[idx++] = value;
            }
        }

        return idx;
    }

    /**
     * Fast decode path for Uint8Array input without BinaryReader overhead.
     */
    private static decodeFast(
        data: Uint8Array,
        source: number[] | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array,
        target: number[] | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array
    ): number {
        let idx = 0;
        let pos = 0;
        const len = data.length;
        
        while (pos < len) {
            const byte1 = data[pos++];
            // Raw byte (most common case first)
            if (byte1 !== 0) {
                target[idx++] = source[byte1];
                continue;
            }

            const byte2 = data[pos++];
            // End of line
            if (byte2 === 0) {
                continue;
            }

            // Decode run-length encoded sequence
            const bit8 = byte2 & 0x80;
            const bit7 = byte2 & 0x40;
            let num = byte2 & 0x3F;
            
            if (bit7) {
                num = (num << 8) | data[pos++];
            }
            
            const value = bit8 ? source[data[pos++]] : source[0];
            
            // Use TypedArray.fill when available (much faster for large runs)
            if (num > 16 && target instanceof Uint32Array) {
                target.fill(value, idx, idx + num);
                idx += num;
            } else {
                // Unrolled fill loop for smaller runs
                const end = idx + num;
                while (idx + 4 <= end) {
                    target[idx] = value;
                    target[idx + 1] = value;
                    target[idx + 2] = value;
                    target[idx + 3] = value;
                    idx += 4;
                }
                while (idx < end) {
                    target[idx++] = value;
                }
            }
        }

        return idx;
    }
}
