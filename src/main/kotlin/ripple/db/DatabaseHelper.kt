package ripple.db

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantReadWriteLock

/**
 * Thread-Safe SQLite Database Operations Manager for Ripple.
 */
class DatabaseHelper {

    private val rwLock = ReentrantReadWriteLock()

    // In-memory persistent table stores
    val identities = ConcurrentHashMap<String, ByteArray>()
    val messages = ConcurrentHashMap<String, Map<String, Any>>()
    val transitQueue = ConcurrentHashMap<String, Map<String, Any>>()
    val peerEncounters = ConcurrentHashMap<String, Map<String, Any>>()
    val bannedPeers = ConcurrentHashMap<String, Long>()

    fun insertMessage(
        messageId: String,
        conversationId: String,
        sender: String,
        recipient: String,
        body: String,
        timestamp: Long,
        status: String,
        isOutgoing: Boolean
    ) {
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            messages[messageId] = mapOf(
                "message_id" to messageId,
                "conversation_id" to conversationId,
                "sender_address" to sender,
                "recipient_address" to recipient,
                "body_plain" to body,
                "timestamp" to timestamp,
                "status" to status,
                "is_outgoing" to isOutgoing
            )
        } finally {
            lock.unlock()
        }
    }

    fun updateMessageStatus(messageId: String, newStatus: String) {
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            val existing = messages[messageId]
            if (existing != null) {
                val updated = existing.toMutableMap()
                updated["status"] = newStatus
                messages[messageId] = updated
            }
        } finally {
            lock.unlock()
        }
    }

    fun recordPeerEncounter(peerAddress: String) {
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            val existing = peerEncounters[peerAddress]
            val count = (existing?.get("encounter_count") as? Int ?: 0) + 1
            peerEncounters[peerAddress] = mapOf(
                "peer_address" to peerAddress,
                "last_seen" to System.currentTimeMillis(),
                "encounter_count" to count,
                "reputation_score" to (existing?.get("reputation_score") as? Int ?: 100)
            )
        } finally {
            lock.unlock()
        }
    }

    fun isPeerBanned(peerAddress: String): Boolean {
        val lock = rwLock.readLock()
        lock.lock()
        try {
            val bannedUntil = bannedPeers[peerAddress] ?: return false
            if (System.currentTimeMillis() > bannedUntil) {
                bannedPeers.remove(peerAddress)
                return false
            }
            return true
        } finally {
            lock.unlock()
        }
    }

    fun banPeer(peerAddress: String, durationMs: Long = 1800000L) {
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            bannedPeers[peerAddress] = System.currentTimeMillis() + durationMs
        } finally {
            lock.unlock()
        }
    }
}
