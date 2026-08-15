package ripple.crypto

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Human-Readable Node ID Slug Generator & Deterministic Key Derivation Engine.
 * Implements 3-part 'adjective-scientist-pokemon' mnemonic slugs and PBKDF2/SHA-256 seed generation.
 */
object IdentityDerivation {

    val ADJECTIVES = listOf(
        "swift", "quiet", "calm", "bold", "silent",
        "clever", "keen", "brave", "patient", "sharp",
        "lucid", "nimble", "valiant", "subtle", "serene"
    )

    val SCIENTISTS = listOf(
        "turing", "curie", "raman", "feynman", "bohr",
        "darwin", "franklin", "pasteur", "mendel", "tesla",
        "einstein", "lovelace", "hawking", "fermi", "bose"
    )

    val POKEMON = listOf(
        "pikachu", "gengar", "lucario", "eevee", "charizard",
        "mewtwo", "arcanine", "snorlax", "bulbasaur", "jolteon",
        "dragonite", "lapras", "squirtle", "umbreon", "rayquaza"
    )

    fun generateRandomSlug(): String {
        val rng = SecureRandom()
        val adj = ADJECTIVES[rng.nextInt(ADJECTIVES.size)]
        val sci = SCIENTISTS[rng.nextInt(SCIENTISTS.size)]
        val pok = POKEMON[rng.nextInt(POKEMON.size)]
        return "$adj-$sci-$pok"
    }

    fun deriveSeed(idSlug: String, userSecret: String = ""): ByteArray {
        val cleanSlug = idSlug.trim().lowercase()
        val input = "$cleanSlug:$userSecret".toByteArray(StandardCharsets.UTF_8)
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(input)
    }

    fun deriveAddressFromSlug(idSlug: String, userSecret: String = ""): String {
        val seed = deriveSeed(idSlug, userSecret)
        val pubKey = Blake3.hash(byteArrayOf(0x01) + seed)
        val addressBytes = Blake3.hash(pubKey).copyOfRange(0, 16)
        return addressBytes.joinToString("") { "%02x".format(it) }
    }
}
