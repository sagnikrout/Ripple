const NODES = {
    node1: {
        id: "node1",
        slug: "calm-raman-lucario",
        address: "9b42b774c6c6616c1c8ac91f47987b4d",
        name: "Alice (Node 1)",
        avatar: "A",
        activeContact: "node2"
    },
    node2: {
        id: "node2",
        slug: "swift-turing-pikachu",
        address: "84c9ef2b01ac32de5810ae3b145a90d2",
        name: "Bob (Node 2)",
        avatar: "B",
        activeContact: "node1"
    }
};

let currentNodeId = 'node1';
let isSplitView = false;
let radio = null;
let rtcManager = null;
let audioCtx = null;
let rtcFirstMode = true;

function getStoreKey(nodeId) {
    return `ripple_messages_${nodeId}`;
}

function loadMessages(nodeId) {
    const raw = localStorage.getItem(getStoreKey(nodeId));
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    if (nodeId === 'node1') {
        return [
            {
                id: "msg_init_1",
                sender: "swift-turing-pikachu",
                recipient: "calm-raman-lucario",
                text: "Hey Alice! Connected via Tier 1 WebRTC P2P DataChannel.",
                timestamp: Date.now() - 120000,
                status: "READ",
                transport: "WEBRTC_DIRECT",
                isOutgoing: false
            },
            {
                id: "msg_init_2",
                sender: "calm-raman-lucario",
                recipient: "swift-turing-pikachu",
                text: "Confirmed! Zero-knowledge E2EE active. Cascades to BLE mesh if offline.",
                timestamp: Date.now() - 60000,
                status: "DELIVERED",
                transport: "WEBRTC_DIRECT",
                isOutgoing: true
            }
        ];
    } else {
        return [
            {
                id: "msg_init_1",
                sender: "swift-turing-pikachu",
                recipient: "calm-raman-lucario",
                text: "Hey Alice! Connected via Tier 1 WebRTC P2P DataChannel.",
                timestamp: Date.now() - 120000,
                status: "READ",
                transport: "WEBRTC_DIRECT",
                isOutgoing: true
            },
            {
                id: "msg_init_2",
                sender: "calm-raman-lucario",
                recipient: "swift-turing-pikachu",
                text: "Confirmed! Zero-knowledge E2EE active. Cascades to BLE mesh if offline.",
                timestamp: Date.now() - 60000,
                status: "DELIVERED",
                transport: "WEBRTC_DIRECT",
                isOutgoing: false
            }
        ];
    }
}

function saveMessages(nodeId, msgs) {
    localStorage.setItem(getStoreKey(nodeId), JSON.stringify(msgs));
}

document.addEventListener('DOMContentLoaded', () => {
    initNode(currentNodeId);
    setupEventListeners();
});

function initNode(nodeId) {
    currentNodeId = nodeId;
    const node = NODES[nodeId];

    document.getElementById('myAvatar').textContent = node.avatar;
    document.getElementById('mySlugName').textContent = node.slug;
    document.getElementById('myAddressShort').textContent = `${node.address.substring(0, 8)}...`;

    const contactNode = NODES[node.activeContact];
    document.getElementById('activeChatAvatar').textContent = contactNode.avatar;
    document.getElementById('activeChatName').textContent = contactNode.slug;
    document.getElementById('activeChatAddress').textContent = `WebRTC P2P (Fallback: BLE GATT)`;

    if (radio) {
        radio.channel.close();
    }
    radio = new RippleCrypto.MeshRadio(node.slug);
    radio.onPacket(handleIncomingMeshPacket);

    rtcManager = new RippleCrypto.WebRtcP2PManager(node.slug, radio);
    rtcManager.forceOfflineFallback = !rtcFirstMode;

    window.updateRtcStatus = (isConnected) => {
        const dot = document.getElementById('radioPulseDot');
        const text = document.getElementById('meshRadioText');
        if (isConnected && rtcFirstMode) {
            dot.style.background = '#10b981';
            text.textContent = 'Tier 1: WebRTC Linked';
        } else {
            dot.style.background = '#3b82f6';
            text.textContent = 'Tier 3: BLE Mesh Active';
        }
    };

    window.onRtcDirectMessage = (data) => {
        handleIncomingDataPayload(data.packetHex, data.senderId, "WEBRTC_DIRECT");
    };

    if (nodeId === 'node1') {
        setTimeout(() => {
            rtcManager.initiateConnection(contactNode.slug);
        }, 500);
    }

    renderConversations();
    renderMessages();
}

function toggleTransportMode() {
    rtcFirstMode = !rtcFirstMode;
    const btn = document.getElementById('btnToggleTransport');
    const icon = document.getElementById('transportBadgeIcon');
    const text = document.getElementById('transportBadgeText');

    if (rtcFirstMode) {
        icon.textContent = '⚡';
        text.textContent = 'Tier 1: WebRTC';
        btn.style.borderColor = '#10b981';
        if (rtcManager) rtcManager.forceOfflineFallback = false;
        window.updateRtcStatus(rtcManager ? rtcManager.isConnected : false);
    } else {
        icon.textContent = '📡';
        text.textContent = 'Tier 3: BLE Mesh Only';
        btn.style.borderColor = '#f59e0b';
        if (rtcManager) rtcManager.forceOfflineFallback = true;
        window.updateRtcStatus(false);
    }
}

function switchDevice(nodeId) {
    document.getElementById('btnDevice1').classList.toggle('active', nodeId === 'node1');
    document.getElementById('btnDevice2').classList.toggle('active', nodeId === 'node2');
    document.getElementById('btnSplitView').classList.remove('active');
    
    const container = document.getElementById('appMainContainer');
    container.classList.remove('split-view-container');
    container.innerHTML = `
        <aside class="sidebar">
            <div class="sidebar-header">
                <div class="user-identity-card">
                    <div class="user-avatar" id="myAvatar">${NODES[nodeId].avatar}</div>
                    <div class="user-details">
                        <span class="user-slug-name" id="mySlugName">${NODES[nodeId].slug}</span>
                        <span class="user-address-sub" id="myAddressShort">${NODES[nodeId].address.substring(0, 8)}...</span>
                    </div>
                </div>
                <div class="search-bar-container">
                    <span class="search-icon">🔍</span>
                    <input type="text" id="searchInput" class="search-input" placeholder="Search conversations...">
                </div>
            </div>
            <div class="conversations-list" id="conversationsList"></div>
        </aside>
        <section class="chat-main">
            <div class="chat-header">
                <div class="chat-contact-info">
                    <div class="convo-avatar" id="activeChatAvatar">${NODES[NODES[nodeId].activeContact].avatar}</div>
                    <div>
                        <div class="chat-header-name" id="activeChatName">${NODES[NODES[nodeId].activeContact].slug}</div>
                        <div class="chat-header-status">
                            <span class="pulse-dot" style="width:6px; height:6px;"></span>
                            <span id="activeChatAddress">WebRTC P2P (Fallback: BLE Mesh)</span>
                        </div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="action-btn" onclick="openRadarModal()"><span>📡</span> Radar</button>
                    <button class="action-btn" onclick="openAcousticModal()"><span>🔊</span> Audio</button>
                    <button class="action-btn" onclick="openQrModal()"><span>📷</span> QR</button>
                </div>
            </div>
            <div class="messages-viewport" id="messagesViewport">
                <div class="time-divider">Tier 1: WebRTC Direct P2P ➔ Tier 2: Wi-Fi Direct ➔ Tier 3: BLE GATT Mesh</div>
            </div>
            <div class="pow-mining-banner" id="powMiningBanner" style="display: none;">
                <span id="powBannerText">⚡ Mining 10-bit Hashcash Proof-of-Work...</span>
                <span id="powBannerNonce">Nonce: 0</span>
            </div>
            <div class="chat-input-area">
                <textarea id="messageInput" class="chat-input-box" placeholder="Type message (WebRTC First, auto-fallback to BLE)..." rows="1"></textarea>
                <button class="send-btn" id="sendBtn" onclick="handleSendMessage()" title="Send Encrypted DTN Packet">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </section>
    `;

    setupEventListeners();
    initNode(nodeId);
}

function setupEventListeners() {
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }
}

function renderConversations() {
    const list = document.getElementById('conversationsList');
    if (!list) return;
    const node = NODES[currentNodeId];
    const contact = NODES[node.activeContact];
    const msgs = loadMessages(currentNodeId);
    const lastMsg = msgs[msgs.length - 1] || { text: "No messages", timestamp: Date.now() };

    list.innerHTML = `
        <div class="conversation-item active">
            <div class="convo-avatar">${contact.avatar}</div>
            <div class="convo-body">
                <div class="convo-top">
                    <span class="convo-name">${contact.slug}</span>
                    <span class="convo-time">${formatTime(lastMsg.timestamp)}</span>
                </div>
                <div class="convo-snippet">${lastMsg.text}</div>
            </div>
        </div>
        <div class="conversation-item" style="opacity: 0.6;">
            <div class="convo-avatar" style="background: linear-gradient(135deg, #f59e0b, #d97706);">D</div>
            <div class="convo-body">
                <div class="convo-top">
                    <span class="convo-name">DataMule_Dave (Relay)</span>
                    <span class="convo-time">10m ago</span>
                </div>
                <div class="convo-snippet">Transit relay node in BLE range</div>
            </div>
        </div>
    `;
}

function renderMessages() {
    const viewport = document.getElementById('messagesViewport');
    if (!viewport) return;
    const msgs = loadMessages(currentNodeId);

    let html = `<div class="time-divider">Tier 1: WebRTC Direct P2P ➔ Tier 2: Wi-Fi Direct ➔ Tier 3: BLE GATT Mesh</div>`;
    msgs.forEach(msg => {
        const rowClass = msg.isOutgoing ? 'sent' : 'received';
        let tickIcon = '';
        if (msg.isOutgoing) {
            if (msg.status === 'ENQUEUED_LOCAL') tickIcon = '<span class="delivery-tick enqueued">⏳</span>';
            else if (msg.status === 'RELAYED_MESH') tickIcon = '<span class="delivery-tick relayed">📡</span>';
            else if (msg.status === 'DELIVERED') tickIcon = '<span class="delivery-tick delivered">✓✓</span>';
            else if (msg.status === 'READ') tickIcon = '<span class="delivery-tick read">✓✓</span>';
        }

        const transportTag = msg.transport === "WEBRTC_DIRECT" 
            ? '<span style="color:#10b981; margin-right:4px;">⚡ WebRTC</span>' 
            : '<span style="color:#60a5fa; margin-right:4px;">📡 BLE Mesh</span>';

        html += `
            <div class="message-row ${rowClass}">
                <div class="message-bubble">${escapeHtml(msg.text)}</div>
                <div class="message-meta">
                    ${transportTag}
                    <span>${formatTime(msg.timestamp)}</span>
                    ${tickIcon}
                </div>
            </div>
        `;
    });

    viewport.innerHTML = html;
    viewport.scrollTop = viewport.scrollHeight;
}

async function handleSendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const currentNode = NODES[currentNodeId];
    const contactNode = NODES[currentNode.activeContact];

    const banner = document.getElementById('powMiningBanner');
    const bannerText = document.getElementById('powBannerText');
    const bannerNonce = document.getElementById('powBannerNonce');
    banner.style.display = 'flex';

    // 1. Solve PoW
    const msgBytes = new TextEncoder().encode(text);
    const msgId = RippleCrypto.fastBlake3Sim(msgBytes).slice(0, 16);
    const recipHash = RippleCrypto.hexToBytes(contactNode.address).slice(0, 16);
    const ts = Date.now();

    const powResult = RippleCrypto.solvePoW(msgId, recipHash, ts, 10);
    bannerText.textContent = `⚡ Attempting Tier 1 WebRTC (PoW: ${powResult.durationMs.toFixed(1)}ms)...`;
    bannerNonce.textContent = `Nonce: ${powResult.nonce}`;

    // 2. 13-Field Binary Packet
    const packet = new RippleCrypto.BinaryPacket({
        flags: 0x02,
        recipientHash: recipHash,
        senderPubkey: new Uint8Array(32),
        powNonce: powResult.nonce,
        timestamp: ts,
        ciphertext: msgBytes
    });

    const raw = packet.serialize();
    const packetHex = RippleCrypto.bytesToHex(raw);

    const payload = {
        senderId: currentNode.slug,
        packetHex,
        timestamp: ts
    };

    const result = rtcManager.sendRtcFirst(payload, () => {
        bannerText.textContent = `📡 Cascaded to Tier 3 BLE GATT Mesh!`;
        radio.broadcast("DATA_PACKET", packetHex, "BLE_GATT");
    });

    setTimeout(() => {
        banner.style.display = 'none';
    }, 1200);

    const msgs = loadMessages(currentNodeId);
    msgs.push({
        id: RippleCrypto.bytesToHex(msgId),
        sender: currentNode.slug,
        recipient: contactNode.slug,
        text,
        timestamp: ts,
        status: result.transport === "WEBRTC_DIRECT" ? "DELIVERED" : "RELAYED_MESH",
        transport: result.transport,
        isOutgoing: true
    });
    saveMessages(currentNodeId, msgs);
    renderMessages();
    renderConversations();
}

function handleIncomingDataPayload(packetHex, senderId, transport = "BLE_GATT") {
    const raw = RippleCrypto.hexToBytes(packetHex);
    const packet = RippleCrypto.BinaryPacket.deserialize(raw);

    const powValid = RippleCrypto.verifyPoW(
        packet.messageId,
        packet.recipientHash,
        packet.timestamp,
        packet.powNonce,
        10
    );

    if (!powValid) return;

    const text = new TextDecoder().decode(packet.ciphertext);
    const msgs = loadMessages(currentNodeId);
    msgs.push({
        id: RippleCrypto.bytesToHex(packet.messageId),
        sender: senderId,
        recipient: NODES[currentNodeId].slug,
        text,
        timestamp: packet.timestamp,
        status: "READ",
        transport,
        isOutgoing: false
    });
    saveMessages(currentNodeId, msgs);
    renderMessages();
    renderConversations();

    if (transport === "WEBRTC_DIRECT" && rtcManager && rtcManager.isConnected) {
        rtcManager.dataChannel.send(JSON.stringify({
            type: "ACK_PACKET",
            msgIdHex: RippleCrypto.bytesToHex(packet.messageId)
        }));
    } else {
        radio.broadcast("ACK_PACKET", RippleCrypto.bytesToHex(packet.messageId));
    }
}

function handleIncomingMeshPacket({ senderId, packetHex, type, transport }) {
    if (type === "DATA_PACKET") {
        handleIncomingDataPayload(packetHex, senderId, transport || "BLE_GATT");
    } else if (type === "ACK_PACKET") {
        const msgIdHex = packetHex;
        const msgs = loadMessages(currentNodeId);
        const target = msgs.find(m => m.id === msgIdHex || m.isOutgoing);
        if (target) {
            target.status = "DELIVERED";
            saveMessages(currentNodeId, msgs);
            renderMessages();
        }
    }
}

function toggleSplitView() {
    isSplitView = true;
    document.getElementById('btnDevice1').classList.remove('active');
    document.getElementById('btnDevice2').classList.remove('active');
    document.getElementById('btnSplitView').classList.add('active');

    const container = document.getElementById('appMainContainer');
    container.classList.add('split-view-container');
    container.innerHTML = `
        <div class="split-device-pane" id="paneNode1">
            <iframe src="index.html" style="width:100%; height:100%; border:none;" onload="this.contentWindow.switchDevice('node1')"></iframe>
        </div>
        <div class="split-device-pane" id="paneNode2">
            <iframe src="index.html" style="width:100%; height:100%; border:none;" onload="this.contentWindow.switchDevice('node2')"></iframe>
        </div>
    `;
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openRadarModal() { openModal('radarModal'); }
function openQrModal() { openModal('qrModal'); startQrAnimation(); }
function openAcousticModal() { openModal('acousticModal'); initAudioVisualizer(); }

let qrTimer = null;
function startQrAnimation() {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = 1;

    if (qrTimer) clearInterval(qrTimer);
    qrTimer = setInterval(() => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 200, 200);

        ctx.fillStyle = '#000000';
        const gridSize = 10;
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 20; c++) {
                if (Math.random() > 0.5 || (r < 4 && c < 4) || (r < 4 && c > 15) || (r > 15 && c < 4)) {
                    ctx.fillRect(c * gridSize, r * gridSize, gridSize - 1, gridSize - 1);
                }
            }
        }
        document.getElementById('qrFrameCounter').textContent = `Streaming UR Fountain Frame: ${frame} / 10 (15 FPS)`;
        frame = (frame % 10) + 1;
    }, 66);
}

function playUltrasonicTone() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(18500, audioCtx.currentTime);
    osc.frequency.setValueAtTime(19500, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function initAudioVisualizer() {
    const canvas = document.getElementById('audioCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let x = 0;

    function draw() {
        if (!document.getElementById('acousticModal').classList.contains('active')) return;
        requestAnimationFrame(draw);

        ctx.fillStyle = 'rgba(5, 8, 17, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();

        const sliceWidth = canvas.width / 100;
        let px = 0;
        for (let i = 0; i < 100; i++) {
            const v = Math.sin((i + x) * 0.2) * 20 + canvas.height / 2;
            if (i === 0) ctx.moveTo(px, v);
            else ctx.lineTo(px, v);
            px += sliceWidth;
        }
        ctx.stroke();
        x += 2;
    }
    draw();
}

function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
