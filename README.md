# Ripple

> **Zero-Knowledge, Delay-Tolerant Decentralized Mesh Messenger**  
> Engineered for extreme environments: remote wilderness blackouts and hyper-dense metro gatherings. Operates completely peer-to-peer without cellular towers, satellite subscriptions, or central servers.

[Web Simulator & Messenger](src/gui/index.html) | [Architecture Blueprint](docs/ARCHITECTURE.md) | [Encrypted Voice Calling (SecureVoice)](https://sagnikrout.github.io/secure-voice) | [Latest Android APK](dist/ripple.apk)

---

## 1. System Overview

Ripple is a sovereign, zero-knowledge, delay-tolerant mobile communication platform. It unifies high-speed peer-to-peer data links with multi-hop physical data muling across five operational transport domains:

```
+---------------------------------------------------------------------------------------------------+
|                            TIERED TRANSPORT CONVERGENCE HIERARCHY                                |
+---------------------------------------------------------------------------------------------------+
| [Tier 1: WebRTC Direct P2P]   | [Tier 2: Wi-Fi Direct/SoftAP] | [Tier 3: BLE GATT Mesh]           |
| Low-latency RTCDataChannel    | High-speed TCP (Port 8765)    | Custom 128-bit Service UUID       |
| In-App HD P2P Video/Audio Call| Mutual diffs > 50 KB          | 250ms/1750ms Duty-Cycled Scanning |
+-------------------------------+-------------------------------+-----------------------------------+
| [Tier 4: Physical Data Muling Transport]                      | [Tier 5: Optical / Acoustic LOS]  |
| Epidemic Store-and-Forward across geographic regions          | 15 FPS Fountain UR QR Codes       |
| LRU deduplication, 50MB storage quota & 3-tier eviction       | 18-20 kHz FSK Acoustic Modem      |
+---------------------------------------------------------------+-----------------------------------+
```

### 📹 In-App High-Definition Video Calling & Companion Voice App
- **Native In-App P2P Video Calling**: High-definition encrypted video & audio calls using WebRTC DTLS-SRTP, supporting adaptive resolutions (HD 720p vs Low-Bandwidth Mesh 360p), camera/mic controls, and Picture-in-Picture (PiP).
- **Companion Audio Calling**: For dedicated low-bandwidth networks (2G/EDGE) using Google Lyra v2 neural speech coding and WebRTC, see **[SecureVoice](https://sagnikrout.github.io/secure-voice)**.

---

## 2. Key Capabilities

### 🛡️ Sovereign Identity & Zero-Knowledge Routing
- **Deterministic Key Derivation**: Private 32-byte seed derived via $\text{SHA-256}(\text{id\_slug} \parallel \text{":"} \parallel \text{user\_secret})$.
- **Human-Readable Slugs**: 3-part mnemonic IDs (`adjective-scientist-pokemon`, e.g., `calm-raman-lucario`).
- **Persistent Chat-Threading Across Key Rotation**: Contacts are indexed by canonical `identity_slug`. Migrating phones or rotating device keys preserves ongoing conversation threads without fragmentation.
- **Zero-Knowledge Wire Headers**: Relays inspect only truncated 16-byte BLAKE3 hashes (`recipient_hash` and `message_id`), having zero visibility into sender, recipient, or plaintext payloads.

### 🔐 Cryptographic Core & Perfect Forward Secrecy
- **End-to-End Encryption**: Authenticated counter-mode (CTR + 128-bit MAC) AEAD payload encryption with a 24-byte cryptographic nonce, preventing keystream repetition.
- **Per-Message Ephemeral Ratchet**: Fresh ephemeral X25519 keypair $(sk_{\text{eph}}, pk_{\text{eph}})$ generated for each packet.
- **Microsecond Anti-Spam (Hashcash PoW)**: Stateless BLAKE3 proof-of-work puzzle (10 zero bits standard, 14 zero bits priority/broadcast) verified in under $50\ \mu\text{s}$.

### 💬 Delightful, Resilient Message Feed
- **Rich Media Support**: Send encrypted inline audio voice notes with waveform visualizers and instant playback; attach field images and situation maps.
- **Instant Search & Filter**: Sub-millisecond conversation and message filtering directly from the search bar.
- **Emergency SOS Broadcast**: Instant high-priority distress alerts dispatched across all active nodes with GPS/grid coordinates.
- **Emoji Reactions**: Expressive one-tap message reactions (👍, ❤️, ⚡, 🛡️, 📡).

### ⚡ Extreme Environment Adaptation
- **Dense Metro & Stadium Mode**: Limits gossip fan-out to $x = 3$ and inter-relay debounce to $y = 45\text{s}$ with 32-slot exponential jittered backoff to prevent RF saturation and broadcast storms.
- **Remote Wilderness & Blackout Mode**: Unrestricted fan-out ($x = 15+$), store-and-forward physical muling retention up to 14 days, and an automated 2% deep-sleep duty cycle after 30 minutes of RF silence.
- **Instant ACK Auto-Purging**: Recipient cryptographically signs delivery ACKs; intermediate transit queues instantly drop delivered packets.

### 🔋 3-Stage Smartphone Battery Preservation
- **Normal Tier ($> 30\%$ Battery)**: 12.5% BLE scan duty cycle ($250\text{ms}$ active / $1{,}750\text{ms}$ sleep).
- **Battery Saver Tier ($15\% - 30\%$ Battery)**: 5% duty cycle ($100\text{ms}$ active / $1{,}900\text{ms}$ sleep), Wi-Fi Direct disabled.
- **Deep Freeze Tier ($< 15\%$ Battery)**: Scanning halted; operates as a passive BLE beacon advertiser ($\sim 0.2\text{ mA}$).

---

## 3. Directory Layout

```text
Ripple/
├── build_apk.py                  # Standalone zero-bloat Android packaging pipeline
├── ripple.spec                   # PyInstaller standalone desktop bundle spec
├── docs/
│   └── ARCHITECTURE.md           # Protocol specification & wire format blueprint
├── src/
│   ├── cli/
│   │   └── ripple_node.py        # Desktop CLI daemon & HTTP server node
│   ├── gui/                      # SMS-style responsive WebView GUI
│   │   ├── app.js                # State management, video calls, rich feed & modals
│   │   ├── crypto.js             # Client-side CTR AEAD, PoW & WebRTC manager
│   │   ├── index.html            # Web GUI layout with in-app video calls & SecureVoice link
│   │   └── styles.css            # Dark high-contrast glassmorphic design system
│   └── main/
│       ├── java/net/ripple/mesh/ # Android native runtime bindings
│       │   ├── MainActivity.java
│       │   ├── bridge/RippleWebBridge.java
│       │   └── service/RippleForegroundService.java
│       └── kotlin/ripple/        # Pure Kotlin cryptographic & mesh engine
│           ├── crypto/           # BLAKE3, CryptoManager, Hashcash, Identity
│           ├── db/               # Thread-safe database & quota manager
│           ├── mesh/             # BLE, Wi-Fi Direct, Ultrasonic, Fountain QR
│           ├── packet/           # 145-byte Little-Endian wire serializer & chunker
│           └── sync/             # 4,096-bit anti-entropy Bloom filter
└── test/
    └── sim/                      # End-to-end Python protocol simulation & resilience suite
        ├── run_simulation.py     # 11 core architecture protocol tests
        └── edge_cases_sim.py     # 12 advanced edge-case resilience tests
```

---

## 4. Verification & Testing

Run the full automated test suite verifying identities, WebRTC fallback, Little-Endian binary packets, Bloom filters, DTN muling, ultrasonic audio, Fountain QR codes, and key rotation threading:

```powershell
# Core protocol test suite (11 tests)
python test/sim/run_simulation.py

# Advanced resilience & edge-case test suite (12 tests)
python test/sim/edge_cases_sim.py

# CLI benchmark verification
python src/cli/ripple_node.py --bench

# Build full-featured Android APK
python build_apk.py
```

---

## 5. Running the Application

### Interactive Desktop GUI
```powershell
python src/cli/ripple_node.py --gui
```
Launches the responsive local web interface at `http://127.0.0.1:8765/` with two simulated nodes (Alice & Bob), WebRTC P2P video calling, and Split View mode.

### Android Device Deployment
Install the pre-built unsigned/debug APK:
```powershell
adb install -r dist/ripple.apk
```
*Requires Android 12+ (API 31–35).*
