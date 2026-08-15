package ripple.mesh.wifi

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * High-Speed Wi-Fi Direct / SoftAP TCP Socket Streaming Engine on Port 8765.
 * Triggered when mutual inventory diffs exceed 50 KB.
 */
class WifiDirectManager(
    val port: Int = 8765,
    val onPacketReceived: (ByteArray) -> Unit
) {

    private val isRunning = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private val executor = Executors.newCachedThreadPool()

    fun startServer() {
        if (isRunning.getAndSet(true)) return

        executor.submit {
            try {
                serverSocket = ServerSocket(port)
                while (isRunning.get()) {
                    val client = serverSocket?.accept() ?: break
                    executor.submit { handleClient(client) }
                }
            } catch (e: Exception) {
                // Socket teardown
            }
        }
    }

    private fun handleClient(socket: Socket) {
        socket.use { s ->
            val dis = DataInputStream(s.getInputStream())
            while (isRunning.get()) {
                val len = try { dis.readInt() } catch (e: Exception) { break }
                if (len <= 0 || len > 50 * 1024 * 1024) {
                    break // Security guard against corrupted/oversized packet framing
                }
                val buffer = ByteArray(len)
                dis.readFully(buffer)
                onPacketReceived(buffer)
            }
        }
    }

    fun sendBundleStream(targetIp: String, packets: List<ByteArray>): Boolean {
        return try {
            Socket(targetIp, port).use { socket ->
                val dos = DataOutputStream(socket.getOutputStream())
                for (pkt in packets) {
                    dos.writeInt(pkt.size)
                    dos.write(pkt)
                }
                dos.flush()
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    fun stopServer() {
        isRunning.set(false)
        try { serverSocket?.close() } catch (e: Exception) {}
        executor.shutdownNow()
    }
}
