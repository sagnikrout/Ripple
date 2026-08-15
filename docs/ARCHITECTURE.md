# Ripple Architectural Blueprint & Protocol Specification

## 1. System Overview & Operational Model

Ripple is a zero-knowledge, delay-tolerant decentralized messaging system designed to guarantee reliable message delivery across five operational domains:

```
+---------------------------------------------------------------------------------------------------+
|                            TIERED TRANSPORT CONVERGENCE HIERARCHY                                |
+---------------------------------------------------------------------------------------------------+
| [Tier 1: WebRTC Direct P2P]   | [Tier 2: Wi-Fi Direct/SoftAP] | [Tier 3: BLE GATT Mesh]           |
| Low-latency RTCDataChannel    | High-speed TCP (Port 8765)    | Custom 128-bit Service UUID       |
| Primary RTC-First Attempt     | Mutual diffs > 50 KB          | 250ms/1750ms Duty-Cycled Scanning |
+-------------------------------+-------------------------------+-----------------------------------+
| [Tier 4: Physical Data Muling Transport]                      | [Tier 5: Optical / Acoustic LOS]  |
| Epidemic Store-and-Forward across geographic regions          | 15 FPS Fountain UR QR Codes       |
| LRU deduplication, 50MB storage quota & 3-tier eviction       | 18-20 kHz FSK Acoustic Modem      |
+---------------------------------------------------------------+-----------------------------------+
```

---

## 2. Cryptographic Architecture & Zero-Knowledge Routing

### 2.1 Identity Generation
- **Signer Keypair**: Generated via Ed25519 (`crypto_sign_keypair`).
- **Encryption Keypair**: Generated via X25519 (`crypto_box_keypair`).
- **Node Address**: 16 bytes derived from $\text{BLAKE3}(\text{Ed25519 Public Key})[0..15]$.
- **Mnemonic ID**: 3-part slug (`adjective-scientist-pokemon`).
- **Deterministic Key Derivation**:
  $$\text{Seed}_{32} = \text{SHA-256}(\text{id\_slug} \parallel \text{":"} \parallel \text{user\_secret})$$

### 2.2 End-to-End Encryption & Forward Secrecy
1. Fresh ephemeral X25519 keypair $(sk_{eph}, pk_{eph})$ per message.
2. Authenticated AEAD payload encryption via ChaCha20-Poly1305 with a 24-byte nonce.
3. Zero-knowledge routing: Intermediate relays only inspect truncated 16-byte hashes.

---

## 3. Wire Protocol & Binary Packet Structure

| Byte Offset | Field Name | Type | Size | Description |
|---|---|---|---|---|
| `0x00 - 0x01` | `magic_bytes` | `uint8[2]` | 2 Bytes | Fixed identifier `0x52, 0x50` ('RP') |
| `0x02` | `version` | `uint8` | 1 Byte | Protocol version `0x01` |
| `0x03` | `flags` | `uint8` | 1 Byte | Bitmask (`0x01` Direct, `0x02` Transit, `0x04` ACK, `0x08` Broadcast) |
| `0x04 - 0x13` | `message_id` | `uint8[16]` | 16 Bytes | $\text{BLAKE3}(\text{Ciphertext})[0..15]$ |
| `0x14 - 0x23` | `recipient_hash` | `uint8[16]` | 16 Bytes | Truncated $\text{BLAKE3}(\text{Recipient PubKey})[0..15]$ |
| `0x24 - 0x43` | `sender_pubkey` | `uint8[32]` | 32 Bytes | Sender X25519 Public Key |
| `0x44 - 0x63` | `ephemeral_pubkey`| `uint8[32]`| 32 Bytes | Ephemeral X25519 Public Key |
| `0x64 - 0x7B` | `nonce` | `uint8[24]` | 24 Bytes | ChaCha20-Poly1305 Cryptographic Nonce |
| `0x7C - 0x83` | `pow_nonce` | `uint64` | 8 Bytes | Little-Endian Hashcash Proof-of-Work Nonce |
| `0x84 - 0x8B` | `timestamp` | `uint64` | 8 Bytes | Unix epoch milliseconds (Little-Endian) |
| `0x8C` | `ttl_hops` | `uint8` | 1 Byte | Remaining hop counter (Default: 32) |
| `0x8D - 0x90` | `payload_length` | `uint32` | 4 Bytes | Length of ciphertext in bytes (Little-Endian) |
| `0x91 - ...` | `ciphertext` | `uint8[N]` | Variable | Encrypted Payload + Poly1305 Tag |

---

## 4. Hashcash Proof-of-Work Anti-Spam
$$\text{PoW\_Hash} = \text{BLAKE3}(MessageId_{16} \parallel RecipientHash_{16} \parallel Timestamp_{8} \parallel PoWNonce_{8})$$
- Standard: 10 leading zero bits.
- High Priority / Broadcast: 14 leading zero bits.
- Microsecond verification on relay reception.
