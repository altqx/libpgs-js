export class PgsRendererHelper {
    /**
     * Returns the array index position for the previous timestamp position from the given array.
     * Returns -1 if the given time is outside the timestamp range.
     * Uses binary search for O(log n) performance instead of linear O(n) search.
     * @param time The timestamp to check in seconds.
     * @param pgsTimestamps The list of available PGS timestamps.
     */
    public static getIndexFromTimestamps(time: number, pgsTimestamps: number[]): number {
        const len = pgsTimestamps.length;
        if (len === 0) return -1;

        const pgsTime = time * 90000; // Convert to PGS time (90kHz clock)

        // Outside valid range
        if (pgsTime >= pgsTimestamps[len - 1]) return -1;
        if (pgsTime < pgsTimestamps[0]) return -1;

        // Binary search to find the largest index where timestamp <= pgsTime
        let left = 0;
        let right = len - 1;

        while (left < right) {
            // Use unsigned right shift to avoid overflow and get floor division
            const mid = (left + right + 1) >>> 1;
            if (pgsTimestamps[mid] <= pgsTime) {
                left = mid;
            } else {
                right = mid - 1;
            }
        }

        return left;
    }
}