"""Read-only glyph decoder prerequisite; not an enrolled acquisition worker.

Requires pdfplumber==0.11.9 and pdfminer.six==20251230 in an explicitly
provisioned Python environment. No network, OCR, source repair, or file writes.
The caller must supervise elapsed time, memory and stdout before app enrollment.
"""

import hashlib
import io
import json
import logging
import math
import pathlib
import re
import sys

MAX_BYTES = 500_000
MAX_PAGES = 64
MAX_GLYPHS = 500_000
MAX_OUTPUT = 64_000_000


def decode(source, expected_sha256, edition, guard=None):
    import pdfplumber
    import pdfminer
    from pdfminer.pdftypes import resolve1

    if pdfplumber.__version__ != "0.11.9" or pdfminer.__version__ != "20251230":
        raise ValueError("unsupported decoder version")
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValueError("invalid digest")
    if not re.fullmatch(r"(?:January|February|March|April|May|June|July|August|September|October|November|December) 20[0-9]{2}", edition):
        raise ValueError("invalid edition")
    root = pathlib.Path(__file__).resolve().parent.parent
    source = pathlib.Path(source).resolve(strict=True)
    if not source.is_relative_to(root / "data") or not source.is_file():
        raise ValueError("source must be a retained datahub file")
    with source.open("rb") as stream:
        content = stream.read(MAX_BYTES + 1)
    if not content.startswith(b"%PDF-") or len(content) > MAX_BYTES:
        raise ValueError("invalid source size or type")
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise ValueError("source hash mismatch")
    pages = []
    total = 0
    with pdfplumber.open(io.BytesIO(content), strict_metadata=True) as pdf:
        if pdf.doc.encryption or not 1 <= len(pdf.pages) <= MAX_PAGES:
            raise ValueError("unsupported PDF")
        if any(resolve1(pdf.doc.catalog.get(key)) for key in ("Names", "OpenAction", "AA", "AcroForm")):
            raise ValueError("unreviewed catalog content")
        for number, page in enumerate(pdf.pages, 1):
            if guard:
                guard.check_cancelled()
            if page.rotation or page.width != 792 or page.height != 612:
                raise ValueError("unsupported page geometry")
            if page.annots or page.images:
                raise ValueError("unreviewed annotations or images")
            bounds = sorted({round(line["x0"], 3) for line in page.lines
                             if line["x0"] == line["x1"] and line["top"] < 79})
            if len(bounds) != 14:
                raise ValueError("ambiguous header grid")
            glyphs = []
            for char in page.chars:
                if guard:
                    guard.check_cancelled()
                total += 1
                if total > MAX_GLYPHS or not char["upright"]:
                    raise ValueError("unsupported glyph inventory")
                item = {key: char[key] for key in ("text", "x0", "x1", "top", "bottom")}
                if not isinstance(item["text"], str) or len(item["text"]) != 1:
                    raise ValueError("unsupported glyph text")
                if not all(isinstance(item[k], (int, float)) and math.isfinite(item[k])
                           for k in ("x0", "x1", "top", "bottom")):
                    raise ValueError("nonfinite glyph geometry")
                glyphs.append(item)
            pages.append({"page_number": number, "width": page.width, "height": page.height,
                          "column_boundaries": bounds, "glyphs": glyphs})
            page.close()
    return {"schema_version": "ut-childcare-decoded-glyphs@1.0.0",
            "report_edition": edition, "page_count": len(pages), "pages": pages}


def main():
    logging.disable(logging.CRITICAL)
    guard = None
    try:
        args = sys.argv[1:]
        managed = args[:1] == ["--managed"]
        if managed:
            from pdf_process_guard import ProcessGuard
            guard = ProcessGuard().start()
            args = args[1:]
        if len(args) != 3:
            raise ValueError("expected source path, sha256, report edition")
        result = decode(*args, guard=guard)
        if guard:
            guard.check_cancelled()
            result = {"document": result, "guard": {"backend": guard.backend,
                      "memory_bytes": guard.memory_bytes, "timeout_seconds": guard.timeout_seconds}}
        encoded = json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode("ascii")
        if len(encoded) > MAX_OUTPUT:
            raise ValueError("decoded output exceeds budget")
        if guard:
            guard.check_cancelled()
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
        if guard:
            guard.check_cancelled()
    except Exception:
        # Never expose source records, paths, or decoder exception excerpts.
        sys.stderr.write("Utah PDF decoding prerequisite rejected.\n")
        return 1
    finally:
        if guard:
            guard.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
