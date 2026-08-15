package ripple.sync

import java.nio.ByteBuffer
import java.nio.ByteOrder
import ripple.crypto.Blake3

/**
 * 4,096-bit Dynamic Bloom Filter for Anti-Entropy Inventory Handshakes.
 */
class BloomFilter(
    val bitSize: Int = 4096,
    val numHashes: Int = 4
) {

    val bits = ByteArray((bitSize + 7) / 8)

    private fun getHashes(item: ByteArray): IntArray {
        val h = Blake3.hash(item)
        val buf = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN)
        val h1 = buf.getInt()
        val h2 = buf.getInt() or 1
        val result = IntArray(numHashes)
        for (i in 0 until numHashes) {
            val combined = (h1 + i * h2).toLong() and 0xFFFFFFFFL
            result[i] = (combined % bitSize).toInt()
        }
        return result
    }

    fun add(item: ByteArray) {
        for (idx in getHashes(item)) {
            val byteIdx = idx / 8
            val bitIdx = idx % 8
            bits[byteIdx] = (bits[byteIdx].toInt() or (1 shl bitIdx)).toByte()
        }
    }

    fun contains(item: ByteArray): Boolean {
        for (idx in getHashes(item)) {
            val byteIdx = idx / 8
            val bitIdx = idx % 8
            if ((bits[byteIdx].toInt() and (1 shl bitIdx)) == 0) {
                return false
            }
        }
        return true
    }

    fun toTruncated4Bytes(): ByteArray {
        val out = ByteArray(4)
        for (i in 0 until 4) {
            out[i] = (bits[i].toInt() xor bits[i + 4].toInt() xor bits[i + 8].toInt()).toByte()
        }
        return out
    }
}
