package ripple.packet

import java.nio.ByteBuffer
import java.nio.ByteOrder
import ripple.crypto.Blake3

/**
 * Strict Little-Endian Binary Packet Serializer & Deserializer.
 * Serializes 13 fields into a 145-byte fixed header + variable ciphertext.
 */
object PacketSerializer {

    const val HEADER_SIZE = 145

    fun serialize(packet: BinaryPacket): ByteArray {
        val out = ByteArray(HEADER_SIZE + packet.ciphertext.size)
        val buf = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)

        buf.put(packet.magicBytes)
        buf.put(packet.version)
        buf.put(packet.flags)
        buf.put(packet.messageId)
        buf.put(packet.recipientHash)
        buf.put(packet.senderPubkey)
        buf.put(packet.ephemeralPubkey)
        buf.put(packet.nonce)
        buf.putLong(packet.powNonce)
        buf.putLong(packet.timestamp)
        buf.put(packet.ttlHops)
        buf.putInt(packet.payloadLength)
        buf.put(packet.ciphertext)

        return out
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
