// ==UserScript==
// @name         nhentai Dynamic Auto Reader
// @description  Automatically extracts text from nhentai galleries and auto-reads pages based on character count, with user-configurable timing and manual navigation handling.
// @author       equmaq
// @icon         https://www.google.com/s2/favicons?domain=nhentai.net
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/equmaq/nhentai-Dynamic-Auto-Reader/main/userscript.js
// @version      1.0
// @license      GPL-3.0-only
// @match        https://nhentai.net/g/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// ==/UserScript==

(function () {
    'use strict';
    console.log("[NHENTAI OCR] script loaded");
    /**********************
     * CONFIG - Static defaults and DOM selectors
     **********************/
    const CONFIG = {
        DEBUG_DEFAULT: false,
        // DOM selectors for page detection
        PAGE_SELECTOR: 'img[alt*="Page"]',  // Target image on gallery pages
        
        // CDN failover configuration
        MAX_HOSTS: 4,      // Number of nhentai CDN hosts to try (i1-i4)
        EXTS: ["jpg", "png", "webp"],  // Image format fallback order
        RETRY_DELAY: 100,  // Unused legacy value
        MAX_RETRIES: 50,   // Unused legacy value
        
        // Reading timing (all in seconds, converted to ms when used)
        BASE_DELAY_S: 3,           // Minimum time per page
        CHAR_MULTIPLIER: 0.04,     // Additional seconds per non-whitespace character
        OCR_FALLBACK_S: 15,        // Fallback if text extraction fails or times out
        NEXT_BUTTON: '.next',
        PREV_BUTTON: '.previous',
        
        // Page indicators
        CURRENT_PAGE_SPAN: 'span.current',  // Current page number display
        TOTAL_PAGES_SPAN: 'span.num-pages',  // Total pages count
        
        // Default behavior when user manually navigates during auto-read
        MANUAL_NAV_FORWARD: 'continue',  // 'continue' or 'pause' on forward button
        MANUAL_NAV_BACKWARD: 'pause'     // 'continue' or 'pause' on back button
    };

    // Debug mode toggle, persists across sessions
    let DEBUG = GM_getValue("nh_debug", CONFIG.DEBUG_DEFAULT);

    /**
     * User-configurable settings loaded from Tampermonkey storage
     * All timing values stored in seconds for user-friendliness
     */
    const userSettings = {
        baseDelayS: GM_getValue("nh_baseDelayS", CONFIG.BASE_DELAY_S),
        charMultiplier: GM_getValue("nh_charMultiplier", CONFIG.CHAR_MULTIPLIER),
        ocrFallbackS: GM_getValue("nh_ocrFallbackS", CONFIG.OCR_FALLBACK_S),
        manualNavForward: GM_getValue("nh_manualNavForward", CONFIG.MANUAL_NAV_FORWARD),
        manualNavBackward: GM_getValue("nh_manualNavBackward", CONFIG.MANUAL_NAV_BACKWARD)
    };

    /**
     * Timer progress bar - visual feedback during page reading delays
     * Shows at bottom of page, semi-transparent red
     */
    const timerBar = document.createElement("div");
    timerBar.style.cssText = `
        position: fixed; bottom: 0; left: 0; height: 4px; background: #ed2553;
        z-index: 999997; width: 0%; opacity: 0.6; transition: width 0.1s linear;
    `;
    document.body.appendChild(timerBar);

    /**
     * Updates the progress bar width based on elapsed time
     * @param {number} elapsed - Milliseconds elapsed
     * @param {number} total - Total milliseconds in timer
     */
    function updateTimerBar(elapsed, total) {
        const percent = Math.min(100, (elapsed / total) * 100);
        timerBar.style.width = percent + '%';
    }

    /**
     * Tracks reading session state
     * pageData stores OCR results for all pages: { charCount, text, ext }
     */
    const readerState = {
        isReading: false,       // Whether auto-read is currently active
        isPaused: false,        // Whether reading is paused (vs stopped)
        currentPage: 1,         // Current page number from DOM
        maxPages: 0,            // Total pages in gallery
        pageData: {},           // OCR results: { page: { text, charCount, ext } }
        manualNavOccurred: false  // Flag when user manually navigates with 'continue' behavior
    };

    // Debug UI
    const debugBox = document.createElement("div");
    debugBox.style.cssText = `
        position:fixed; top:10px; right:10px; width:420px; max-height:80vh;
        overflow:auto; background:#111; color:#fff; font:12px monospace;
        z-index:999999; padding:10px; border:1px solid #444;
    `;
    debugBox.style.display = DEBUG ? "block" : "none";
    document.body.appendChild(debugBox);

    // Settings dialog
    const settingsDialog = document.createElement("dialog");
    settingsDialog.style.cssText = `
        border: 2px solid #ed2553; border-radius: 8px; padding: 20px;
        background: #1a1a1a; color: #fff; font-family: sans-serif; min-width: 350px;
    `;
    settingsDialog.innerHTML = `
        <h2 style="margin-top: 0; color: #ed2553;">Settings</h2>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Base Delay (seconds):</label>
            <input type="number" id="nh-baseDelayS" min="0.5" step="0.5" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Char Multiplier (seconds per char):</label>
            <input type="number" id="nh-charMultiplier" min="0" step="0.01" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">OCR Fallback (seconds):</label>
            <input type="number" id="nh-ocrFallbackS" min="1" step="1" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Manual Navigation Forward:</label>
            <select id="nh-manualNavForward" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
                <option value="continue">Continue Reading</option>
                <option value="pause">Pause Reading</option>
            </select>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Manual Navigation Backward:</label>
            <select id="nh-manualNavBackward" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
                <option value="continue">Continue Reading</option>
                <option value="pause">Pause Reading</option>
            </select>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox" id="nh-debug" style="margin-right: 8px; cursor: pointer;">
                <span>Show Debug Panel</span>
            </label>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: space-between;">
            <button id="nh-settingsReset" style="padding: 8px 16px; background: #c73a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Reset to Defaults</button>
            <div style="display: flex; gap: 10px;">
                <button id="nh-settingsClose" style="padding: 8px 16px; background: #555; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Close</button>
                <button id="nh-settingsSave" style="padding: 8px 16px; background: #ed2553; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(settingsDialog);

    // Settings button (cog)
    const settingsBtn = document.createElement("button");
    settingsBtn.textContent = "⚙";
    settingsBtn.style.cssText = `
        position:fixed; bottom:80px; right:30px; z-index:999998;
        padding:10px 12px; background:#ed2553; color:#fff; border:none;
        border-radius:5px; cursor:pointer; font:18px sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.3); width: 40px; height: 40px;
        display: flex; align-items: center; justify-content: center;
    `;
    settingsBtn.onclick = () => {
        // Load current values into form
        document.getElementById("nh-baseDelayS").value = userSettings.baseDelayS;
        document.getElementById("nh-charMultiplier").value = userSettings.charMultiplier;
        document.getElementById("nh-ocrFallbackS").value = userSettings.ocrFallbackS;
        document.getElementById("nh-manualNavForward").value = userSettings.manualNavForward;
        document.getElementById("nh-manualNavBackward").value = userSettings.manualNavBackward;
        document.getElementById("nh-debug").checked = DEBUG;
        settingsDialog.showModal();
    };
    document.body.appendChild(settingsBtn);

    // Settings event listeners
    document.getElementById("nh-settingsClose").onclick = () => settingsDialog.close();
    document.getElementById("nh-settingsReset").onclick = () => {
        userSettings.baseDelayS = CONFIG.BASE_DELAY_S;
        userSettings.charMultiplier = CONFIG.CHAR_MULTIPLIER;
        userSettings.ocrFallbackS = CONFIG.OCR_FALLBACK_S;
        userSettings.manualNavForward = CONFIG.MANUAL_NAV_FORWARD;
        userSettings.manualNavBackward = CONFIG.MANUAL_NAV_BACKWARD;
        
        // Update form to show reset values
        document.getElementById("nh-baseDelayS").value = userSettings.baseDelayS;
        document.getElementById("nh-charMultiplier").value = userSettings.charMultiplier;
        document.getElementById("nh-ocrFallbackS").value = userSettings.ocrFallbackS;
        document.getElementById("nh-manualNavForward").value = userSettings.manualNavForward;
        document.getElementById("nh-manualNavBackward").value = userSettings.manualNavBackward;
        
        log("⟲ Settings reset to defaults");
    };
    document.getElementById("nh-settingsSave").onclick = () => {
        userSettings.baseDelayS = parseFloat(document.getElementById("nh-baseDelayS").value);
        userSettings.charMultiplier = parseFloat(document.getElementById("nh-charMultiplier").value);
        userSettings.ocrFallbackS = parseFloat(document.getElementById("nh-ocrFallbackS").value);
        userSettings.manualNavForward = document.getElementById("nh-manualNavForward").value;
        userSettings.manualNavBackward = document.getElementById("nh-manualNavBackward").value;
        DEBUG = document.getElementById("nh-debug").checked;
        
        // Save to storage
        GM_setValue("nh_baseDelayS", userSettings.baseDelayS);
        GM_setValue("nh_charMultiplier", userSettings.charMultiplier);
        GM_setValue("nh_ocrFallbackS", userSettings.ocrFallbackS);
        GM_setValue("nh_manualNavForward", userSettings.manualNavForward);
        GM_setValue("nh_manualNavBackward", userSettings.manualNavBackward);
        GM_setValue("nh_debug", DEBUG);
        
        debugBox.style.display = DEBUG ? "block" : "none";
        settingsDialog.close();
        log("✓ Settings saved");
    };

    // Create play/pause button
    const playPauseBtn = document.createElement("button");
    playPauseBtn.textContent = "▶";
    playPauseBtn.style.cssText = `
        position:fixed; bottom:30px; right:30px; z-index:999998;
        padding:10px 12px; background:#ed2553; color:#fff; border:none;
        border-radius:5px; cursor:pointer; font:20px sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.3); width: 40px; height: 40px;
        display: flex; align-items: center; justify-content: center;
    `;
    playPauseBtn.onclick = toggleAutoRead;
    document.body.appendChild(playPauseBtn);

    function updatePlayPauseBtn() {
        if (readerState.isReading) {
            playPauseBtn.textContent = readerState.isPaused ? "▶" : "⏸";
        } else {
            playPauseBtn.textContent = "▶";
        }
    }

    function log(msg) {
        console.log("[NH-OCR]", msg);
        if (DEBUG) {
            const line = document.createElement("div");
            line.textContent = msg;
            debugBox.appendChild(line);
        }
    }

    function getCurrentPageFromDOM() {
        const span = document.querySelector(CONFIG.CURRENT_PAGE_SPAN);
        return span ? parseInt(span.textContent.trim(), 10) : 1;
    }

    function getPageDelay(charCount) {
        // baseDelay + (charCount * multiplier), returns ms
        return (userSettings.baseDelayS + charCount * userSettings.charMultiplier) * 1000;
    }

    function navigateToNextPage() {
        const btn = document.querySelector(CONFIG.NEXT_BUTTON);
        if (btn) {
            log(`→ Clicking next page button`);
            btn.click();
        }
    }

    function navigateToPrevPage() {
        const btn = document.querySelector(CONFIG.PREV_BUTTON);
        if (btn) {
            log(`← Clicking previous page button`);
            btn.click();
        }
    }

    async function toggleAutoRead() {
        if (!readerState.isReading) {
            // Start reading
            readerState.isReading = true;
            readerState.isPaused = false;
            updatePlayPauseBtn();
            log("▶ Auto-read started");
            await startReadingLoop();
        } else if (!readerState.isPaused) {
            // Pause reading
            readerState.isPaused = true;
            updatePlayPauseBtn();
            log("⏸ Auto-read paused");
        } else {
            // Resume reading
            readerState.isPaused = false;
            updatePlayPauseBtn();
            log("▶ Auto-read resumed");
            await startReadingLoop();
        }
    }

    async function startReadingLoop() {
        readerState.currentPage = getCurrentPageFromDOM();
        readerState.maxPages = getPageCount();

        log(`Starting read loop from page ${readerState.currentPage}/${readerState.maxPages}`);

        while (readerState.isReading && readerState.currentPage <= readerState.maxPages) {
            // Check if paused
            if (readerState.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            // Determine page reading delay
            const pageData = readerState.pageData[readerState.currentPage];
            let delayMs;

            if (pageData && pageData.charCount !== undefined) {
                // OCR succeeded: use character-based timing
                delayMs = getPageDelay(pageData.charCount);
                log(`Page ${readerState.currentPage}: ${pageData.charCount} chars → ${(delayMs / 1000).toFixed(1)}s delay`);
            } else {
                // OCR failed or still processing: use fallback timer
                delayMs = userSettings.ocrFallbackS * 1000;
                log(`Page ${readerState.currentPage}: OCR failed → ${(delayMs / 1000).toFixed(1)}s fallback`);
            }

            // Wait for delay
            const startTime = Date.now();
            while (Date.now() - startTime < delayMs && readerState.isReading && !readerState.isPaused && !readerState.manualNavOccurred) {
                updateTimerBar(Date.now() - startTime, delayMs);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            /**
             * Smart timer adjustment: if OCR finishes while fallback timer is running,
             * recalculate based on actual character count and subtract elapsed time
             */
            if (!readerState.isPaused && pageData && pageData.charCount === undefined && !readerState.manualNavOccurred) {
                const newPageData = readerState.pageData[readerState.currentPage];
                if (newPageData && newPageData.charCount !== undefined) {
                    const elapsed = Date.now() - startTime;
                    const newDelay = getPageDelay(newPageData.charCount);
                    const remaining = Math.max(0, newDelay - elapsed);
                    if (remaining > 0) {
                        log(`Page ${readerState.currentPage}: OCR completed, adjusting timer to ${(remaining / 1000).toFixed(1)}s`);
                        const waitStart = Date.now();
                        while (Date.now() - waitStart < remaining && readerState.isReading && !readerState.isPaused && !readerState.manualNavOccurred) {
                            updateTimerBar(Date.now() - waitStart, remaining);
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }
            }

            // Clear timer bar
            updateTimerBar(0, 1);

            if (readerState.isPaused || !readerState.isReading) break;

            // If manual navigation occurred with 'continue', skip auto-navigation and restart timer
            if (readerState.manualNavOccurred) {
                readerState.manualNavOccurred = false;
                log(`⟲ Restarting timer for page ${readerState.currentPage}`);
                continue;
            }

            // Check if we're at last page
            if (readerState.currentPage >= readerState.maxPages) {
                log(`✓ Reached last page (${readerState.currentPage}/${readerState.maxPages}), stopping auto-read`);
                readerState.isReading = false;
                updatePlayPauseBtn();
                break;
            }

            // Navigate to next page
            navigateToNextPage();

            // Wait for page to change
            let pageChanged = false;
            for (let i = 0; i < 50; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const newPage = getCurrentPageFromDOM();
                if (newPage !== readerState.currentPage) {
                    readerState.currentPage = newPage;
                    pageChanged = true;
                    break;
                }
            }

            if (!pageChanged) {
                log(`⚠ Page didn't change, checking if at max page`);
                readerState.currentPage = getCurrentPageFromDOM();
                if (readerState.currentPage >= readerState.maxPages) {
                    readerState.isReading = false;
                    updatePlayPauseBtn();
                    break;
                }
            }
        }

        readerState.isReading = false;
        updatePlayPauseBtn();
        log("Auto-read stopped");
    }

    function detectManualPageNavigation() {
        let lastPage = getCurrentPageFromDOM();

        setInterval(() => {
            const currentPage = getCurrentPageFromDOM();
            if (currentPage !== lastPage) {
                const direction = currentPage > lastPage ? 'forward' : 'backward';
                const behavior = direction === 'forward' ? userSettings.manualNavForward : userSettings.manualNavBackward;

                log(`↔ Manual page navigation: ${direction} (page ${lastPage} → ${currentPage})`);

                readerState.currentPage = currentPage;

                if (readerState.isReading) {
                    if (behavior === 'pause') {
                        readerState.isPaused = true;
                        updatePlayPauseBtn();
                        log(`⏸ Auto-read paused due to manual ${direction} navigation`);
                    } else if (behavior === 'continue') {
                        // Set flag to skip automatic navigation and use fresh timer for new page
                        readerState.manualNavOccurred = true;
                        log(`→ Continuing auto-read from page ${currentPage}`);
                    }
                }

                lastPage = currentPage;
            }
        }, 500);
    }

    GM_registerMenuCommand("Open Settings", () => {
        settingsBtn.click();
    });

    let worker;

    async function waitFor(condition, delayMs = 100, maxAttempts = 50) {
        for (let i = 0; i < maxAttempts; i++) {
            const result = condition();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        throw new Error(`Timeout after ${maxAttempts * delayMs}ms`);
    }

    /**
     * Initialize Tesseract.js OCR worker
     * Loads library via CDN and sets up engine for text recognition
     */
    async function initOCR() {
        // Inject Tesseract.js library from CDN
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        document.documentElement.appendChild(script);

        // Access via unsafeWindow because Tesseract needs webpage context (not sandbox)
        const Tesseract = await waitFor(() => unsafeWindow.Tesseract);

        // Create OCR worker (reused for all pages)
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        
        // Configure for manga: SINGLE_BLOCK mode works better for text-heavy images
        await worker.setParameters({
            tesseract_create_pdf: '0',  // Don't generate PDF, we only need text
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK  // Treat as single text block
        });
        log("✓ OCR ready");
    }

    function getGalleryId() {
        return location.pathname.match(/\/g\/(\d+)/)?.[1] ?? null;
    }

    function getPageCount() {
        const el = document.querySelector(".num-pages");
        return el ? parseInt(el.textContent.trim(), 10) : 0;
    }

    /**
     * Extract base gallery URL from current page image
     * Parses image src to construct CDN URL for all pages
     * @returns {Object|null} { base: '/galleries/XXXXX/', ext: 'jpg'|'png'|'webp' }
     */
    function getBaseImageUrl() {
        // Try primary selector first
        let img = document.querySelector(CONFIG.PAGE_SELECTOR);

        if (!img) {
            // Fallback: search all images for nhentai gallery URL
            for (const testImg of document.querySelectorAll('img')) {
                const src = testImg.src || '';
                if (src.includes('nhentai.net') && src.includes('/galleries/')) {
                    img = testImg;
                    break;
                }
            }
        }

        if (!img) return null;

        // Extract gallery path and first image extension
        // Example: https://i1.nhentai.net/galleries/123456/1.jpg → /galleries/123456/, jpg
        const match = new URL(img.src).pathname.match(/(\/galleries\/\d+\/)(\d+)\.(jpg|png|webp)/);
        return match ? { base: match[1], ext: match[3] } : null;
    }

    /**
     * Fetch image from nhentai CDN with automatic failover
     * Tries multiple hosts (i1-i4) and formats (jpg/png/webp)
     * @param {number} page - Page number
     * @param {Object} baseUrl - { base: '/galleries/XXXXX/', ext: 'jpg'|'png'|'webp' }
     * @returns {Object} { blob, ext, host } - Image data and which host/format succeeded
     */
    async function fetchImage(page, baseUrl) {
        // Try all host/format combinations
        for (let host = 1; host <= CONFIG.MAX_HOSTS; host++) {
            for (const ext of CONFIG.EXTS) {
                const url = `https://i${host}.nhentai.net${baseUrl.base}${page}.${ext}`;
                try {
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url,
                            responseType: "blob",
                            onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.response) : reject(new Error(`HTTP ${r.status}`)),
                            onerror: reject
                        });
                    });
                    return { blob: response, ext, host };
                } catch (e) {
                    // Continue to next combination
                }
            }
        }
        throw new Error(`Failed to fetch page ${page}`);
    }

    /**
     * Run OCR on image blob
     * @param {Blob} blob - Image data
     * @returns {Object} { text: full OCR output, charCount: non-whitespace characters }
     */
    async function recognizeText(blob) {
        const { data: { text } } = await worker.recognize(blob);
        // Count non-whitespace characters for reading time calculation
        const charCount = text.replace(/\s/g, "").length;
        return { text, charCount };
    }

    async function processPages() {
        const galleryId = getGalleryId();
        const pageCount = getPageCount();
        const baseUrl = getBaseImageUrl();

        if (!galleryId || !pageCount || !baseUrl) {
            log(`❌ Init failed - ID: ${galleryId}, Pages: ${pageCount}, URL: ${baseUrl ? 'found' : 'not found'}`);
            return;
        }

        log(`📖 Gallery: ${galleryId} | Pages: ${pageCount}`);
        log("─".repeat(30));

        readerState.maxPages = pageCount;
        const rows = {};

        // Create page rows
        for (let i = 1; i <= pageCount; i++) {
            const row = document.createElement("div");
            row.textContent = `Page ${i}: pending`;
            debugBox.appendChild(row);
            rows[i] = row;
        }

        // Process each page
        for (let i = 1; i <= pageCount; i++) {
            rows[i].textContent = `Page ${i}: processing...`;
            try {
                const result = await fetchImage(i, baseUrl);
                const { text, charCount } = await recognizeText(result.blob);
                console.log(`[Page ${i}] Detected text:`, text);
                
                // Store page data for reading loop
                readerState.pageData[i] = {
                    text,
                    charCount,
                    ext: result.ext
                };
                
                rows[i].textContent = `Page ${i} (${result.ext}): ${charCount} chars`;
            } catch (e) {
                rows[i].textContent = `Page ${i}: ✗`;
                // Store placeholder data so we know it failed
                readerState.pageData[i] = {
                    text: '',
                    charCount: undefined,
                    ext: 'unknown'
                };
            }
        }
        log("✓ Processing completed");
    }


    /**
     * Main initialization and title monitoring
     * Watches for page title changes to detect SPA navigation
     * (Direct URL checking is unreliable due to SPA's history API)
     */
    (async () => {
        const titlePattern = /Page \d+ » nhentai$/;  // Gallery page title format
        let lastTitle = document.title;
        let lastTitleWasValid = titlePattern.test(lastTitle);

        /**
         * Monitor title for gallery page navigation
         * Reload if leaving valid gallery (SPA doesn't naturally reload)
         */
        setInterval(() => {
            const currentTitle = document.title;
            const currentTitleIsValid = titlePattern.test(currentTitle);

            if (currentTitle !== lastTitle) {
                // Reload if navigating away or switching galleries
                // This reinitializes preprocessing and OCR for new gallery
                if (!currentTitleIsValid || !lastTitleWasValid) {
                    log("🔄 Page changed, reloading...");
                    location.reload();
                }

                lastTitle = currentTitle;
                lastTitleWasValid = currentTitleIsValid;
            }
        }, 100);

        try {
            // Validate title - must match gallery page pattern
            if (!titlePattern.test(document.title)) {
                debugBox.style.display = "none";
                console.log("[NH-OCR] Invalid page - title doesn't match pattern");
                return;
            }

            await waitFor(() => document.querySelector(".num-pages"));
            await waitFor(() => document.querySelector(CONFIG.PAGE_SELECTOR));
            await initOCR();
            
            // Monitor for user-triggered page navigation (forward/back buttons)
            detectManualPageNavigation();
            
            // Preprocess all pages: fetch images and run OCR
            await processPages();
        } catch (e) {
            log(`❌ ERROR: ${e.message}`);
        }
    })();

})();