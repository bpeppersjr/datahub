"""Read-only probe for the independently provisioned Windows PDF environment."""
import base64
import hashlib
import importlib.metadata
import json
import pathlib
import platform
import sys

EXPECTED = {"pdfplumber": "0.11.9", "pdfminer.six": "20251230",
            "charset-normalizer": "3.5.1", "cryptography": "50.0.1",
            "cffi": "2.1.1", "pillow": "12.3.0", "pypdfium2": "5.13.0",
            "pycparser": "3.0"}


def file_digest(source):
    if source.stat().st_size > 100_000_000:
        raise ValueError("runtime file budget exceeded")
    digest = hashlib.sha256()
    count = 0
    with source.open("rb") as stream:
        while chunk := stream.read(1_000_000):
            count += len(chunk)
            if count > 100_000_000:
                raise ValueError("runtime file budget exceeded")
            digest.update(chunk)
    return digest, count


def probe(guard=None):
    prefix = pathlib.Path(sys.prefix).resolve()
    expected_prefix = pathlib.Path(__file__).resolve().parent.parent / "data/runtimes/pdf-decoder-1"
    if prefix != expected_prefix or sys.prefix == sys.base_prefix:
        raise ValueError("not app environment")
    if "codex" in sys.base_prefix.lower() or sys.version_info[:3] != (3, 14, 7):
        raise ValueError("unsupported base runtime")
    if sys.platform != "win32" or platform.machine() != "AMD64":
        raise ValueError("unsupported platform")
    inventory = {}
    total_bytes = 0
    for name, version in EXPECTED.items():
        distribution = importlib.metadata.distribution(name)
        if distribution.version != version or not distribution.files:
            raise ValueError("package version mismatch")
        for item in distribution.files:
            if guard:
                guard.check_cancelled()
            source = pathlib.Path(distribution.locate_file(item)).resolve(strict=True)
            if not source.is_relative_to(prefix) or not source.is_file():
                raise ValueError("redirected package file")
            digest, count = file_digest(source)
            total_bytes += count
            if total_bytes > 512_000_000 or len(inventory) > 2000:
                raise ValueError("runtime inventory budget exceeded")
            if item.hash:
                if item.hash.mode != "sha256":
                    raise ValueError("unsupported package digest")
                actual = base64.urlsafe_b64encode(digest.digest()).decode().rstrip("=")
                if actual != item.hash.value:
                    raise ValueError("package digest mismatch")
            inventory[str(source.relative_to(prefix)).replace("\\", "/")] = digest.hexdigest()
    fingerprint = hashlib.sha256(json.dumps(inventory, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"schema_version": "cotive-pdf-runtime-probe@1.0.0", "python_version": platform.python_version(),
            "platform": sys.platform, "architecture": platform.machine(), "packages": EXPECTED,
            "base_prefix": sys.base_prefix, "package_files": len(inventory), "package_record_inventory_sha256": fingerprint,
            "venv_launcher_sha256": file_digest(pathlib.Path(sys.executable))[0].hexdigest(),
            "base_components_sha256": {name: file_digest(pathlib.Path(sys.base_prefix) / name)[0].hexdigest()
                                       for name in ("python.exe", "python314.dll", "python3.dll")},
            "full_base_runtime_attested": False}


if __name__ == "__main__":
    guard = None
    try:
        if sys.argv[1:] == ["--managed"]:
            from pdf_process_guard import ProcessGuard
            guard = ProcessGuard().start()
        elif sys.argv[1:]:
            raise ValueError("invalid probe options")
        print(json.dumps(probe(guard), separators=(",", ":")), flush=True)
    except Exception:
        sys.stderr.write("Co*Tive PDF runtime verification failed.\n")
        sys.exit(1)
    finally:
        if guard:
            guard.close()
