package ripple.packet

import ripple.crypto.Blake3

/**
 * 13-Field Binary Packet Data Model.
 * Header: Exactly 145 Bytes (Little-Endian, zero padded).
 */
data class BinaryPacket(
    val magicBytes: ByteArray = byteArrayOf(0x52, 0x50), // 'RP' (2B)
    val version: Byte = 0x01,                           // (1B)
    val flags: Byte = FLAG_TRANSIT,                     // (1B)
    val messageId: ByteArray,                           // BLAKE3(ciphertext)[0..15] (16B)
    val recipientHash: ByteArray,                       // Truncated BLAKE3(Recipient X25519) (16B)
    val senderPubkey: ByteArray,                        // Sender X25519 PubKey (32B)
    val ephemeralPubkey: ByteArray,                     // Ephemeral Forward-Secrecy PubKey (32B)
    val nonce: ByteArray,                               // ChaCha20-Poly1305 Nonce (24B)
    val powNonce: Long,                                 // uint64_le Hashcash Nonce (8B)
    val timestamp: Long,                                // uint64_le Unix Epoch ms (8B)
    val ttlHops: Byte = 32,                             // Time-To-Live hop counter (1B)
    val payloadLength: Int,                             // uint32_le Ciphertext Length (4B)
    val ciphertext: ByteArray                           // Encrypted Payload + Poly1305 Tag (Var)
) {
    companion object {
        const val FLAG_DIRECT: Byte = 0x01
        const val FLAG_TRANSIT: Byte = 0x02
        const val FLAG_ACK: Byte = 0x04
        const val FLAG_BROADCAST: Byte = 0x08
        const val HEADER_SIZE = 145

        fun createOutgoing(
            recipientHash: ByteArray,
            senderPubkey: ByteArray,
            ephemeralPubkey: ByteArray,
            nonce: ByteArray,
            powNonce: Long,
            ciphertext: ByteArray,
            flags: Byte = FLAG_TRANSIT,
            ttlHops: Byte = 32,
            timestamp: Long = System.currentTimeMillis()
        ): BinaryPacket {
            val msgId = Blake3.hash16(ciphertext)
            return BinaryPacket(
                magicBytes = byteArrayOf(0x52, 0x50),
                version = 0x01,
                flags = flags,
                messageId = msgId,
                recipientHash = recipientHash,
                senderPubkey = senderPubkey,
                ephemeralPubkey = ephemeralPubkey,
                nonce = nonce,
                powNonce = powNonce,
                timestamp = timestamp,
                ttlHops = ttlHops,
                payloadLength = ciphertext.size,
                ciphertext = ciphertext
            )
        }
    }
}
