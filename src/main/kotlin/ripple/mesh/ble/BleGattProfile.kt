package ripple.mesh.ble

import java.util.UUID

/**
 * Custom 128-bit BLE GATT UUID Definitions for Ripple.
 */
object BleGattProfile {
    val SERVICE_UUID: UUID = UUID.fromString("0000RPL1-0000-1000-8000-00805F9B34FB")
    val CHAR_INVENTORY_READ: UUID = UUID.fromString("0000RPL2-0000-1000-8000-00805F9B34FB")
    val CHAR_PACKET_WRITE: UUID = UUID.fromString("0000RPL3-0000-1000-8000-00805F9B34FB")
    val CHAR_ACK_NOTIFY: UUID = UUID.fromString("0000RPL4-0000-1000-8000-00805F9B34FB")
}
