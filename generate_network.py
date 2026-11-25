#!/usr/bin/env python3
"""Build a static, interactive 3D "text to network" page.

The page turns a pasted text (50 to 10,000 words) into a small 3D network of
"Central" ideas, "Orbital" words and one "Meta" idea (the lesson behind the text).
All analysis happens in the browser; the text never leaves the page.

Project layout
--------------
generate_network.py     this build script (standard library only)
network_template.html   page skeleton: markup, CSS and placeholders
sample_text.txt         text preloaded into the page
assets/text_model.js    tiny text-analysis model and the meta lexicon
assets/viewer.js        three.js scene, physics, camera and controls

Usage
-----
    python generate_network.py                     # network_example.html, three.js from a CDN
    python generate_network.py --inline            # also embed three.js (works offline)
    python generate_network.py --text my.txt       # preload your own text
    python generate_network.py --out my_page.html --title "My network"
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import sys
import urllib.request
from pathlib import Path
from typing import Dict, Final, Optional, Sequence, Tuple

# --------------------------------------------------------------------------
# Paths and constants
# --------------------------------------------------------------------------

PROJECT_DIR: Final[Path] = Path(__file__).resolve().parent
TEMPLATE_PATH: Final[Path] = PROJECT_DIR / "network_template.html"
MODEL_PATH: Final[Path] = PROJECT_DIR / "assets" / "text_model.js"
VIEWER_PATH: Final[Path] = PROJECT_DIR / "assets" / "viewer.js"
SAMPLE_PATH: Final[Path] = PROJECT_DIR / "sample_text.txt"
ADDICTION_PATH: Final[Path] = PROJECT_DIR / "sample_text_addiction.txt"
ALADDIN_PATH: Final[Path] = PROJECT_DIR / "sample_text_aladdin.txt"
DEFAULT_OUTPUT: Final[Path] = Path("network_example.html")
DEFAULT_TITLE: Final[str] = "Text to network"

MIN_WORDS: Final[int] = 50
MAX_WORDS: Final[int] = 10000

THREE_VERSION: Final[str] = "0.128.0"
THREE_BASE_URL: Final[str] = f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}"
# Order matters: each script may depend on the ones before it.
THREE_SCRIPTS: Final[Tuple[str, ...]] = (
    "build/three.min.js",
    "examples/js/controls/OrbitControls.js",
    "examples/js/shaders/CopyShader.js",
    "examples/js/shaders/LuminosityHighPassShader.js",
    "examples/js/postprocessing/EffectComposer.js",
    "examples/js/postprocessing/RenderPass.js",
    "examples/js/postprocessing/ShaderPass.js",
    "examples/js/postprocessing/UnrealBloomPass.js",
)


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def word_count(text: str) -> int:
    """Return the number of whitespace-separated words in ``text``."""
    return len(text.split())


def read_text_file(path: Path) -> str:
    """Read a UTF-8 text file and strip surrounding whitespace.

    Args:
        path: File to read.

    Returns:
        The file contents without leading or trailing whitespace.
    """
    return path.read_text(encoding="utf-8").strip()


def escape_for_script(source: str) -> str:
    """Make JavaScript source safe to embed inside a ``<script>`` element.

    A literal ``</script`` would close the element early, so it is escaped.
    """
    return source.replace("</script", "<\\/script")


def fetch_url(url: str) -> str:
    """Download a URL and return its body decoded as UTF-8."""
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8")


# --------------------------------------------------------------------------
# Building blocks of the HTML page
# --------------------------------------------------------------------------

def library_script_tags(inline: bool) -> str:
    """Return the ``<script>`` markup that loads three.js and its add-ons.

    Args:
        inline: If ``True``, download the scripts now and embed them in the
            page, so it works offline. If ``False``, reference them on the CDN.

    Returns:
        HTML containing one ``<script>`` element per library file.
    """
    urls = [f"{THREE_BASE_URL}/{path}" for path in THREE_SCRIPTS]
    if not inline:
        return "\n".join(f'<script src="{url}"></script>' for url in urls)

    blocks = []
    for url in urls:
        print(f"  downloading {url}", file=sys.stderr)
        blocks.append("<script>\n" + escape_for_script(fetch_url(url)) + "\n</script>")
    return "\n".join(blocks)


def asset_source(path: Path) -> str:
    """Return a JavaScript asset ready to be embedded inline."""
    return escape_for_script(path.read_text(encoding="utf-8"))


def page_config_json(text: str) -> str:
    """Serialise the values the page reads at start-up.

    The JSON is embedded as a JavaScript literal, so ``</`` is escaped to keep
    the surrounding ``<script>`` element intact.

    Args:
        text: The text preloaded into the page.

    Returns:
        A JSON object with ``minWords``, ``maxWords`` and ``text``.
    """
    samples = [
        {"label": "Aladdin", "zoom": 1.185, "text": read_text_file(ALADDIN_PATH) if ALADDIN_PATH.exists() else ""},
        {"label": "The Emperor's New Clothes", "zoom": 1.471, "spin": 0.6582, "text": read_text_file(SAMPLE_PATH)},
        {"label": "Addiction (Wikipedia)", "zoom": 1.171, "text": read_text_file(ADDICTION_PATH) if ADDICTION_PATH.exists() else ""},
    ]
    payload = {"minWords": MIN_WORDS, "maxWords": MAX_WORDS, "text": text, "samples": samples}
    return json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")


def render_template(
    template: str,
    text: str,
    title: str,
    inline_libraries: bool,
) -> str:
    """Fill every placeholder in the HTML template.

    Args:
        template: Contents of ``network_template.html``.
        text: Text preloaded into the page.
        title: Document title (escaped before use).
        inline_libraries: Whether to embed three.js instead of linking it.

    Returns:
        The finished, self-contained HTML document.
    """
    replacements: Dict[str, str] = {
        "{{TITLE}}": html_lib.escape(title),
        "{{MIN_WORDS}}": str(MIN_WORDS),
        "{{MAX_WORDS}}": str(MAX_WORDS),
        "{{CONFIG_JSON}}": page_config_json(text),
        "{{LIBS}}": library_script_tags(inline_libraries),
        "{{MODEL_JS}}": asset_source(MODEL_PATH),
        "{{VIEWER_JS}}": asset_source(VIEWER_PATH),
    }
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)
    return template


def build_page(text: str, title: str = DEFAULT_TITLE, inline_libraries: bool = False) -> str:
    """Build the complete HTML page for a given preloaded text.

    Args:
        text: Text to preload. It is shown in the text field and analysed on load.
        title: Browser title of the page.
        inline_libraries: Embed three.js (offline use) instead of linking it.

    Returns:
        The HTML document as a string.

    Raises:
        FileNotFoundError: If a project file is missing.
    """
    check_project_files()
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    return render_template(template, text, title, inline_libraries)


def check_project_files() -> None:
    """Raise a clear error if a file the build depends on is missing."""
    required = (TEMPLATE_PATH, MODEL_PATH, VIEWER_PATH)
    missing = [str(path.relative_to(PROJECT_DIR)) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing project files (keep them next to generate_network.py): " + ", ".join(missing)
        )


# --------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------

def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Arguments to parse; defaults to ``sys.argv[1:]``.

    Returns:
        The parsed arguments.
    """
    parser = argparse.ArgumentParser(
        description="Build a static, interactive text-to-network page.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT,
                        help="output HTML file (default: %(default)s)")
    parser.add_argument("--text", type=Path, default=None,
                        help="text file to preload (default: sample_text.txt)")
    parser.add_argument("--title", default=DEFAULT_TITLE, help="browser title of the page")
    parser.add_argument("--inline", action="store_true",
                        help="embed three.js so the page works offline (downloads it once)")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    """Entry point: build the page and report what was written.

    Args:
        argv: Optional command-line arguments (useful for testing).

    Returns:
        Process exit code: 0 on success.
    """
    args = parse_args(argv)
    text = read_text_file(args.text if args.text else ALADDIN_PATH)   # Aladdin is the default text

    words = word_count(text)
    if not MIN_WORDS <= words <= MAX_WORDS:
        print(
            f"Note: the preloaded text has {words} words (allowed: {MIN_WORDS}-{MAX_WORDS}). "
            "The page will show it, but the Update button will refuse it.",
            file=sys.stderr,
        )

    page = build_page(text, title=args.title, inline_libraries=args.inline)
    args.out.write_text(page, encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
