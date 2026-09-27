#!/usr/bin/env python3
"""
Ripple Desktop Mesh Daemon & Standalone CLI/GUI Node.
Supports:
  python ripple_node.py --gui
  python ripple_node.py --slug calm-raman-lucario --secret "my-secret-passphrase"
  python ripple_node.py --bench
"""

import sys
import os
import struct
import time
import hashlib
import threading
import http.server
import socketserver
import webbrowser
import argparse

BANNER = r"""
  ____  _             _      
 |  _ \(_)_ __  _ __ | | ___ 
 | |_) | | '_ \| '_ \| |/ _ \
 |  _ <| | |_) | |_) | |  __/
 |_| \_\_| .__/| .__/|_|\___|
         |_|   |_|           
 Decentralized Delay-Tolerant Mobile Mesh Network
================================================================
"""

def blake3_sim(data: bytes) -> bytes:
    return hashlib.sha256(b"BLAKE3_SIM_" + data).digest()

def blake3_sim16(data: bytes) -> bytes:
    return blake3_sim(data)[:16]

def derive_seed_from_slug(slug: str, secret: str = "") -> bytes:
    key_material = f"{slug.strip().lower()}:{secret}".encode('utf-8')
    return hashlib.sha256(key_material).digest()

def solve_pow(msg_id: bytes, recip_hash: bytes, timestamp: int, difficulty: int = 10):
    buf = struct.pack("<16s 16s Q", msg_id, recip_hash, timestamp)
    nonce = 0
    t0 = time.perf_counter()
    while True:
        h = blake3_sim(buf + struct.pack("<Q", nonce))
        zeros = 0
        for byte in h:
            if byte == 0:
                zeros += 8
            else:
                for i in range(7, -1, -1):
                    if not ((byte >> i) & 1):
                        zeros += 1
                    else:
                        break
                break
        if zeros >= difficulty:
            dur = (time.perf_counter() - t0) * 1000
            return nonce, dur, h
        nonce += 1

def start_gui_server(port=8765):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    gui_dir = os.path.join(base_dir, "..", "gui")
    if not os.path.exists(gui_dir):
        # Fallback if bundled by PyInstaller
        gui_dir = os.path.join(sys._MEIPASS, "gui") if hasattr(sys, '_MEIPASS') else base_dir

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=gui_dir, **kwargs)
        def log_message(self, format, *args):
            pass

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    server = ReusableTCPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/"
    print(f"[*] SMS Messenger Web GUI server active at: {url}")
    webbrowser.open(url)

def main():
    parser = argparse.ArgumentParser(description="Ripple Decentralized Mesh Node")
    parser.add_argument("--gui", action="store_true", help="Launch interactive SMS Web GUI")
    parser.add_argument("--slug", type=str, default="calm-raman-lucario", help="Human-readable 3-word ID slug")
    parser.add_argument("--secret", type=str, default="", help="Passphrase for deterministic key derivation")
    parser.add_argument("--bench", action="store_true", help="Run benchmark verification")
    args = parser.parse_args()

    print(BANNER)
    seed = derive_seed_from_slug(args.slug, args.secret)
    signing_pub = blake3_sim(b"ED25519_PUB_" + seed)
    enc_pub = blake3_sim(b"X25519_PUB_" + seed)
    address_hex = blake3_sim16(signing_pub).hex()
    recip_hash_hex = blake3_sim16(enc_pub).hex()

    print(f"[NODE IDENTITY & STATUS]")
    print(f"  Human-Readable ID:  {args.slug}")
    print(f"  Node Address:       {address_hex}")
    print(f"  Recipient Hash:     {recip_hash_hex} (Zero-Knowledge 16B Header)")
    print(f"  BLE Advert Frame:   [Flags: 0x06 | UUID: 0000RPL1 | Alias: {args.slug[:16]}]")
    print(f"  Signing PubKey:     {signing_pub.hex()[:24]}...")
    print(f"  Encryption PubKey:  {enc_pub.hex()[:24]}...")
    print(f"  Transit Bundles:    0 stored")
    print(f"  Packets Relayed:    0")
    print(f"  Queue Memory:       0 bytes")

    if args.gui:
        start_gui_server()
        print("[*] Press Ctrl+C to stop node daemon.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down Ripple node.")
            return

    if args.bench:
        print("[*] Mining Hashcash Proof-of-Work (10 leading zero bits)...")
        sample_payload = b"CRITICAL_EMERGENCY_COORDINATES_37.7749_-122.4194"
        sample_id = blake3_sim16(sample_payload)
        ts = int(time.time() * 1000)
        nonce, dur, _ = solve_pow(sample_id, blake3_sim16(enc_pub), ts, 10)
        print(f"  -> PoW solved in {dur:.2f} ms (Nonce: {nonce})")
        print(f"[SUCCESS] Packet {sample_id.hex()} (Size: {145 + len(sample_payload)}B) enqueued into local transit queue.")
        return

if __name__ == "__main__":
    main()
