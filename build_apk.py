import os
import zipfile
import subprocess
import glob

print("================================================================================")
print("             RIPPLE ANDROID APK PACKAGING PIPELINE (WITH EMBEDDED GUI)          ")
print("================================================================================")

sdk_platform = r"C:\Users\sagni\AppData\Local\Android\Sdk\platforms\android-35\android.jar"
build_tools = r"C:\Users\sagni\AppData\Local\Android\Sdk\build-tools\35.0.0"
aapt2_bin = os.path.join(build_tools, "aapt2.exe")
d8_bin = os.path.join(build_tools, "d8.bat")
zipalign_bin = os.path.join(build_tools, "zipalign.exe")
apksigner_bin = os.path.join(build_tools, "apksigner.bat")

os.makedirs("build/classes", exist_ok=True)
os.makedirs("dist", exist_ok=True)

# 1. Compile Java sources
print("[1/6] Compiling Java classes (MainActivity, RippleWebBridge, RippleForegroundService)...")
java_files = glob.glob("src/main/java/net/ripple/mesh/**/*.java", recursive=True)
javac_cmd = ["javac", "-d", "build/classes", "-classpath", sdk_platform] + java_files
subprocess.run(javac_cmd, check=True)

# 2. Dex classes
print("[2/6] Dexing compiled classes with d8...")
class_files = glob.glob("build/classes/**/*.class", recursive=True)
d8_cmd = [d8_bin, "--output", "build/"] + class_files
subprocess.run(d8_cmd, check=True, shell=True)

# 3. AAPT2 compile and link
print("[3/6] Compiling & Linking Android resources with aapt2...")
subprocess.run([aapt2_bin, "compile", "--dir", "build/res", "-o", "build/compiled_res.zip"], check=True)
subprocess.run([
    aapt2_bin, "link",
    "-I", sdk_platform,
    "build/compiled_res.zip",
    "--manifest", "build/AndroidManifest.xml",
    "-o", "build/unaligned.apk",
    "--auto-add-overlay"
], check=True)

# 4. Inject classes.dex and assets/gui/* into APK
print("[4/6] Injecting classes.dex and embedded SMS GUI web assets into APK...")
unaligned_apk = "build/unaligned.apk"
packaged_apk = "build/packaged.apk"
dex_file = "build/classes.dex"

gui_files = {
    "assets/gui/index.html": "src/gui/index.html",
    "assets/gui/styles.css": "src/gui/styles.css",
    "assets/gui/crypto.js": "src/gui/crypto.js",
    "assets/gui/app.js": "src/gui/app.js"
}

with zipfile.ZipFile(unaligned_apk, 'r') as zin:
    with zipfile.ZipFile(packaged_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            zout.writestr(item, zin.read(item.filename))
        
        with open(dex_file, 'rb') as f:
            zout.writestr('classes.dex', f.read())

        for zip_path, src_path in gui_files.items():
            if os.path.exists(src_path):
                with open(src_path, 'rb') as f:
                    zout.writestr(zip_path, f.read())
                print(f"  -> Injected {zip_path}")

# 5. Align APK
print("[5/6] 4-byte aligning APK with zipalign...")
aligned_apk = "build/aligned.apk"
subprocess.run([zipalign_bin, "-p", "-f", "4", packaged_apk, aligned_apk], check=True)

# 6. Sign APK
print("[6/6] Signing APK with apksigner (V1 + V2 + V3)...")
keystore = "build/debug.keystore"

# Create debug keystore if missing
if not os.path.exists(keystore):
    print("  -> Generating debug.keystore...")
    subprocess.run([
        "keytool", "-genkeypair", "-v",
        "-keystore", keystore,
        "-alias", "androiddebugkey",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-storepass", "android",
        "-keypass", "android",
        "-dname", "CN=Android Debug,O=Android,C=US"
    ], check=True)

output_apk = "dist/ripple.apk"
subprocess.run([
    apksigner_bin, "sign",
    "--ks", keystore,
    "--ks-pass", "pass:android",
    "--ks-key-alias", "androiddebugkey",
    "--key-pass", "pass:android",
    "--out", output_apk,
    aligned_apk
], check=True, shell=True)

apk_size = os.path.getsize(output_apk)
print(f"\n[SUCCESS] Full-featured Android APK with interactive GUI built at: {output_apk}")
print(f"APK File Size: {apk_size:,} bytes")
