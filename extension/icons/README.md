# Extension icons

The toolbar icon and 16/32/128 px PNGs are intentionally not included in
the v0 source. The Chrome Web Store requires PNGs (SVG is not accepted in
the `icons` block of `manifest.json`), but generating them needs a binary
asset pipeline that doesn't fit in the v0 scaffold.

The vector source lives at `seal.svg`. To produce the PNGs before you
publish, the simplest one-off:

```bash
# from the extension/ directory:
npx --yes sharp-cli --input icons/seal.svg --output icons/seal-128.png resize 128 128
npx --yes sharp-cli --input icons/seal.svg --output icons/seal-32.png  resize 32  32
npx --yes sharp-cli --input icons/seal.svg --output icons/seal-16.png  resize 16  16
```

Then add the icons block back to `manifest.json`:

```json
"action": {
  "default_popup": "popup.html",
  "default_title": "Votum",
  "default_icon": {
    "16": "icons/seal-16.png",
    "32": "icons/seal-32.png"
  }
},
"icons": {
  "16": "icons/seal-16.png",
  "32": "icons/seal-32.png",
  "128": "icons/seal-128.png"
}
```
