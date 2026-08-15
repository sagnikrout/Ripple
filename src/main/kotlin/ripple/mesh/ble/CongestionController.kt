package ripple.mesh.ble

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ThreadLocalRandom

/**
 * CSMA-CA / Slotted ALOHA Radio Contention Controller & Per-Peer Bandwidth Quota.
 */
class CongestionController(
    val maxBytesPerPeerPerWindow: Long = 256 * 1024L, // 256 KB
    val windowDurationMs: Long = 300000L // 5 minutes
) {

    private val peerTransfers = ConcurrentHashMap<String, Pair<Long, Long>>() // peer -> (bytes, windowStart)
    private var collisionCount = 0

    fun calculateBackoffDelay(): Long {
        val maxSlots = Math.min(16, 1 shl collisionCount)
        val slot = ThreadLocalRandom.current().nextInt(0, maxSlots + 1)
        val jitter = ThreadLocalRandom.current().nextInt(5, 25)
        return (slot * 50L) + jitter
    }

    fun recordCollision() {
        collisionCount = Math.min(6, collisionCount + 1)
    }

    fun recordSuccess() {
        collisionCount = Math.max(0, collisionCount - 1)
    }

    fun canTransferBytes(peerAddress: String, byteCount: Long): Boolean {
        val now = System.currentTimeMillis()
        val entry = peerTransfers[peerAddress]

        if (entry == null || (now - entry.second) > windowDurationMs) {
            peerTransfers[peerAddress] = Pair(byteCount, now)
            return true
        }

        if (entry.first + byteCount > maxBytesPerPeerPerWindow) {
            return false // Bandwidth quota exceeded
        }

        peerTransfers[peerAddress] = Pair(entry.first + byteCount, entry.second)
        return true
    }
}
