# Changelog

All notable changes to **nhentai Dynamic Auto Reader** will be documented in this file.

## [v1.4] - 2024-XX-XX

### ✨ Added
- **Dynamic Theme System**: Full UI color customization with 6 built-in presets (`nhentai Pink`, `R34 Green`, `Midnight Blue`, `Toxic Acid`, `Sakura`, `Sunset Orange`) and a custom hex color picker.
- **Real-time Tracking UI**: 
  - Page counter (`Current/Total`)
  - Current page countdown timer
  - Total gallery ETA calculator
- **OCR Progress Indicator**: Live spinner and counter showing image processing status (`X/Y done`).
- **Spacebar Toggle**: Optional keyboard shortcut to pause/resume auto-reading without using the mouse.
- **Input Validation**: Settings dialog now validates numeric inputs against minimum thresholds and displays inline error messages.
- **Visibility Toggles**: Granular checkboxes to show/hide specific UI elements (OCR progress, page counter, timers).

### 🛠 Changed
- **Match URL Expansion**: Updated from `/g/*` to `/*` to support better Single Page Application (SPA) navigation handling across the entire site.
- **Improved CSR/SPA Watcher**: The script now intelligently detects gallery navigation and only hard-reloads when necessary, preventing unnecessary refreshes on non-gallery pages.
- **Memory Management**: Implemented an interval tracking system (`addInterval`/`clearAllIntervals`) to prevent memory leaks on page unload.
- **Char Multiplier Default**: Adjusted default multiplier from `0.03` to `0.04` for slightly more accurate pacing on text-heavy pages.
- **UI Layout**: Consolidated controls into a fixed bottom-right container for cleaner screen real estate.

### 🐛 Fixed
- Settings persistence for newly added UI visibility toggles.
- Timer bar resetting logic when manual navigation occurs.
- Theme application timing to ensure colors load immediately on script initialization.

---

## [v1.0] - Initial Release

### ✨ Added
- Core auto-reading functionality based on OCR character counting.
- Tesseract.js integration for client-side text extraction.
- Configurable base delay, character multiplier, and OCR fallback timing.
- Manual navigation detection with `continue`/`pause` behaviors.
- Basic debug panel and settings dialog.
- Multi-host CDN failover for reliable image fetching.
