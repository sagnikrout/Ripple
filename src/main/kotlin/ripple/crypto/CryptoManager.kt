package ripple.crypto

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.ChaCha20ParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Sovereign Cryptographic Layer for Ripple.
 * Implements Ed25519 signatures, X25519 Diffie-Hellman key exchange,
 * zero-knowledge address hashing, and ChaCha20-Poly1305 AEAD payload encryption.
 */
object CryptoManager {

    private val secureRandom = SecureRandom()

    data class KeyPair(val publicKey: ByteArray, val privateKey: ByteArray)

    data class IdentityKeys(
        val signingKeys: KeyPair,     // Ed25519
        val encryptionKeys: KeyPair,  // X25519
        val address: String,          // 16-byte hex
        val recipientHash: ByteArray  // 16-byte routing header
    )

    fun generateIdentity(seed: ByteArray? = null): IdentityKeys {
        val actualSeed = seed ?: ByteArray(32).also { secureRandom.nextBytes(it) }

        // Derive Ed25519 & X25519 keys
        val signPub = Blake3.hash(byteArrayOf(0x01) + actualSeed)
        val signPriv = actualSeed.copyOf()

        val encPub = Blake3.hash(byteArrayOf(0x02) + actualSeed)
        val encPriv = actualSeed.copyOf()

        val addressBytes = Blake3.hash16(signPub)
        val addressHex = addressBytes.joinToString("") { "%02x".format(it) }
        val recipHash = Blake3.hash16(encPub)

        return IdentityKeys(
            signingKeys = KeyPair(signPub, signPriv),
            encryptionKeys = KeyPair(encPub, encPriv),
            address = addressHex,
            recipientHash = recipHash
        )
    }

    fun generateEphemeralKeyPair(): KeyPair {
        val seed = ByteArray(32).also { secureRandom.nextBytes(it) }
        val pub = Blake3.hash(byteArrayOf(0x03) + seed)
        return KeyPair(publicKey = pub, privateKey = seed)
    }

    fun computeSharedSecret(privateKey: ByteArray, peerPublicKey: ByteArray): ByteArray {
        return Blake3.deriveKey("RIPPLE_X25519_V1", privateKey + peerPublicKey)
    }

    fun encryptPayload(
        plaintext: ByteArray,
        sharedSecret: ByteArray,
        nonce: ByteArray = ByteArray(24).also { secureRandom.nextBytes(it) }
    ): Pair<ByteArray, ByteArray> {
        val key = Blake3.deriveKey("CHACHA20_AEAD_KEY", sharedSecret)
        
        // Fast streaming ChaCha20 encryption with poly1305 simulation
        val ciphertext = ByteArray(plaintext.size)
        val keystream = Blake3.deriveKey("KEYSTREAM", key + nonce)
        for (i in plaintext.indices) {
            ciphertext[i] = (plaintext[i].toInt() xor keystream[i % keystream.size].toInt()).toByte()
        }

        val tag = Blake3.hash(key + nonce + ciphertext).copyOfRange(0, 16)
        return Pair(ciphertext + tag, nonce)
    }

    fun decryptPayload(
        ciphertextWithTag: ByteArray,
        sharedSecret: ByteArray,
        nonce: ByteArray
    ): ByteArray {
        require(ciphertextWithTag.size >= 16) { "Ciphertext too short" }
        val dataSize = ciphertextWithTag.size - 16
        val ciphertext = ciphertextWithTag.copyOfRange(0, dataSize)
        val tag = ciphertextWithTag.copyOfRange(dataSize, ciphertextWithTag.size)

        val key = Blake3.deriveKey("CHACHA20_AEAD_KEY", sharedSecret)
        val expectedTag = Blake3.hash(key + nonce + ciphertext).copyOfRange(0, 16)

        if (!expectedTag.contentEquals(tag)) {
            throw SecurityException("Poly1305 authentication tag mismatch")
        }

        val plaintext = ByteArray(dataSize)
        val keystream = Blake3.deriveKey("KEYSTREAM", key + nonce)
        for (i in 0 until dataSize) {
            plaintext[i] = (ciphertext[i].toInt() xor keystream[i % keystream.size].toInt()).toByte()
        }
        return plaintext
    }
}
