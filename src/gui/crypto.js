const ADJECTIVES = ["swift", "quiet", "calm", "bold", "silent", "clever", "keen", "brave", "patient", "sharp", "lucid", "nimble", "valiant", "subtle", "serene"];
const SCIENTISTS = ["turing", "curie", "raman", "feynman", "bohr", "darwin", "franklin", "pasteur", "mendel", "tesla", "einstein", "lovelace", "hawking", "fermi", "bose"];
const POKEMON = ["pikachu", "gengar", "lucario", "eevee", "charizard", "mewtwo", "arcanine", "snorlax", "bulbasaur", "jolteon", "dragonite", "lapras", "squirtle", "umbreon", "rayquaza"];

function generateRandomSlug() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const sci = SCIENTISTS[Math.floor(Math.random() * SCIENTISTS.length)];
    const pok = POKEMON[Math.floor(Math.random() * POKEMON.length)];
    return `${adj}-${sci}-${pok}`;
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
    const clean = hex.replace(/[^0-9a-fA-F]/g, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
    }
    return bytes;
}

function fastBlake3Sim(data) {
    let h1 = 0x811c9dc5, h2 = 0x27d4eb2f;
    for (let i = 0; i < data.length; i++) {
        const b = data[i];
        h1 = Math.imul(h1 ^ b, 0x01000193);
        h2 = Math.imul(h2 ^ ((b << 4) | (b >>> 4)), 0x5bd1e995);
    }
    const out = new Uint8Array(32);
    const view = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) {
        view.setUint32(i * 4, (h1 ^ (h2 + i * 0x9e3779b9)) >>> 0, true);
    }
    return out;
}

function countLeadingZeroBits(bytes) {
    let zeros = 0;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0) {
            zeros += 8;
        } else {
            zeros += Math.clz32(b) - 24;
            break;
        }
    }
    return zeros;
}

function solvePoW(messageId, recipientHash, timestamp, difficulty = 10) {
    const buf = new Uint8Array(16 + 16 + 8 + 8);
    buf.set(messageId, 0);
    buf.set(recipientHash, 16);
    const view = new DataView(buf.buffer);
    view.setBigUint64(32, BigInt(timestamp), true);

    let nonce = 0n;
    const t0 = performance.now();
    while (true) {
        view.setBigUint64(40, nonce, true);
        const hash = fastBlake3Sim(buf);
        if (countLeadingZeroBits(hash) >= difficulty) {
            const durationMs = performance.now() - t0;
            return { nonce: Number(nonce), durationMs, hash: bytesToHex(hash) };
        }
        nonce++;
        if (nonce > 500000n) {
            return { nonce: Number(nonce), durationMs: performance.now() - t0, hash: bytesToHex(hash) };
        }
    }
}

function verifyPoW(messageId, recipientHash, timestamp, nonce, requiredDifficulty = 10) {
    const buf = new Uint8Array(16 + 16 + 8 + 8);
    buf.set(messageId, 0);
    buf.set(recipientHash, 16);
    const view = new DataView(buf.buffer);
    view.setBigUint64(32, BigInt(timestamp), true);
    view.setBigUint64(40, BigInt(nonce), true);
    const hash = fastBlake3Sim(buf);
    return countLeadingZeroBits(hash) >= requiredDifficulty;
}

class BinaryPacket {
    constructor(options) {
        this.magicBytes = new Uint8Array([0x52, 0x50]);
        this.version = 0x01;
        this.flags = options.flags || 0x02;
        this.recipientHash = options.recipientHash;
        this.senderPubkey = options.senderPubkey;
        this.ephemeralPubkey = options.ephemeralPubkey || crypto.getRandomValues(new Uint8Array(32));
        this.nonce = options.nonce || crypto.getRandomValues(new Uint8Array(24));
        this.powNonce = options.powNonce || 0;
        this.timestamp = options.timestamp || Date.now();
        this.ttlHops = options.ttlHops !== undefined ? options.ttlHops : 32;
        this.ciphertext = options.ciphertext;
        this.payloadLength = this.ciphertext.length;
        this.messageId = options.messageId || fastBlake3Sim(this.ciphertext).slice(0, 16);
    }

    serialize() {
        const header = new Uint8Array(145);
        const view = new DataView(header.buffer);

        header[0] = 0x52;
        header[1] = 0x50;
        header[2] = this.version;
        header[3] = this.flags;
        header.set(this.messageId, 4);
        header.set(this.recipientHash, 20);
        header.set(this.senderPubkey, 36);
        header.set(this.ephemeralPubkey, 68);
        header.set(this.nonce, 100);
        view.setBigUint64(124, BigInt(this.powNonce), true);
        view.setBigUint64(132, BigInt(this.timestamp), true);
        header[140] = this.ttlHops;
        view.setUint32(141, this.payloadLength, true);

        const full = new Uint8Array(145 + this.payloadLength);
        full.set(header, 0);
        full.set(this.ciphertext, 145);
        return full;
    }

    static deserialize(data) {
        if (data.length < 145) throw new Error("Packet smaller than 145 bytes");
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        if (data[0] !== 0x52 || data[1] !== 0x50) throw new Error("Invalid magic bytes");
        const flags = data[3];
        const messageId = data.slice(4, 20);
        const recipientHash = data.slice(20, 36);
        const senderPubkey = data.slice(36, 68);
        const ephemeralPubkey = data.slice(68, 100);
        const nonce = data.slice(100, 124);
        const powNonce = Number(view.getBigUint64(124, true));
        const timestamp = Number(view.getBigUint64(132, true));
        const ttlHops = data[140];
        const payloadLength = view.getUint32(141, true);

        const ciphertext = data.slice(145, 145 + payloadLength);
        return new BinaryPacket({
            flags,
            messageId,
            recipientHash,
            senderPubkey,
            ephemeralPubkey,
            nonce,
            powNonce,
            timestamp,
            ttlHops,
            ciphertext
        });
    }
}

class MeshRadio {
    constructor(nodeId) {
        this.nodeId = nodeId;
        this.channel = new BroadcastChannel('ripple_mesh_network');
        this.listeners = [];

        this.channel.onmessage = (event) => {
            const { senderId, packetHex, type, transport } = event.data;
            if (senderId !== this.nodeId) {
                this.listeners.forEach(fn => fn({ senderId, packetHex, type, transport }));
            }
        };
    }

    broadcast(type, packetHex, transport = "BLE_GATT") {
        this.channel.postMessage({
            senderId: this.nodeId,
            packetHex,
            type,
            transport,
            timestamp: Date.now()
        });
    }

    onPacket(fn) {
        this.listeners.push(fn);
    }
}

class WebRtcP2PManager {
    constructor(nodeId, radio) {
        this.nodeId = nodeId;
        this.radio = radio;
        this.peerConnection = null;
        this.dataChannel = null;
        this.isConnected = false;
        this.forceOfflineFallback = false;

        this.setupSignaling();
    }

    setupSignaling() {
        this.radio.onPacket(async ({ senderId, packetHex, type }) => {
            if (type === "RTC_OFFER") {
                await this.handleOffer(senderId, JSON.parse(packetHex));
            } else if (type === "RTC_ANSWER") {
                await this.handleAnswer(JSON.parse(packetHex));
            } else if (type === "RTC_ICE") {
                if (this.peerConnection && !this.forceOfflineFallback) {
                    try {
                        await this.peerConnection.addIceCandidate(JSON.parse(packetHex));
                    } catch (e) {}
                }
            }
        });
    }

    async initiateConnection(targetPeerId) {
        if (this.forceOfflineFallback) return;

        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            this.dataChannel = this.peerConnection.createDataChannel("ripple-p2p", { ordered: true });
            this.setupDataChannelEvents(this.dataChannel);

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.radio.broadcast("RTC_ICE", JSON.stringify(event.candidate));
                }
            };

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.radio.broadcast("RTC_OFFER", JSON.stringify(offer));
        } catch (e) {
            console.warn("WebRTC initialization error:", e);
        }
    }

    async handleOffer(senderId, offer) {
        if (this.forceOfflineFallback) return;

        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannelEvents(this.dataChannel);
            };

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.radio.broadcast("RTC_ICE", JSON.stringify(event.candidate));
                }
            };

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.radio.broadcast("RTC_ANSWER", JSON.stringify(answer));
        } catch (e) {
            console.warn("WebRTC handleOffer error:", e);
        }
    }

    async handleAnswer(answer) {
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    setupDataChannelEvents(channel) {
        channel.onopen = () => {
            this.isConnected = true;
            if (window.updateRtcStatus) window.updateRtcStatus(true);
        };
        channel.onclose = () => {
            this.isConnected = false;
            if (window.updateRtcStatus) window.updateRtcStatus(false);
        };
        channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (window.onRtcDirectMessage) {
                window.onRtcDirectMessage(data);
            }
        };
    }

    sendRtcFirst(payloadObj, fallbackFn) {
        if (this.isConnected && this.dataChannel && this.dataChannel.readyState === 'open' && !this.forceOfflineFallback) {
            try {
                this.dataChannel.send(JSON.stringify(payloadObj));
                return { success: true, transport: "WEBRTC_DIRECT" };
            } catch (e) {
                console.warn("RTC send failed, executing fallback:", e);
            }
        }

        fallbackFn();
        return { success: true, transport: "BLE_GATT_FALLBACK" };
    }
}

window.RippleCrypto = {
    generateRandomSlug,
    bytesToHex,
    hexToBytes,
    fastBlake3Sim,
    solvePoW,
    verifyPoW,
    BinaryPacket,
    MeshRadio,
    WebRtcP2PManager
};
