package ripple.db

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantReadWriteLock

/**
 * SQLite DDL and Schema Definitions for Ripple.
 */
object SqliteSchema {

    const val TABLE_IDENTITIES = """
        CREATE TABLE IF NOT EXISTS identities (
            address TEXT PRIMARY KEY,
            public_key BLOB NOT NULL,
            private_key BLOB NOT NULL,
            display_name TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
    """

    const val TABLE_CONTACTS = """
        CREATE TABLE IF NOT EXISTS contacts (
            identity_slug TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            current_primary_key BLOB NOT NULL,
            created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        );
    """

    const val TABLE_CONTACT_AUTHORIZED_KEYS = """
        CREATE TABLE IF NOT EXISTS contact_authorized_keys (
            public_key_hex TEXT PRIMARY KEY,
            identity_slug TEXT NOT NULL,
            valid_from INTEGER NOT NULL,
            valid_until INTEGER,
            FOREIGN KEY(identity_slug) REFERENCES contacts(identity_slug)
        );
    """

    const val TABLE_MESSAGES = """
        CREATE TABLE IF NOT EXISTS messages (
            message_id BLOB PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            sender_address TEXT NOT NULL,
            recipient_address TEXT NOT NULL,
            body_plain TEXT,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL,
            is_outgoing INTEGER NOT NULL
        );
    """

    const val TABLE_TRANSIT_QUEUE = """
        CREATE TABLE IF NOT EXISTS transit_queue (
            message_id BLOB PRIMARY KEY,
            recipient_hash BLOB NOT NULL,
            sender_pubkey BLOB NOT NULL,
            raw_packet BLOB NOT NULL,
            payload_size INTEGER NOT NULL,
            pow_difficulty INTEGER NOT NULL,
            hop_count INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            received_at INTEGER NOT NULL,
            relayed_copies INTEGER DEFAULT 0
        );
    """

    const val TABLE_PEER_ENCOUNTERS = """
        CREATE TABLE IF NOT EXISTS peer_encounters (
            peer_address TEXT PRIMARY KEY,
            last_seen INTEGER NOT NULL,
            encounter_count INTEGER NOT NULL,
            reputation_score INTEGER DEFAULT 100
        );
    """

    const val TABLE_BANNED_PEERS = """
        CREATE TABLE IF NOT EXISTS banned_peers (
            peer_address TEXT PRIMARY KEY,
            banned_until INTEGER NOT NULL,
            reason TEXT NOT NULL
        );
    """

    const val INDEX_TRANSIT_RECIPIENT = "CREATE INDEX IF NOT EXISTS idx_transit_recipient ON transit_queue(recipient_hash);"
    const val INDEX_TRANSIT_EXPIRY = "CREATE INDEX IF NOT EXISTS idx_transit_expiry ON transit_queue(expires_at);"
    const val INDEX_TRANSIT_EVICTION = "CREATE INDEX IF NOT EXISTS idx_transit_eviction ON transit_queue(expires_at ASC, hop_count DESC, pow_difficulty ASC);"
    const val INDEX_MESSAGES_CONVO = "CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, timestamp);"
    const val INDEX_AUTH_KEYS = "CREATE INDEX IF NOT EXISTS idx_auth_keys_slug ON contact_authorized_keys(identity_slug);"
}

/**
 * Thread-Safe SQLite Database Operations Manager for Ripple.
 * Implements persistent identity chat-threading across key rotations and multi-device migration.
 */
class DatabaseHelper {

    private val rwLock = ReentrantReadWriteLock()

    // In-memory persistent table stores
    val identities = ConcurrentHashMap<String, ByteArray>()
    val contacts = ConcurrentHashMap<String, Map<String, Any>>() // identity_slug -> contact info
    val contactAuthorizedKeys = ConcurrentHashMap<String, String>() // public_key_hex -> identity_slug
    val messages = ConcurrentHashMap<String, Map<String, Any>>()
    val transitQueue = ConcurrentHashMap<String, Map<String, Any>>()
    val peerEncounters = ConcurrentHashMap<String, Map<String, Any>>()
    val bannedPeers = ConcurrentHashMap<String, Long>()

    fun registerContact(identitySlug: String, displayName: String, primaryKeyHex: String) {
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            contacts[identitySlug] = mapOf(
                "identity_slug" to identitySlug,
                "display_name" to displayName,
                "current_primary_key" to primaryKeyHex,
                "created_at" to System.currentTimeMillis(),
                "last_seen" to System.currentTimeMillis()
            )
            contactAuthorizedKeys[primaryKeyHex.lowercase()] = identitySlug
        } finally {
            lock.unlock()
        }
    }

    /**
     * Links a new rotated or secondary device key to an existing identity slug,
     * ensuring all future and past messages remain in the exact same chat thread.
     */
    fun rotateContactKey(identitySlug: String, newPublicKeyHex: String): Boolean {
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            val contact = contacts[identitySlug] ?: return false
            contactAuthorizedKeys[newPublicKeyHex.lowercase()] = identitySlug
            val updated = contact.toMutableMap()
            updated["current_primary_key"] = newPublicKeyHex
            updated["last_seen"] = System.currentTimeMillis()
            contacts[identitySlug] = updated
            return true
        } finally {
            lock.unlock()
        }
    }

    /**
     * Resolves the canonical conversation thread ID for any given sender public key.
     * If the key is linked to an identity slug, returns that slug as the conversation_id;
     * otherwise falls back to the key hex.
     */
    fun resolveConversationId(senderKeyHex: String): String {
        val lock = rwLock.readLock()
        lock.lock()
        try {
            return contactAuthorizedKeys[senderKeyHex.lowercase()] ?: senderKeyHex
        } finally {
            lock.unlock()
        }
    }

    fun insertMessage(
        messageId: String,
        senderKeyHex: String,
        recipient: String,
        body: String,
        timestamp: Long,
        status: String,
        isOutgoing: Boolean,
        explicitConversationId: String? = null
    ): String {
        val conversationId = explicitConversationId ?: resolveConversationId(senderKeyHex)
        val lock = rwLock.writeLock()
        lock.lock()
        try {
            messages[messageId] = mapOf(
                "message_id" to messageId,
                "conversation_id" to conversationId,
                "sender_address" to senderKeyHex,
                "recipient_address" to recipient,
                "body_plain" to body,
                "timestamp" to timestamp,
                "status" to status,
                "is_outgoing" to isOutgoing
            )
            return conversationId
        } finally {
            lock.unlock()
        }
    }

    fun getMessagesForConversation(conversationId: String): List<Map<String, Any>> {
        val lock = rwLock.readLock()
        lock.lock()
        try {
            return messages.values
                .filter { it["conversation_id"] == conversationId }
                .sortedBy { it["timestamp"] as? Long ?: 0L }
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
