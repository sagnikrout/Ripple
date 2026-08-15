package ripple.packet

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap

/**
 * GATT 512-byte MTU Sequence Chunker & Out-of-Order Reassembly Manager.
 */
object ChunkManager {

    const val MAX_MTU = 512
    const val CHUNK_HEADER_SIZE = 2 + 2 + 16 + 2 // seq(2) + total(2) + msgId(16) + crc16(2) = 22 bytes
    const val MAX_CHUNK_DATA = MAX_MTU - CHUNK_HEADER_SIZE

    private val crcTable = IntArray(256).also { table ->
        for (i in 0 until 256) {
            var curr = i shl 8
            for (j in 0 until 8) {
                curr = if ((curr and 0x8000) != 0) (curr shl 1) xor 0x1021 else curr shl 1
            }
            table[i] = curr and 0xFFFF
        }
    }

    fun computeCrc16(data: ByteArray): Int {
        var crc = 0xFFFF
        for (b in data) {
            val idx = ((crc ushr 8) xor (b.toInt() and 0xFF)) and 0xFF
            crc = ((crc shl 8) xor crcTable[idx]) and 0xFFFF
        }
        return crc
    }

    fun splitIntoChunks(rawPacket: ByteArray, messageId: ByteArray): List<ByteArray> {
        val totalChunks = Math.max(1, (rawPacket.size + MAX_CHUNK_DATA - 1) / MAX_CHUNK_DATA)
        val chunks = ArrayList<ByteArray>(totalChunks)

        for (seq in 0 until totalChunks) {
            val offset = seq * MAX_CHUNK_DATA
            val length = Math.min(MAX_CHUNK_DATA, rawPacket.size - offset)
            val chunkData = rawPacket.copyOfRange(offset, offset + length)
            val crc = computeCrc16(chunkData)

            val chunk = ByteArray(CHUNK_HEADER_SIZE + length)
            val buf = ByteBuffer.wrap(chunk).order(ByteOrder.LITTLE_ENDIAN)
            buf.putShort(seq.toShort())
            buf.putShort(totalChunks.toShort())
            buf.put(messageId)
            buf.putShort(crc.toShort())
            buf.put(chunkData)

            chunks.add(chunk)
        }
        return chunks
    }

    class ReassemblyBuffer {
        private val buffers = ConcurrentHashMap<String, ConcurrentHashMap<Int, ByteArray>>()
        private val totals = ConcurrentHashMap<String, Int>()

        fun ingestChunk(rawChunk: ByteArray): ByteArray? {
            require(rawChunk.size >= CHUNK_HEADER_SIZE) { "Chunk smaller than header" }
            val buf = ByteBuffer.wrap(rawChunk).order(ByteOrder.LITTLE_ENDIAN)

            val seq = buf.getShort().toInt() and 0xFFFF
            val total = buf.getShort().toInt() and 0xFFFF
            val msgId = ByteArray(16).also { buf.get(it) }
            val expectedCrc = buf.getShort().toInt() and 0xFFFF
            val data = ByteArray(buf.remaining()).also { buf.get(it) }

            if (computeCrc16(data) != expectedCrc) {
                throw SecurityException("Chunk CRC16 verification failure")
            }

            val key = msgId.joinToString("") { "%02x".format(it) }
            val chunkMap = buffers.computeIfAbsent(key) { ConcurrentHashMap() }
            totals.putIfAbsent(key, total)
            chunkMap[seq] = data

            if (chunkMap.size == total) {
                val totalBytes = (0 until total).sumOf { chunkMap[it]!!.size }
                val reassembled = ByteArray(totalBytes)
                var destPos = 0
                for (i in 0 until total) {
                    val part = chunkMap[i]!!
                    System.arraycopy(part, 0, reassembled, destPos, part.size)
                    destPos += part.size
                }

                buffers.remove(key)
                totals.remove(key)
                return reassembled
            }
            return null
        }

        fun purge() {
            buffers.clear()
            totals.clear()
        }
    }
}
