# nhentai Dynamic Auto Reader

> Automatically extracts text from nhentai galleries and auto-reads pages based on character count, with user-configurable timing and manual navigation handling.

## Quick Overview

This Tampermonkey userscript uses OCR (Optical Character Recognition) to automatically determine how long to display each page of a manga gallery based on the amount of text present. Pages with more text get more reading time; pages with little text move faster. Perfect for manga-style content that mixes dense text and image-heavy pages.

---

## Detailed Description

**nhentai Dynamic Auto Reader** is a sophisticated reading automation tool designed for manga galleries on nhentai.net. Instead of showing every page for a fixed duration, it intelligently adapts reading speed to content density:

- **Character-based timing**: Pages are timed based on their actual text content (non-whitespace character count)
- **Automatic text extraction**: Uses Tesseract.js to run OCR on gallery images
- **Smart fallback handling**: If OCR takes time, uses a configurable fallback delay; switches to character-based timing once OCR completes
- **Manual navigation support**: Detects when you manually navigate forward/backward and responds according to your settings (continue or pause)
- **Visual feedback**: Progress bar shows reading time remaining for each page
- **Session persistence**: All settings and debug preferences save across browser sessions

---

## Installation

1. **Install Tampermonkey** (if not already installed):
   - [Chrome/Edge](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobblbi)
   - [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
   - [Safari](https://apps.apple.com/app/tampermonkey/id1482490089)

2. **Install the script**: [Click here](userscript.js) to view the raw script, then click Tampermonkey's install button or manually paste into a new Tampermonkey script

3. **Navigate to an nhentai gallery** - the script activates automatically on gallery pages

---

## Features

- **Automatic page reading** with character-count-based timing
- **OCR-powered text extraction** via Tesseract.js (runs in browser, no server calls)
- **Visual progress bar** at bottom of page during reading delays
- **Pause/resume controls** with dedicated play button (bottom-right corner)
- **Manual navigation detection** - knows when you click page buttons and handles it intelligently
- **Debug panel** showing detailed timing, character counts, and script state
- **Comprehensive settings dialog** for fine-tuning behavior

---

## Usage

### Basic Controls

- **Play Button** (▶ / ⏸): Bottom-right corner
  - Click once to start auto-reading from current page
  - Click again to pause
  - Click again to resume
- **Settings Button** (⚙): Just above the play button - opens configuration dialog

### How It Works

1. Script loads all pages in the gallery and runs OCR to extract text from each
2. Debug panel shows progress: `Page 1: 142 chars`, `Page 2: processing...`, etc.
3. When you start auto-reading, the script calculates timing for each page:
   - **Formula**: `baseDelay + (charCount × charMultiplier)` seconds
   - Display a visual progress bar during the wait
   - Move to next page automatically when timer finishes
4. Continue through gallery until the last page is reached

### Manual Navigation During Auto-Read

If you manually click next/previous page buttons while auto-reading:

- **Forward button**: Behavior set by "Manual Navigation Forward" setting (default: `continue`)
  - `continue`: Restarts timer for new page without pausing
  - `pause`: Pauses auto-reading

- **Backward button**: Behavior set by "Manual Navigation Backward" setting (default: `pause`)
  - `continue`: Restarts timer for new page without pausing
  - `pause`: Pauses auto-reading

This allows you to quickly skip pages while keeping auto-read active, or manually override timing entirely.

---

## Settings & Configuration

Open the settings dialog using the ⚙ button. All values persist across browser sessions.

### Timing Settings

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| **Base Delay** | 3s | 0.5s–unlimited | Minimum time every page displays, before character count is added |
| **Char Multiplier** | 0.03s | 0–unlimited | Additional seconds per character; total time = base + (chars × multiplier) |
| **OCR Fallback** | 15s | 1s–unlimited | If OCR is still running when page loads, use this timer; switches to char-based when OCR completes |

**Examples**:
- Page with 0 chars: `3 + (0 × 0.03) = 3s`
- Page with 100 chars: `3 + (100 × 0.03) = 6s`
- Page with 500 chars: `3 + (500 × 0.03) = 18s`

### Navigation Settings

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| **Manual Navigation Forward** | `continue` / `pause` | `continue` | What happens when you click next page during auto-read |
| **Manual Navigation Backward** | `continue` / `pause` | `pause` | What happens when you click previous page during auto-read |

### Debug Settings

- **Show Debug Panel**: Toggle the debug info box (top-right corner)
  - Shows real-time OCR status for each page
  - Logs script events and timing calculations
  - Essential for troubleshooting

---

## Known Issues

- **Progress bar visual anomalies**: Under certain conditions, the progress bar at the bottom may display erratically or not update smoothly during auto-play. This is cosmetic only and doesn't affect timing accuracy.

- **OCR performance**: On older devices or slow connections, Tesseract.js may take longer to process images. Adjust "OCR Fallback" time if pages advance too quickly/slowly.

- **OCR accuracy**: It's extremely inaccurate on basically all metrics, exept for character count. It will often misread text, especially in stylized fonts or low-resolution images. The script uses character count only for timing, so this is not a functional issue.
  
---

## How OCR Works

The script uses **Tesseract.js** (loaded from CDN), which runs entirely in your browser:

1. When you load a gallery page, the script fetches all page images from nhentai CDN
2. For each image, Tesseract.js extracts text using optical character recognition
3. Character counts are calculated and stored (non-whitespace only)
4. Reading timing is calculated on-the-fly using your configured multiplier

**Note**: First run may take several seconds as Tesseract initializes. Subsequent pages are processed in parallel while you read.

---

## Image Failover & CDN

The script attempts to fetch images from multiple nhentai CDN hosts (`i1.nhentai.net` through `i4.nhentai.net`) and tries multiple formats (`jpg`, `png`, `webp`). If one host/format fails, it automatically tries others, ensuring reliable image loading even if one CDN endpoint is temporarily unavailable.

---

## Troubleshooting

**Auto-read won't start**
- Check that the page title shows "Page X » nhentai" (script only activates on actual gallery pages)
- Open settings and enable "Show Debug Panel" to see if script initialized
- If you see `❌ Init failed`, the page might not be a valid gallery

**OCR taking too long**
- Tesseract.js can be slow on older devices or poor connections
- Increase "OCR Fallback" time if pages are advancing too quickly
- Or use a lower "Char Multiplier" if you want faster overall pacing

**Progress bar looks broken**
- This is a known cosmetic issue; timing is still accurate
- Consider hiding the debug panel if it's distracting

**Pages advancing too quickly/slowly**
- Adjust "Base Delay" or "Char Multiplier" in settings
- Start with small changes (e.g., ±0.5s for base delay, ±0.01 for multiplier)

**Script didn't activate on a gallery**
- Try reloading the page
- Check that Tampermonkey is enabled and the script is installed
- Verify you're on an nhentai gallery page (URL should match `https://nhentai.net/g/*`)

---

## License

See [LICENSE](LICENSE) file for details.
