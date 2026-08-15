package ripple.db

import java.util.concurrent.ConcurrentHashMap
import ripple.packet.BinaryPacket

/**
 * Transit Queue Quota & Tiered Eviction Manager.
 * Enforces 50 MB / 5,000 bundle quota with deterministic eviction:
 * Stale -> High Hop -> Low PoW -> Unknown Contacts -> FIFO.
 */
class TransitQueueManager(
    val maxStorageBytes: Long = 50 * 1024 * 1024L, // 50 MB
    val maxBundles: Int = 5000
) {

    data class TransitItem(
        val messageId: String,
        val recipientHash: String,
        val packet: BinaryPacket,
        val payloadSize: Int,
        val powDifficulty: Int,
        val hopCount: Int,
        val expiresAt: Long,
        val receivedAt: Long,
        val isContact: Boolean
    )

    private val queue = ConcurrentHashMap<String, TransitItem>()

    fun enqueue(item: TransitItem): Boolean {
        enforceQuota(item.payloadSize.toLong())
        queue[item.messageId] = item
        return true
    }

    fun remove(messageId: String): TransitItem? {
        return queue.remove(messageId)
    }

    fun contains(messageId: String): Boolean {
        return queue.containsKey(messageId)
    }

    fun getTotalBytes(): Long {
        return queue.values.sumOf { it.payloadSize.toLong() }
    }

    fun getBundleCount(): Int {
        return queue.size
    }

    fun enforceQuota(incomingSize: Long = 0) {
        while ((getTotalBytes() + incomingSize > maxStorageBytes || getBundleCount() >= maxBundles) && queue.isNotEmpty()) {
            val candidate = queue.values.minWithOrNull(
                compareBy<TransitItem> { it.expiresAt } // 1. Stale packets first
                    .thenByDescending { it.hopCount }  // 2. High hop count
                    .thenBy { it.powDifficulty }      // 3. Low PoW
                    .thenBy { if (it.isContact) 1 else 0 } // 4. Unknown before contacts
                    .thenBy { it.receivedAt }          // 5. FIFO
            ) ?: break

            queue.remove(candidate.messageId)
        }
    }
}
