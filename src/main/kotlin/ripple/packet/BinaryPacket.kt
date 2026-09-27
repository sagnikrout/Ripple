package ripple.packet

import java.nio.ByteBuffer
import java.nio.ByteOrder
import ripple.crypto.Blake3

/**
 * 13-Field Binary Packet Data Model & Zero-Bloat Serializer.
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
    fun serialize(): ByteArray {
        val out = ByteArray(HEADER_SIZE + ciphertext.size)
        val buf = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)

        buf.put(magicBytes)
        buf.put(version)
        buf.put(flags)
        buf.put(messageId)
        buf.put(recipientHash)
        buf.put(senderPubkey)
        buf.put(ephemeralPubkey)
        buf.put(nonce)
        buf.putLong(powNonce)
        buf.putLong(timestamp)
        buf.put(ttlHops)
        buf.putInt(payloadLength)
        buf.put(ciphertext)

        return out
    }

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

        fun deserialize(data: ByteArray): BinaryPacket {
            require(data.size >= HEADER_SIZE) { "Data smaller than header size (145 bytes)" }
            val buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)

            val magic = ByteArray(2).also { buf.get(it) }
            if (magic[0] != 0x52.toByte() || magic[1] != 0x50.toByte()) {
                throw IllegalArgumentException("Invalid magic bytes: ${magic.contentToString()}")
            }

            val version = buf.get()
            if (version != 0x01.toByte()) {
                throw IllegalArgumentException("Unsupported version: $version")
            }

            val flags = buf.get()
            val messageId = ByteArray(16).also { buf.get(it) }
            val recipientHash = ByteArray(16).also { buf.get(it) }
            val senderPubkey = ByteArray(32).also { buf.get(it) }
            val ephemeralPubkey = ByteArray(32).also { buf.get(it) }
            val nonce = ByteArray(24).also { buf.get(it) }
            val powNonce = buf.getLong()
            val timestamp = buf.getLong()
            val ttlHops = buf.get()
            val payloadLength = buf.getInt()

            if (buf.remaining() != payloadLength) {
                throw IllegalArgumentException("Payload length mismatch: expected $payloadLength, remaining ${buf.remaining()}")
            }

            val ciphertext = ByteArray(payloadLength).also { buf.get(it) }
            val computedId = Blake3.hash16(ciphertext)
            if (!computedId.contentEquals(messageId)) {
                throw IllegalArgumentException("Message ID does not match BLAKE3(ciphertext)")
            }

            return BinaryPacket(
                magicBytes = magic,
                version = version,
                flags = flags,
                messageId = messageId,
                recipientHash = recipientHash,
                senderPubkey = senderPubkey,
                ephemeralPubkey = ephemeralPubkey,
                nonce = nonce,
                powNonce = powNonce,
                timestamp = timestamp,
                ttlHops = ttlHops,
                payloadLength = payloadLength,
                ciphertext = ciphertext
            )
        }
    }
}

/**
 * Compatibility wrapper forwarder for legacy callers.
 */
object PacketSerializer {
    const val HEADER_SIZE = BinaryPacket.HEADER_SIZE
    fun serialize(packet: BinaryPacket): ByteArray = packet.serialize()
    fun deserialize(data: ByteArray): BinaryPacket = BinaryPacket.deserialize(data)
}
