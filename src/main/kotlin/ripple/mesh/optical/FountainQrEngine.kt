package ripple.mesh.optical

import java.util.Random

/**
 * Luby Transform / Uniform Resource (UR) Fountain Code Animated QR Engine (15 FPS).
 */
class FountainQrEngine(val blockSize: Int = 128) {

    data class FountainFrame(val k: Int, val chosenIndices: Set<Int>, val payload: ByteArray)

    fun encode(data: ByteArray, seed: Long): FountainFrame {
        val k = Math.max(1, (data.size + blockSize - 1) / blockSize)
        val blocks = Array(k) { i ->
            val start = i * blockSize
            val len = Math.min(blockSize, data.size - start)
            val block = ByteArray(blockSize)
            System.arraycopy(data, start, block, 0, len)
            block
        }

        val rng = Random(seed)
        val degree = if (k == 1) 1 else 1 + rng.nextInt(Math.min(k, 3))
        val chosen = HashSet<Int>()
        while (chosen.size < degree) {
            chosen.add(rng.nextInt(k))
        }

        val out = ByteArray(blockSize)
        for (idx in chosen) {
            val src = blocks[idx]
            for (b in 0 until blockSize) {
                out[b] = (out[b].toInt() xor src[b].toInt()).toByte()
            }
        }

        return FountainFrame(k, chosen, out)
    }

    class Decoder(val k: Int, val blockSize: Int = 128) {
        private val resolved = HashMap<Int, ByteArray>()
        private val equations = ArrayList<Pair<HashSet<Int>, ByteArray>>()

        fun ingestFrame(frame: FountainFrame): ByteArray? {
            if (resolved.size == k) return getResult()

            val indices = HashSet(frame.chosenIndices)
            val payload = frame.payload.clone()

            for ((rIdx, rData) in resolved) {
                if (indices.remove(rIdx)) {
                    for (b in 0 until blockSize) {
                        payload[b] = (payload[b].toInt() xor rData[b].toInt()).toByte()
                    }
                }
            }

            if (indices.size == 1) {
                val idx = indices.first()
                resolved[idx] = payload
                reduceEquations()
            } else if (indices.isNotEmpty()) {
                equations.add(Pair(indices, payload))
            }

            return if (resolved.size == k) getResult() else null
        }

        private fun reduceEquations() {
            var progress = true
            while (progress) {
                progress = false
                val iterator = equations.iterator()
                while (iterator.hasNext()) {
                    val eq = iterator.next()
                    for ((rIdx, rData) in resolved) {
                        if (eq.first.remove(rIdx)) {
                            for (b in 0 until blockSize) {
                                eq.second[b] = (eq.second[b].toInt() xor rData[b].toInt()).toByte()
                            }
                            progress = true
                        }
                    }
                    if (eq.first.size == 1) {
                        val idx = eq.first.first()
                        resolved[idx] = eq.second
                        iterator.remove()
                        progress = true
                        break
                    }
                }
            }
        }

        private fun getResult(): ByteArray {
            val total = ByteArray(k * blockSize)
            for (i in 0 until k) {
                val part = resolved[i] ?: ByteArray(blockSize)
                System.arraycopy(part, 0, total, i * blockSize, blockSize)
            }
            return total
        }
    }
}
