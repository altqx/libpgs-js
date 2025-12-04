import {BinaryReader} from "./binaryReader";

/**
 * A binary reader based on a {@link Uint8Array}.
 * Optimized for fast sequential reading.
 */
export class ArrayBinaryReader implements BinaryReader {
    private readonly array: Uint8Array;
    private readonly $length: number;

    private $position: number = 0;

    public constructor(array: Uint8Array) {
        this.array = array;
        this.$length = array.length;
    }

    public get position(): number {
        return this.$position;
    }

    public get length(): number {
        return this.$length;
    }

    public get eof(): boolean {
        return this.$position >= this.$length;
    }

    public readByte(): number {
        return this.array[this.$position++];
    }

    /**
     * Reads bytes using subarray (no copy) when possible.
     */
    public readBytes(count: number): Uint8Array {
        const start = this.$position;
        this.$position += count;
        // Use subarray for zero-copy view when we don't need ownership
        return this.array.subarray(start, this.$position);
    }

    /**
     * Reads bytes with a copy (when ownership is needed).
     */
    public readBytesCopy(count: number): Uint8Array {
        const data = this.array.slice(this.$position, this.$position + count);
        this.$position += count;
        return data;
    }
}
