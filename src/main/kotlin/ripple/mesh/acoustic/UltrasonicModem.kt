package ripple.mesh.acoustic

import kotlin.math.cos
import kotlin.math.sin

/**
 * Ultrasonic BFSK Acoustic Modem (18.5 kHz / 19.5 kHz, 100 baud)
 * with Goertzel Discrete Fourier Demodulator.
 */
object UltrasonicModem {

    const val SAMPLE_RATE = 44100
    const val MARK_FREQ = 18500.0 // Binary '1'
    const val SPACE_FREQ = 19500.0 // Binary '0'
    const val BAUD_RATE = 100

    fun modulate(data: ByteArray): FloatArray {
        val samplesPerBit = SAMPLE_RATE / BAUD_RATE
        val fullData = byteArrayOf(0xAA.toByte()) + data // Preamble
        val totalSamples = fullData.size * 8 * samplesPerBit
        val audio = FloatArray(totalSamples)

        var sampleIdx = 0
        for (byte in fullData) {
            for (bitIdx in 7 downTo 0) {
                val bit = (byte.toInt() ushr bitIdx) and 1
                val freq = if (bit == 1) MARK_FREQ else SPACE_FREQ
                for (s in 0 until samplesPerBit) {
                    val t = s.toDouble() / SAMPLE_RATE
                    audio[sampleIdx++] = sin(2.0 * Math.PI * freq * t).toFloat()
                }
            }
        }
        return audio
    }

    fun goertzelPower(samples: FloatArray, offset: Int, length: Int, targetFreq: Double): Double {
        val k = (0.5 + (length * targetFreq / SAMPLE_RATE)).toInt()
        val omega = (2.0 * Math.PI * k) / length
        val coeff = 2.0 * cos(omega)

        var q0: Double
        var q1 = 0.0
        var q2 = 0.0

        for (i in 0 until length) {
            q0 = coeff * q1 - q2 + samples[offset + i]
            q2 = q1
            q1 = q0
        }
        return q1 * q1 + q2 * q2 - q1 * q2 * coeff
    }

    fun demodulate(audio: FloatArray): ByteArray {
        val samplesPerBit = SAMPLE_RATE / BAUD_RATE
        val totalBits = audio.size / samplesPerBit
        val bits = IntArray(totalBits)

        for (i in 0 until totalBits) {
            val pMark = goertzelPower(audio, i * samplesPerBit, samplesPerBit, MARK_FREQ)
            val pSpace = goertzelPower(audio, i * samplesPerBit, samplesPerBit, SPACE_FREQ)
            bits[i] = if (pMark > pSpace) 1 else 0
        }

        val preamble = intArrayOf(1, 0, 1, 0, 1, 0, 1, 0)
        var startIdx = -1
        for (i in 0..bits.size - 8) {
            var match = true
            for (j in 0 until 8) {
                if (bits[i + j] != preamble[j]) {
                    match = false
                    break
                }
            }
            if (match) {
                startIdx = i + 8
                break
            }
        }

        if (startIdx == -1) return ByteArray(0)

        val remBits = bits.copyOfRange(startIdx, bits.size)
        val numBytes = remBits.size / 8
        val out = ByteArray(numBytes)
        for (b in 0 until numBytes) {
            var v = 0
            for (i in 0 until 8) {
                v = (v shl 1) or remBits[b * 8 + i]
            }
            out[b] = v.toByte()
        }
        return out
    }
}
