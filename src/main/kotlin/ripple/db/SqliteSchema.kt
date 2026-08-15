package ripple.db

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
            received_at INTEGER NOT NULL
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
}
