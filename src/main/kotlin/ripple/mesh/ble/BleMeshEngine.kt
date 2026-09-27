package ripple.mesh.ble

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ThreadLocalRandom

/**
 * Custom 128-bit BLE GATT UUID Profile Definitions for Ripple.
 */
object BleGattProfile {
    val SERVICE_UUID: UUID = UUID.fromString("0000RPL1-0000-1000-8000-00805F9B34FB")
    val CHAR_INVENTORY_READ: UUID = UUID.fromString("0000RPL2-0000-1000-8000-00805F9B34FB")
    val CHAR_PACKET_WRITE: UUID = UUID.fromString("0000RPL3-0000-1000-8000-00805F9B34FB")
    val CHAR_ACK_NOTIFY: UUID = UUID.fromString("0000RPL4-0000-1000-8000-00805F9B34FB")
}

/**
 * Operational Environment Modes for Dynamic Radio Adaptation.
 */
enum class EnvironmentProfile {
    NORMAL,            // Default urban/suburban mode: x = 5, y = 90s, duty cycle 12.5%
    DENSE_METRO,       // High-density subway/stadium: x = 3, y = 45s, aggressive backoff
    SPARSE_WILDERNESS  // Remote/blackout terrain: x = unrestricted, extended 14d TTL, 2% duty cycle
}

/**
 * CSMA-CA / Slotted ALOHA Radio Contention Controller & Per-Peer Bandwidth Quota.
 * Supports dynamic adaptation across sparse wilderness and hyper-dense metro environments.
 */
class CongestionController(
    val maxBytesPerPeerPerWindow: Long = 256 * 1024L, // 256 KB
    val windowDurationMs: Long = 300000L, // 5 minutes
    var currentProfile: EnvironmentProfile = EnvironmentProfile.NORMAL
) {

    private val peerTransfers = ConcurrentHashMap<String, Pair<Long, Long>>() // peer -> (bytes, windowStart)
    private var collisionCount = 0

    /**
     * Calculates optimal gossip fan-out limit (x) based on the operational environment.
     */
    fun getOptimalFanOut(): Int {
        return when (currentProfile) {
            EnvironmentProfile.DENSE_METRO -> 3
            EnvironmentProfile.NORMAL -> 5
            EnvironmentProfile.SPARSE_WILDERNESS -> 15
        }
    }

    /**
     * Calculates optimal peer debouncing window (y) in milliseconds.
     */
    fun getOptimalDebounceWindowMs(): Long {
        return when (currentProfile) {
            EnvironmentProfile.DENSE_METRO -> 45000L     // 45 seconds
            EnvironmentProfile.NORMAL -> 90000L          // 90 seconds
            EnvironmentProfile.SPARSE_WILDERNESS -> 180000L // 3 minutes
        }
    }

    /**
     * Exponential jittered backoff delay calculation.
     */
    fun calculateBackoffDelay(): Long {
        val maxSlots = when (currentProfile) {
            EnvironmentProfile.DENSE_METRO -> Math.min(32, 1 shl (collisionCount + 1))
            else -> Math.min(16, 1 shl collisionCount)
        }
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
