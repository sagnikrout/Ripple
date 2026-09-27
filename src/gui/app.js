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
let searchQuery = '';

// Video Calling State
let callTimerInterval = null;
let callDurationSeconds = 0;
let isMicMuted = false;
let isCamMuted = false;
let callQualityMode = 'HD'; // 'HD' (720p) or 'MESH' (360p)

// Voice Note Recording State
let isRecordingVoice = false;
let voiceRecordStartTime = 0;
let voiceTimerInterval = null;

function getStoreKey(nodeId) {
    return `ripple_messages_${nodeId}`;
}

function loadMessages(nodeId) {
    const raw = localStorage.getItem(getStoreKey(nodeId));
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    const defaultMessages = [
        {
            id: "msg_init_1",
            sender: "swift-turing-pikachu",
            recipient: "calm-raman-lucario",
            type: "TEXT",
            text: "Hey Alice! Connected via Tier 1 WebRTC P2P DataChannel.",
            timestamp: Date.now() - 120000,
            status: "READ",
            transport: "WEBRTC_DIRECT",
            isOutgoing: nodeId !== 'node1',
            reactions: ["⚡"]
        },
        {
            id: "msg_init_2",
            sender: "calm-raman-lucario",
            recipient: "swift-turing-pikachu",
            type: "TEXT",
            text: "Confirmed! Zero-knowledge E2EE active. Cascades to BLE mesh if offline.",
            timestamp: Date.now() - 60000,
            status: "DELIVERED",
            transport: "WEBRTC_DIRECT",
            isOutgoing: nodeId === 'node1',
            reactions: ["🛡️"]
        }
    ];
    saveMessages(nodeId, defaultMessages);
    return defaultMessages;
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

    // WebRTC video call event handlers
    rtcManager.onRemoteStream = (remoteStream) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.play().catch(e => console.log("Remote video play note:", e));
        }
    };

    rtcManager.onIncomingCall = (callerSlug) => {
        showIncomingCallBanner(callerSlug);
    };

    rtcManager.onCallEnded = () => {
        cleanupVideoCallUI();
    };

    window.updateRtcStatus = (isConnected) => {
        const dot = document.getElementById('radioPulseDot');
        const text = document.getElementById('meshRadioText');
        if (isConnected && rtcFirstMode) {
            dot.style.background = '#10b981';
            dot.style.boxShadow = '0 0 8px #10b981';
            text.textContent = 'WebRTC Direct';
            text.style.color = '#10b981';
        } else {
            dot.style.background = '#3b82f6';
            dot.style.boxShadow = '0 0 8px #3b82f6';
            text.textContent = rtcFirstMode ? 'BLE Mesh Ready' : 'BLE Mesh Only';
            text.style.color = '#60a5fa';
        }
    };

    window.onRtcDirectMessage = (data) => {
        if (data.type === "ACK_PACKET") {
            handleAckPacket(data.msgIdHex);
        } else if (data.packetHex) {
            handleIncomingDataPayload(data.packetHex, data.senderId, "WEBRTC_DIRECT");
        }
    };

    // Attempt direct P2P link
    rtcManager.initiateConnection(contactNode.slug);

    renderConversations();
    renderMessages();
}

function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }
}

function handleInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
}

function switchDevice(nodeId) {
    if (isSplitView) {
        const container = document.getElementById('appMainContainer');
        container.classList.remove('split-view-container');
        window.location.reload();
        return;
    }

    document.getElementById('btnDevice1').classList.toggle('active', nodeId === 'node1');
    document.getElementById('btnDevice2').classList.toggle('active', nodeId === 'node2');
    document.getElementById('btnSplitView').classList.remove('active');
    initNode(nodeId);
}

function toggleTransportMode() {
    rtcFirstMode = !rtcFirstMode;
    const btn = document.getElementById('btnToggleTransport');
    const icon = document.getElementById('transportBadgeIcon');
    const text = document.getElementById('transportBadgeText');

    if (rtcFirstMode) {
        icon.textContent = '⚡';
        text.textContent = 'Tier 1: WebRTC';
        btn.style.borderColor = '#3b82f6';
        if (rtcManager) rtcManager.forceOfflineFallback = false;
        if (window.updateRtcStatus) window.updateRtcStatus(rtcManager ? rtcManager.isConnected : false);
    } else {
        icon.textContent = '📡';
        text.textContent = 'Tier 3: BLE Only';
        btn.style.borderColor = '#f59e0b';
        if (rtcManager) rtcManager.forceOfflineFallback = true;
        if (window.updateRtcStatus) window.updateRtcStatus(false);
    }
}

function handleSearchConversations(query) {
    searchQuery = (query || '').toLowerCase().trim();
    renderConversations();
    renderMessages();
}

function renderConversations() {
    const list = document.getElementById('conversationsList');
    if (!list) return;

    const currentNode = NODES[currentNodeId];
    const contactNode = NODES[currentNode.activeContact];
    const msgs = loadMessages(currentNodeId);
    const lastMsg = msgs[msgs.length - 1];

    let lastText = "Tap to chat...";
    if (lastMsg) {
        if (lastMsg.type === 'AUDIO') lastText = "🎙️ Voice Note";
        else if (lastMsg.type === 'IMAGE') lastText = "📷 Image Attachment";
        else if (lastMsg.type === 'SOS') lastText = `🚨 EMERGENCY: ${lastMsg.text}`;
        else lastText = lastMsg.text;
    }

    // Filter conversations if search query provided
    const match = !searchQuery || contactNode.slug.toLowerCase().includes(searchQuery) || lastText.toLowerCase().includes(searchQuery);
    if (!match) {
        list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.85rem;">No conversations match "${escapeHtml(searchQuery)}"</div>`;
        return;
    }

    list.innerHTML = `
        <div class="conversation-item active" onclick="switchDevice('${currentNodeId}')">
            <div class="convo-avatar">${contactNode.avatar}</div>
            <div class="convo-details">
                <div class="convo-header">
                    <span class="convo-name">${contactNode.slug}</span>
                    <span class="convo-time">${lastMsg ? formatTime(lastMsg.timestamp) : ''}</span>
                </div>
                <div class="convo-preview">
                    ${lastMsg && lastMsg.isOutgoing ? '<span style="color:#60a5fa;">You: </span>' : ''}
                    ${escapeHtml(lastText)}
                </div>
            </div>
        </div>
    `;
}

function renderMessages() {
    const viewport = document.getElementById('messagesViewport');
    if (!viewport) return;

    let msgs = loadMessages(currentNodeId);
    if (searchQuery) {
        msgs = msgs.filter(m => (m.text || '').toLowerCase().includes(searchQuery) || (m.type && m.type.toLowerCase().includes(searchQuery)));
    }

    let html = `<div class="time-divider">Tier 1: WebRTC Direct P2P ➔ Tier 2: Wi-Fi Direct ➔ Tier 3: BLE GATT Mesh</div>`;

    msgs.forEach((msg) => {
        const isSent = msg.isOutgoing;
        const bubbleClass = isSent ? 'sent' : 'received';
        const isSos = msg.type === 'SOS';

        let tickIcon = '';
        if (isSent) {
            if (msg.status === 'READ') {
                tickIcon = `<span style="color:#38bdf8;" title="Read by recipient">✓✓</span>`;
            } else if (msg.status === 'DELIVERED') {
                tickIcon = `<span style="color:#10b981;" title="Delivered via ${msg.transport || 'WebRTC'}">✓✓</span>`;
            } else if (msg.status === 'RELAYED_MESH') {
                tickIcon = `<span style="color:#f59e0b;" title="Relayed via BLE GATT Mesh">📡</span>`;
            } else {
                tickIcon = `<span style="color:#94a3b8;" title="Transmitting...">✓</span>`;
            }
        }

        // Render message content according to type
        let contentHtml = '';
        if (msg.type === 'AUDIO') {
            const duration = msg.duration || '0:03';
            contentHtml = `
                <div class="audio-bubble">
                    <button class="audio-play-btn" onclick="playVoiceMemo('${msg.id}')">▶</button>
                    <div class="audio-track-visual">
                        <span class="audio-track-bar" style="height:8px;"></span>
                        <span class="audio-track-bar" style="height:14px;"></span>
                        <span class="audio-track-bar" style="height:18px;"></span>
                        <span class="audio-track-bar" style="height:10px;"></span>
                        <span class="audio-track-bar" style="height:16px;"></span>
                        <span class="audio-track-bar" style="height:6px;"></span>
                    </div>
                    <span class="audio-duration-label">${duration}</span>
                </div>
            `;
        } else if (msg.type === 'IMAGE') {
            contentHtml = `
                <div class="image-attachment-bubble">
                    <img src="${msg.imageData}" class="image-attachment-img" alt="Attachment" onclick="window.open('${msg.imageData}')" />
                    ${msg.text ? `<div style="margin-top:4px; font-size:0.85rem;">${escapeHtml(msg.text)}</div>` : ''}
                </div>
            `;
        } else if (isSos) {
            contentHtml = `
                <div style="font-weight:700; color:#ef4444; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                    <span>🚨</span> EMERGENCY SOS BROADCAST
                </div>
                <div>${escapeHtml(msg.text)}</div>
                <div style="font-size:0.75rem; margin-top:4px; opacity:0.8; font-family:monospace;">
                    Coords: 47.6062° N, 122.3321° W (Direct BLE Fan-Out)
                </div>
            `;
        } else {
            contentHtml = `<div>${escapeHtml(msg.text)}</div>`;
        }

        // Render reaction pills
        let reactionsHtml = '';
        if (msg.reactions && msg.reactions.length > 0) {
            reactionsHtml = `
                <div class="applied-reactions">
                    ${msg.reactions.map(r => `<span class="reaction-pill">${r}</span>`).join('')}
                </div>
            `;
        }

        html += `
            <div class="message-bubble-wrapper" style="align-self: ${isSent ? 'flex-end' : 'flex-start'};">
                <div class="reaction-bar">
                    <button class="reaction-btn" onclick="reactToMessage('${msg.id}', '👍')">👍</button>
                    <button class="reaction-btn" onclick="reactToMessage('${msg.id}', '❤️')">❤️</button>
                    <button class="reaction-btn" onclick="reactToMessage('${msg.id}', '⚡')">⚡</button>
                    <button class="reaction-btn" onclick="reactToMessage('${msg.id}', '🛡️')">🛡️</button>
                    <button class="reaction-btn" onclick="reactToMessage('${msg.id}', '📡')">📡</button>
                </div>
                <div class="message-bubble ${bubbleClass} ${isSos ? 'sos-alert-bubble' : ''}">
                    ${contentHtml}
                    ${reactionsHtml}
                    <div class="message-meta">
                        <span>${formatTime(msg.timestamp)}</span>
                        ${tickIcon}
                    </div>
                </div>
            </div>
        `;
    });

    viewport.innerHTML = html;
    viewport.scrollTop = viewport.scrollHeight;
}

function reactToMessage(msgId, emoji) {
    const msgs = loadMessages(currentNodeId);
    const target = msgs.find(m => m.id === msgId);
    if (!target) return;

    if (!target.reactions) target.reactions = [];
    const idx = target.reactions.indexOf(emoji);
    if (idx >= 0) {
        target.reactions.splice(idx, 1);
    } else {
        target.reactions.push(emoji);
    }

    saveMessages(currentNodeId, msgs);
    renderMessages();
}

/**
 * Universal Packet Dispatcher:
 * Authentically encrypts payload (E2EE), solves PoW, serializes to 145B Little-Endian wire format,
 * attempts Tier 1 WebRTC first, and cascades to Tier 3 BLE GATT mesh upon network degradation.
 */
async function dispatchSecurePacket(payloadObj) {
    const currentNode = NODES[currentNodeId];
    const contactNode = NODES[currentNode.activeContact];

    const banner = document.getElementById('powMiningBanner');
    const bannerText = document.getElementById('powBannerText');
    const bannerNonce = document.getElementById('powBannerNonce');
    if (banner) banner.style.display = 'flex';

    // 1. Authenticated CTR Payload Encryption
    const plaintextBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
    const sharedSecret = RippleCrypto.deriveSharedSecret(currentNode.slug, contactNode.slug);
    const nonce = crypto.getRandomValues(new Uint8Array(24));
    const encResult = RippleCrypto.encryptPayload(plaintextBytes, sharedSecret, nonce);

    // 2. Solve 10-bit Hashcash PoW
    const msgId = RippleCrypto.fastBlake3Sim(encResult.ciphertextWithTag).slice(0, 16);
    const recipHash = RippleCrypto.hexToBytes(contactNode.address).slice(0, 16);
    const ts = Date.now();

    const powResult = RippleCrypto.solvePoW(msgId, recipHash, ts, 10);
    if (bannerText) bannerText.textContent = `⚡ WebRTC Attempt (PoW: ${powResult.durationMs.toFixed(1)}ms)...`;
    if (bannerNonce) bannerNonce.textContent = `Nonce: ${powResult.nonce}`;

    // 3. Construct 13-Field Binary Packet (145-byte Little-Endian Header)
    const packet = new RippleCrypto.BinaryPacket({
        flags: payloadObj.type === 'SOS' ? 0x08 : 0x02,
        recipientHash: recipHash,
        senderPubkey: new Uint8Array(32),
        nonce: encResult.nonce,
        powNonce: powResult.nonce,
        timestamp: ts,
        ciphertext: encResult.ciphertextWithTag
    });

    const raw = packet.serialize();
    const packetHex = RippleCrypto.bytesToHex(raw);

    const wireTransmission = {
        senderId: currentNode.slug,
        packetHex,
        timestamp: ts
    };

    // 4. Cascading Priority: WebRTC -> BLE GATT Mesh Fallback
    const result = rtcManager.sendRtcFirst(wireTransmission, () => {
        if (bannerText) bannerText.textContent = `📡 Cascaded to Tier 3 BLE GATT Mesh!`;
        radio.broadcast("DATA_PACKET", packetHex, "BLE_GATT");
    });

    setTimeout(() => {
        if (banner) banner.style.display = 'none';
    }, 1200);

    // 5. Commit to Local History
    const msgs = loadMessages(currentNodeId);
    msgs.push({
        id: RippleCrypto.bytesToHex(msgId),
        sender: currentNode.slug,
        recipient: contactNode.slug,
        type: payloadObj.type || "TEXT",
        text: payloadObj.text || "",
        imageData: payloadObj.imageData || null,
        duration: payloadObj.duration || null,
        timestamp: ts,
        status: result.transport === "WEBRTC_DIRECT" ? "DELIVERED" : "RELAYED_MESH",
        transport: result.transport,
        isOutgoing: true,
        reactions: []
    });
    saveMessages(currentNodeId, msgs);
    renderMessages();
    renderConversations();
}

async function handleSendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    await dispatchSecurePacket({
        type: "TEXT",
        text: text
    });
}

function handleIncomingDataPayload(packetHex, senderId, transport = "BLE_GATT") {
    const raw = RippleCrypto.hexToBytes(packetHex);
    const packet = RippleCrypto.BinaryPacket.deserialize(raw);

    // Verify Hashcash PoW
    const powValid = RippleCrypto.verifyPoW(
        packet.messageId,
        packet.recipientHash,
        packet.timestamp,
        packet.powNonce,
        10
    );
    if (!powValid) {
        console.warn("Incoming packet rejected: Invalid Proof-of-Work");
        return;
    }

    // Authenticated Decryption
    const currentNode = NODES[currentNodeId];
    const sharedSecret = RippleCrypto.deriveSharedSecret(senderId, currentNode.slug);
    let payload;
    try {
        const decryptedBytes = RippleCrypto.decryptPayload(packet.ciphertext, sharedSecret, packet.nonce);
        const jsonStr = new TextDecoder().decode(decryptedBytes);
        payload = JSON.parse(jsonStr);
    } catch (e) {
        console.warn("Payload decryption failed:", e);
        return;
    }

    const msgs = loadMessages(currentNodeId);
    msgs.push({
        id: RippleCrypto.bytesToHex(packet.messageId),
        sender: senderId,
        recipient: currentNode.slug,
        type: payload.type || "TEXT",
        text: payload.text || "",
        imageData: payload.imageData || null,
        duration: payload.duration || null,
        timestamp: packet.timestamp,
        status: "READ",
        transport,
        isOutgoing: false,
        reactions: []
    });
    saveMessages(currentNodeId, msgs);
    renderMessages();
    renderConversations();

    // Acknowledge Receipt
    const ackPayload = {
        type: "ACK_PACKET",
        msgIdHex: RippleCrypto.bytesToHex(packet.messageId)
    };
    if (transport === "WEBRTC_DIRECT" && rtcManager && rtcManager.isConnected) {
        try {
            rtcManager.dataChannel.send(JSON.stringify(ackPayload));
        } catch (e) {}
    } else {
        radio.broadcast("ACK_PACKET", RippleCrypto.bytesToHex(packet.messageId));
    }
}

function handleAckPacket(msgIdHex) {
    const msgs = loadMessages(currentNodeId);
    const target = msgs.find(m => m.id === msgIdHex || (m.isOutgoing && m.status !== 'READ'));
    if (target) {
        target.status = "DELIVERED";
        saveMessages(currentNodeId, msgs);
        renderMessages();
    }
}

function handleIncomingMeshPacket({ senderId, packetHex, type, transport }) {
    if (type === "DATA_PACKET") {
        handleIncomingDataPayload(packetHex, senderId, transport || "BLE_GATT");
    } else if (type === "ACK_PACKET") {
        handleAckPacket(packetHex);
    }
}

// ==========================================
// Native In-App P2P Video Calling
// ==========================================

async function startNativeVideoCall() {
    const currentNode = NODES[currentNodeId];
    const contactNode = NODES[currentNode.activeContact];

    document.getElementById('remotePeerLabel').textContent = `${contactNode.slug} (Calling...)`;
    document.getElementById('videoCallModal').classList.add('active');

    // Acquire hardware camera or simulated HD 720p 30fps canvas stream
    const media = await RippleCrypto.WebRtcP2PManager.acquireMediaStream(currentNode.avatar, '#2563eb');
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = media.stream;
        localVideo.play().catch(e => console.log(e));
    }

    startCallTimer();
    rtcManager.startVideoCall(contactNode.slug, media.stream);
}

function showIncomingCallBanner(callerSlug) {
    const banner = document.getElementById('incomingCallBanner');
    const nameEl = document.getElementById('incomingCallerName');
    if (nameEl) nameEl.textContent = callerSlug;
    if (banner) banner.style.display = 'flex';
}

async function acceptIncomingCall() {
    const banner = document.getElementById('incomingCallBanner');
    if (banner) banner.style.display = 'none';

    const currentNode = NODES[currentNodeId];
    document.getElementById('videoCallModal').classList.add('active');

    const media = await RippleCrypto.WebRtcP2PManager.acquireMediaStream(currentNode.avatar, '#10b981');
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = media.stream;
        localVideo.play().catch(e => console.log(e));
    }

    startCallTimer();
    rtcManager.acceptVideoCall(media.stream);
}

function declineIncomingCall() {
    const banner = document.getElementById('incomingCallBanner');
    if (banner) banner.style.display = 'none';
    if (rtcManager) {
        rtcManager.endVideoCall(NODES[currentNodeId].activeContact);
    }
}

function hangupCall() {
    if (rtcManager) {
        rtcManager.endVideoCall(NODES[currentNodeId].activeContact);
    }
    cleanupVideoCallUI();
}

function cleanupVideoCallUI() {
    stopCallTimer();
    const modal = document.getElementById('videoCallModal');
    if (modal) modal.classList.remove('active');

    const localVideo = document.getElementById('localVideo');
    if (localVideo && localVideo.srcObject) {
        localVideo.srcObject.getTracks().forEach(t => t.stop());
        localVideo.srcObject = null;
    }
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo && remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(t => t.stop());
        remoteVideo.srcObject = null;
    }
}

function toggleCallMic() {
    isMicMuted = !isMicMuted;
    const btn = document.getElementById('btnToggleMic');
    const icon = document.getElementById('micIcon');
    btn.classList.toggle('muted', isMicMuted);
    icon.textContent = isMicMuted ? '🔇' : '🎙️';

    if (rtcManager && rtcManager.localStream) {
        rtcManager.localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
    }
}

function toggleCallCam() {
    isCamMuted = !isCamMuted;
    const btn = document.getElementById('btnToggleCam');
    const icon = document.getElementById('camIcon');
    btn.classList.toggle('muted', isCamMuted);
    icon.textContent = isCamMuted ? '🚫' : '📹';

    if (rtcManager && rtcManager.localStream) {
        rtcManager.localStream.getVideoTracks().forEach(t => t.enabled = !isCamMuted);
    }
}

function cycleCallQuality() {
    const icon = document.getElementById('qualityIcon');
    const text = document.getElementById('callQualityText');
    if (callQualityMode === 'HD') {
        callQualityMode = 'MESH';
        icon.textContent = '📡 Mesh';
        text.textContent = 'Low-BW Mesh 360p (~250 Kbps)';
    } else {
        callQualityMode = 'HD';
        icon.textContent = '⚡ HD';
        text.textContent = 'HD 720p60 (~1.2 Mbps)';
    }
}

function startCallTimer() {
    stopCallTimer();
    callDurationSeconds = 0;
    const timerEl = document.getElementById('callTimer');
    callTimerInterval = setInterval(() => {
        callDurationSeconds++;
        const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
        const secs = String(callDurationSeconds % 60).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

// ==========================================
// Voice Note Memo Recording
// ==========================================

function toggleVoiceRecording() {
    if (isRecordingVoice) {
        finishVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function startVoiceRecording() {
    isRecordingVoice = true;
    voiceRecordStartTime = Date.now();
    const bar = document.getElementById('voiceRecordingBar');
    if (bar) bar.style.display = 'flex';

    const timerText = document.getElementById('recordingTimerText');
    voiceTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - voiceRecordStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = String(elapsedSec % 60).padStart(2, '0');
        if (timerText) timerText.textContent = `Recording Voice Note... ${mins}:${secs}`;
    }, 500);
}

function cancelVoiceRecording() {
    isRecordingVoice = false;
    if (voiceTimerInterval) clearInterval(voiceTimerInterval);
    const bar = document.getElementById('voiceRecordingBar');
    if (bar) bar.style.display = 'none';
}

async function finishVoiceRecording() {
    if (!isRecordingVoice) return;
    const elapsedSec = Math.max(1, Math.floor((Date.now() - voiceRecordStartTime) / 1000));
    cancelVoiceRecording();

    const mins = Math.floor(elapsedSec / 60);
    const secs = String(elapsedSec % 60).padStart(2, '0');
    const duration = `${mins}:${secs}`;

    await dispatchSecurePacket({
        type: "AUDIO",
        duration: duration,
        text: `Voice memo (${duration})`
    });
}

function playVoiceMemo(msgId) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Play warm synthetic voice chime
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

// ==========================================
// Media Image Attachment
// ==========================================

function triggerAttachmentPicker() {
    const input = document.getElementById('imageFileInput');
    if (input) input.click();
}

function handleImageFileChosen(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;
        await dispatchSecurePacket({
            type: "IMAGE",
            imageData: dataUrl,
            text: file.name
        });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// ==========================================
// Emergency SOS Broadcast
// ==========================================

async function triggerSosBroadcast() {
    if (confirm("Send emergency SOS broadcast to all nodes within radio range?")) {
        await dispatchSecurePacket({
            type: "SOS",
            text: "DISTRESS ALERT: Immediate assistance required. GPS coords broadcast."
        });
    }
}

// ==========================================
// Split View & Modal Operations
// ==========================================

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
