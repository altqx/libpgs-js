import {BinaryReader} from "./binaryReader";
import {ArrayBinaryReader} from "./arrayBinaryReader";

/**
 * A binary reader that combines multiple binary readers in one data stream.
 * Optimized for sequential reading with minimal overhead.
 */
export class CombinedBinaryReader implements BinaryReader {
    private readonly subReaders: ArrayBinaryReader[];
    private $length: number;

    private $position: number = 0;
    private subReaderIndex: number = 0;
    
    // Cache current sub-reader for faster access
    private currentSubReader: ArrayBinaryReader | null = null;

    public constructor(subReaders: BinaryReader[] | Uint8Array[]) {
        this.subReaders = subReaders.map((subReader) => {
            if (subReader instanceof Uint8Array) {
                return new ArrayBinaryReader(subReader);
            }
            return subReader as ArrayBinaryReader;
        });

        let length = 0;
        for (const subReader of this.subReaders) {
            length += subReader.length;
        }
        this.$length = length;
        
        // Initialize current sub-reader
        if (this.subReaders.length > 0) {
            this.currentSubReader = this.subReaders[0];
        }
    }

    /**
     * Adding another sub-reader to the collection.
     * @param subReader The new sub-reader to add.
     */
    public push(subReader: BinaryReader | Uint8Array) {
        const reader = subReader instanceof Uint8Array 
            ? new ArrayBinaryReader(subReader) 
            : subReader as ArrayBinaryReader;
        
        this.subReaders.push(reader);
        this.$length += subReader.length;
        
        // Initialize current if this is the first reader
        if (!this.currentSubReader) {
            this.currentSubReader = reader;
        }
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
        // Fast path: use cached current reader
        while (this.currentSubReader && this.currentSubReader.position >= this.currentSubReader.length) {
            this.subReaderIndex++;
            this.currentSubReader = this.subReaders[this.subReaderIndex] || null;
        }
        this.$position++;
        return this.currentSubReader!.readByte();
    }

    /**
     * Optimized readBytes that minimizes per-byte overhead.
     */
    public readBytes(count: number): Uint8Array {
        const result = new Uint8Array(count);
        let offset = 0;
        
        while (offset < count) {
            // Advance to valid sub-reader
            while (this.currentSubReader && this.currentSubReader.position >= this.currentSubReader.length) {
                this.subReaderIndex++;
                this.currentSubReader = this.subReaders[this.subReaderIndex] || null;
            }
            
            if (!this.currentSubReader) break;
            
            // Calculate how many bytes we can read from current sub-reader
            const available = this.currentSubReader.length - this.currentSubReader.position;
            const toRead = Math.min(available, count - offset);
            
            // Bulk read from current sub-reader
            const chunk = this.currentSubReader.readBytes(toRead);
            result.set(chunk, offset);
            offset += toRead;
            this.$position += toRead;
        }
        
        return result;
    }
}
