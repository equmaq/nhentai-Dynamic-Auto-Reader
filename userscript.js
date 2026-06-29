// ==UserScript==
// @name         nhentai Dynamic Auto Reader
// @description  Automatically extracts text from nhentai galleries and auto-reads pages based on character count, with user-configurable timing and manual navigation handling.
// @author       equmaq
// @icon         https://www.google.com/s2/favicons?domain=nhentai.net
// @namespace    http://tampermonkey.net
// @updateURL    https://raw.githubusercontent.com/equmaq/nhentai-Dynamic-Auto-Reader/main/userscript.js
// @version      1.4
// @license      GPL-3.0-only
// @match        https://nhentai.net/*
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
     * CONFIG & DEFAULTS
     **********************/
    const CONFIG = {
        DEBUG_DEFAULT: false,
        PAGE_SELECTOR: 'img[alt*="Page"]',
        MAX_HOSTS: 4,
        EXTS: ["jpg", "png", "webp"],
        BASE_DELAY_S: 3,
        CHAR_MULTIPLIER: 0.04,
        OCR_FALLBACK_S: 15,
        NEXT_BUTTON: '.next',
        PREV_BUTTON: '.previous',
        CURRENT_PAGE_SPAN: 'span.current',
        TOTAL_PAGES_SPAN: 'span.num-pages',
        MANUAL_NAV_FORWARD: 'continue',
        MANUAL_NAV_BACKWARD: 'pause',

        // THEME PRESETS
        THEME_PRESETS: [
            { name: "nhentai Pink", color: "#ed2754" },
            { name: "R34 Green", color: "#aae5a4" },
            { name: "E621 Blue", color: "#05539e" },
            { name: "Havenly Red", color: "#f90816" },
            { name: "Pornhub Orange", color: "#ff9000" },
            { name: "Custom", color: "#000000" } // Placeholder for custom input
        ]
    };

    let DEBUG = GM_getValue("nh_debug", CONFIG.DEBUG_DEFAULT);

    // User settings
    const userSettings = {
        baseDelayS: GM_getValue("nh_baseDelayS", CONFIG.BASE_DELAY_S),
        charMultiplier: GM_getValue("nh_charMultiplier", CONFIG.CHAR_MULTIPLIER),
        ocrFallbackS: GM_getValue("nh_ocrFallbackS", CONFIG.OCR_FALLBACK_S),
        manualNavForward: GM_getValue("nh_manualNavForward", CONFIG.MANUAL_NAV_FORWARD),
        manualNavBackward: GM_getValue("nh_manualNavBackward", CONFIG.MANUAL_NAV_BACKWARD),
        showOcrProgress: GM_getValue("nh_showOcrProgress", true),
        showPageCounter: GM_getValue("nh_showPageCounter", true),
        showCurrentTimer: GM_getValue("nh_showCurrentTimer", false),
        showTotalTimer: GM_getValue("nh_showTotalTimer", false),
        enableSpacebar: GM_getValue("nh_enableSpacebar", false),
        // Phase 3: Theme
        themeName: GM_getValue("nh_themeName", "nhentai Pink"),
        customThemeColor: GM_getValue("nh_customThemeColor", "#ed2754")
    };

    /**********************
     * PHASE 1: Interval Management
     **********************/
    const intervals = new Set();
    function addInterval(fn, ms) {
        const id = setInterval(fn, ms);
        intervals.add(id);
        return id;
    }
    function clearAllIntervals() {
        intervals.forEach(clearInterval);
        intervals.clear();
    }
    window.addEventListener('beforeunload', clearAllIntervals);

    /**********************
     * CSS Injection
     **********************/
    const style = document.createElement("style");
    style.textContent = `
        @keyframes nh-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .nh-spinner {
            display: inline-block; width: 14px; height: 14px;
            border: 2px solid #555; border-top-color: var(--nh-accent);
            border-radius: 50%; animation: nh-spin 0.8s linear infinite;
            vertical-align: middle; margin-right: 6px;
        }
        .nh-tooltip { position: relative; }
        .nh-tooltip::after {
            content: attr(data-tooltip);
            position: absolute; bottom: 120%; right: 0; left: auto;
            background: #222; color: #fff; padding: 4px 8px; border-radius: 4px;
            font-size: 11px; white-space: nowrap; opacity: 0; pointer-events: none;
            transition: opacity 0.2s; z-index: 1000000;
        }
        .nh-tooltip:hover::after { opacity: 1; }
        .nh-hidden { display: none !important; }
        .nh-fade-out { opacity: 0 !important; transition: opacity 1s ease-out; }
    `;
    document.head.appendChild(style);

    /**********************
     * UI CONTAINER & ELEMENTS
     **********************/
    const uiContainer = document.createElement("div");
    uiContainer.id = "nh-reader-container";
    uiContainer.style.cssText = `
        position: fixed; bottom: 15px; right: 15px; z-index: 999990;
        display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    `;

    // Timer Bar
    const timerBar = document.createElement("div");
    timerBar.style.cssText = `
        position: fixed; bottom: 0; left: 0; height: 4px; background: var(--nh-accent);
        z-index: 999997; width: 0%; opacity: 0.6; transition: width 0.1s linear;
    `;

    // OCR Progress
    const ocrProgressEl = document.createElement("div");
    ocrProgressEl.className = "nh-tooltip";
    ocrProgressEl.dataset.tooltip = "Images processed";
    ocrProgressEl.style.cssText = "color: var(--nh-accent); font: 12px sans-serif; text-align: right; transition: opacity 1s ease-out;";
    const ocrSpinner = document.createElement("span");
    ocrSpinner.className = "nh-spinner";
    ocrProgressEl.appendChild(ocrSpinner);
    ocrProgressEl.appendChild(document.createTextNode("0/0"));

    // Page Counter
    const pageCounterEl = document.createElement("div");
    pageCounterEl.className = "nh-tooltip";
    pageCounterEl.dataset.tooltip = "Current page / Total pages";
    pageCounterEl.style.cssText = "color: var(--nh-accent); font: 13px sans-serif; font-weight: bold; text-align: right;";

    // Current Page Timer
    const currentPageTimerEl = document.createElement("div");
    currentPageTimerEl.className = "nh-tooltip nh-hidden";
    currentPageTimerEl.dataset.tooltip = "Time until next page";
    currentPageTimerEl.style.cssText = "color: var(--nh-accent); font: 11px sans-serif; text-align: right;";

    // Total ETA Timer
    const totalTimerEl = document.createElement("div");
    totalTimerEl.className = "nh-tooltip nh-hidden";
    totalTimerEl.dataset.tooltip = "Estimated time to finish gallery";
    totalTimerEl.style.cssText = "color: var(--nh-accent); font: 11px sans-serif; text-align: right;";

    // Play/Pause Button
    const playPauseBtn = document.createElement("button");
    playPauseBtn.textContent = "▶";
    playPauseBtn.className = "nh-tooltip";
    playPauseBtn.dataset.tooltip = "Play / Pause";
    playPauseBtn.style.cssText = `
        padding:10px 12px; background:var(--nh-accent); color:#fff; border:none;
        border-radius:5px; cursor:pointer; font:20px sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.3); width: 40px; height: 40px;
        display: flex; align-items: center; justify-content: center;
    `;

    // Settings Button
    const settingsBtn = document.createElement("button");
    settingsBtn.textContent = "⚙";
    settingsBtn.className = "nh-tooltip";
    settingsBtn.dataset.tooltip = "Settings";
    settingsBtn.style.cssText = `
        padding:10px 12px; background:var(--nh-accent); color:#fff; border:none;
        border-radius:5px; cursor:pointer; font:18px sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.3); width: 40px; height: 40px;
        display: flex; align-items: center; justify-content: center;
    `;

    // Assemble Container
    uiContainer.appendChild(ocrProgressEl);
    uiContainer.appendChild(pageCounterEl);
    uiContainer.appendChild(currentPageTimerEl);
    uiContainer.appendChild(totalTimerEl);
    uiContainer.appendChild(playPauseBtn);
    uiContainer.appendChild(settingsBtn);

    // Append to Body
    document.body.appendChild(uiContainer);
    document.body.appendChild(timerBar);

    // Debug Box
    const debugBox = document.createElement("div");
    debugBox.style.cssText = `
        position:fixed; top:10px; right:10px; width:420px; max-height:80vh;
        overflow:auto; background:#111; color:#fff; font:12px monospace;
        z-index:999999; padding:10px; border:1px solid #444;
    `;
    debugBox.style.display = DEBUG ? "block" : "none";
    document.body.appendChild(debugBox);

    /**********************
     * READER STATE
     **********************/
    const readerState = {
        isReading: false,
        isPaused: false,
        currentPage: 1,
        maxPages: 0,
        pageData: {},
        manualNavOccurred: false
    };

    /**********************
     * SETTINGS DIALOG
     **********************/
    const settingsDialog = document.createElement("dialog");
    settingsDialog.style.cssText = `
        border: 2px solid var(--nh-accent); border-radius: 8px; padding: 20px;
        background: #1a1a1a; color: #fff; font-family: sans-serif; min-width: 350px;
    `;
    settingsDialog.innerHTML = `
        <h2 style="margin-top: 0; color: var(--nh-accent);">Settings</h2>

        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Base Delay (seconds):</label>
            <input type="number" id="nh-baseDelayS" min="0.5" step="0.5" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
            <span id="nh-baseDelayS-error" style="color: #ff6b6b; font-size: 11px; display: none;"></span>
        </div>
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Char Multiplier (s/char):</label>
            <input type="number" id="nh-charMultiplier" min="0" step="0.01" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
            <span id="nh-charMultiplier-error" style="color: #ff6b6b; font-size: 11px; display: none;"></span>
        </div>
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">OCR Fallback (seconds):</label>
            <input type="number" id="nh-ocrFallbackS" min="1" step="1" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
            <span id="nh-ocrFallbackS-error" style="color: #ff6b6b; font-size: 11px; display: none;"></span>
        </div>
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Manual Nav Forward:</label>
            <select id="nh-manualNavForward" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
                <option value="continue">Continue Reading</option>
                <option value="pause">Pause Reading</option>
            </select>
        </div>
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Manual Nav Backward:</label>
            <select id="nh-manualNavBackward" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;">
                <option value="continue">Continue Reading</option>
                <option value="pause">Pause Reading</option>
            </select>
        </div>
        <hr style="border: 0; border-top: 1px solid #444; margin: 15px 0;">

        <!-- Phase 3: Theme Selection -->
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Theme Color:</label>
            <select id="nh-themeSelect" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555;"></select>
            <div id="nh-customColorContainer" style="display: none; margin-top: 8px;">
                <label style="font-size: 11px; color: #aaa;">Custom Hex Code:</label>
                <input type="color" id="nh-customColor" style="width: 100%; height: 30px; border: none; padding: 0; background: transparent; margin-top: 4px;">
            </div>
        </div>

        <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="nh-showOcrProgress" style="margin-right: 8px;"> Show OCR Progress
            </label>
        </div>
        <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="nh-showPageCounter" style="margin-right: 8px;"> Show Page Counter
            </label>
        </div>
        <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="nh-showCurrentTimer" style="margin-right: 8px;"> Show Current Page Timer
            </label>
        </div>
        <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="nh-showTotalTimer" style="margin-right: 8px;"> Show Total ETA Timer
            </label>
        </div>
        <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="nh-enableSpacebar" style="margin-right: 8px;"> Enable Spacebar Toggle
            </label>
        </div>
        <div style="margin-bottom: 15px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="nh-debug" style="margin-right: 8px;"> Show Debug Panel
            </label>
        </div>

        <div style="display: flex; gap: 10px; justify-content: space-between; margin-top: 15px;">
            <button id="nh-settingsReset" style="padding: 8px 16px; background: #c73a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Reset</button>
            <div style="display: flex; gap: 10px;">
                <button id="nh-settingsClose" style="padding: 8px 16px; background: #555; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Close</button>
                <button id="nh-settingsSave" style="padding: 8px 16px; background:var(--nh-accent); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(settingsDialog);

    /**********************
     * HELPERS & LOGIC
     **********************/
    function log(msg) {
        console.log("[NH-OCR]", msg);
        if (DEBUG) {
            const line = document.createElement("div");
            line.textContent = msg;
            debugBox.appendChild(line);
        }
    }

    function updateTimerBar(elapsed, total) {
        timerBar.style.width = Math.min(100, (elapsed / total) * 100) + '%';
    }

    function getCurrentPageFromDOM() {
        const span = document.querySelector(CONFIG.CURRENT_PAGE_SPAN);
        return span ? parseInt(span.textContent.trim(), 10) : 1;
    }

    function getPageDelay(charCount) {
        return (userSettings.baseDelayS + charCount * userSettings.charMultiplier) * 1000;
    }

    function navigateToNextPage() {
        const btn = document.querySelector(CONFIG.NEXT_BUTTON);
        if (btn) {
            log(`→ Clicking next`);
            btn.click();
        }
    }

    function updatePlayPauseBtn() {
        playPauseBtn.textContent = readerState.isReading ? (readerState.isPaused ? "▶" : "⏸") : "▶";
        playPauseBtn.dataset.tooltip = readerState.isReading ? (readerState.isPaused ? "Resume" : "Pause") : "Start";
    }

    // Visibility Manager
    function applyVisibilitySettings() {
        ocrProgressEl.classList.toggle("nh-hidden", !userSettings.showOcrProgress);
        pageCounterEl.classList.toggle("nh-hidden", !userSettings.showPageCounter);
        currentPageTimerEl.classList.toggle("nh-hidden", !userSettings.showCurrentTimer);
        totalTimerEl.classList.toggle("nh-hidden", !userSettings.showTotalTimer);
    }

    function formatTime(seconds) {
        if (seconds <= 0) return "0s";
        if (seconds < 60) return seconds.toFixed(1) + "s";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s.toFixed(0)}s`;
    }

    function calculateETA() {
        let totalChars = 0;
        for (let p = readerState.currentPage + 1; p <= readerState.maxPages; p++) {
            const data = readerState.pageData[p];
            totalChars += (data && data.charCount !== undefined) ? data.charCount : 0;
        }
        const pagesLeft = readerState.maxPages - readerState.currentPage;
        return (pagesLeft * userSettings.baseDelayS) + (totalChars * userSettings.charMultiplier);
    }

    function updateUI() {
        pageCounterEl.textContent = `${readerState.currentPage}/${readerState.maxPages}`;
        totalTimerEl.textContent = `ETA: ${formatTime(calculateETA())}`;
    }

    /**********************
     * PHASE 3: THEME SYSTEM
     **********************/
    function applyTheme(color) {
        document.documentElement.style.setProperty('--nh-accent', color);
    }

    function initThemeSelect() {
        const select = document.getElementById("nh-themeSelect");
        select.innerHTML = "";
        CONFIG.THEME_PRESETS.forEach(theme => {
            const opt = document.createElement("option");
            opt.value = theme.name;
            opt.textContent = theme.name;
            if (theme.name === userSettings.themeName) opt.selected = true;
            select.appendChild(opt);
        });

        // Custom color input logic
        const customContainer = document.getElementById("nh-customColorContainer");
        const customInput = document.getElementById("nh-customColor");

        customInput.value = userSettings.customThemeColor;

        function updateThemeUI() {
            const selected = select.value;
            if (selected === "Custom") {
                customContainer.style.display = "block";
                applyTheme(customInput.value);
            } else {
                customContainer.style.display = "none";
                const preset = CONFIG.THEME_PRESETS.find(t => t.name === selected);
                if (preset) applyTheme(preset.color);
            }
        }

        select.addEventListener("change", updateThemeUI);
        customInput.addEventListener("input", () => {
            if (select.value === "Custom") applyTheme(customInput.value);
        });

        // Initial load
        updateThemeUI();
    }

    /**********************
     * VALIDATION & SETTINGS HANDLERS
     **********************/
    function clearValidationErrors() {
        document.querySelectorAll('[id$="-error"]').forEach(el => { el.style.display = 'none'; el.textContent = ''; });
    }
    function showFieldError(id, msg) {
        const el = document.getElementById(id);
        if (el) { el.textContent = msg; el.style.display = 'inline'; }
    }
    function validateSettings() {
        let ok = true;
        clearValidationErrors();
        const bd = parseFloat(document.getElementById("nh-baseDelayS").value);
        if (isNaN(bd) || bd < 0.5) { showFieldError("nh-baseDelayS-error", "≥ 0.5 required"); ok = false; }
        const cm = parseFloat(document.getElementById("nh-charMultiplier").value);
        if (isNaN(cm) || cm < 0) { showFieldError("nh-charMultiplier-error", "≥ 0 required"); ok = false; }
        const of = parseFloat(document.getElementById("nh-ocrFallbackS").value);
        if (isNaN(of) || of < 1) { showFieldError("nh-ocrFallbackS-error", "≥ 1 required"); ok = false; }
        return ok;
    }

    settingsBtn.onclick = () => {
        document.getElementById("nh-baseDelayS").value = userSettings.baseDelayS;
        document.getElementById("nh-charMultiplier").value = userSettings.charMultiplier;
        document.getElementById("nh-ocrFallbackS").value = userSettings.ocrFallbackS;
        document.getElementById("nh-manualNavForward").value = userSettings.manualNavForward;
        document.getElementById("nh-manualNavBackward").value = userSettings.manualNavBackward;
        document.getElementById("nh-showOcrProgress").checked = userSettings.showOcrProgress;
        document.getElementById("nh-showPageCounter").checked = userSettings.showPageCounter;
        document.getElementById("nh-showCurrentTimer").checked = userSettings.showCurrentTimer;
        document.getElementById("nh-showTotalTimer").checked = userSettings.showTotalTimer;
        document.getElementById("nh-enableSpacebar").checked = userSettings.enableSpacebar;
        document.getElementById("nh-debug").checked = DEBUG;

        initThemeSelect();
        clearValidationErrors();
        settingsDialog.showModal();
    };

    document.getElementById("nh-settingsClose").onclick = () => settingsDialog.close();
    document.getElementById("nh-settingsReset").onclick = () => {
        Object.assign(userSettings, {
            baseDelayS: CONFIG.BASE_DELAY_S, charMultiplier: CONFIG.CHAR_MULTIPLIER,
            ocrFallbackS: CONFIG.OCR_FALLBACK_S, manualNavForward: CONFIG.MANUAL_NAV_FORWARD,
            manualNavBackward: CONFIG.MANUAL_NAV_BACKWARD, showOcrProgress: true,
            showPageCounter: true, showCurrentTimer: false, showTotalTimer: false,
            enableSpacebar: false, themeName: "nhentai Pink", customThemeColor: "#ed2754"
        });
        DEBUG = CONFIG.DEBUG_DEFAULT;
        settingsBtn.click();
        log("⟲ Reset to defaults");
    };

    document.getElementById("nh-settingsSave").onclick = () => {
        if (!validateSettings()) { log("⚠ Invalid settings"); return; }
        userSettings.baseDelayS = parseFloat(document.getElementById("nh-baseDelayS").value);
        userSettings.charMultiplier = parseFloat(document.getElementById("nh-charMultiplier").value);
        userSettings.ocrFallbackS = parseFloat(document.getElementById("nh-ocrFallbackS").value);
        userSettings.manualNavForward = document.getElementById("nh-manualNavForward").value;
        userSettings.manualNavBackward = document.getElementById("nh-manualNavBackward").value;
        userSettings.showOcrProgress = document.getElementById("nh-showOcrProgress").checked;
        userSettings.showPageCounter = document.getElementById("nh-showPageCounter").checked;
        userSettings.showCurrentTimer = document.getElementById("nh-showCurrentTimer").checked;
        userSettings.showTotalTimer = document.getElementById("nh-showTotalTimer").checked;
        userSettings.enableSpacebar = document.getElementById("nh-enableSpacebar").checked;
        DEBUG = document.getElementById("nh-debug").checked;

        // Save Theme
        userSettings.themeName = document.getElementById("nh-themeSelect").value;
        if (userSettings.themeName === "Custom") {
            userSettings.customThemeColor = document.getElementById("nh-customColor").value;
            applyTheme(userSettings.customThemeColor);
        }

        GM_setValue("nh_baseDelayS", userSettings.baseDelayS);
        GM_setValue("nh_charMultiplier", userSettings.charMultiplier);
        GM_setValue("nh_ocrFallbackS", userSettings.ocrFallbackS);
        GM_setValue("nh_manualNavForward", userSettings.manualNavForward);
        GM_setValue("nh_manualNavBackward", userSettings.manualNavBackward);
        GM_setValue("nh_showOcrProgress", userSettings.showOcrProgress);
        GM_setValue("nh_showPageCounter", userSettings.showPageCounter);
        GM_setValue("nh_showCurrentTimer", userSettings.showCurrentTimer);
        GM_setValue("nh_showTotalTimer", userSettings.showTotalTimer);
        GM_setValue("nh_enableSpacebar", userSettings.enableSpacebar);
        GM_setValue("nh_themeName", userSettings.themeName);
        GM_setValue("nh_customThemeColor", userSettings.customThemeColor);
        GM_setValue("nh_debug", DEBUG);

        debugBox.style.display = DEBUG ? "block" : "none";
        applyVisibilitySettings();
        settingsDialog.close();
        log("✓ Settings saved");
    };

    /**********************
     * READING LOOP & NAV
     **********************/
    async function toggleAutoRead() {
        if (!readerState.isReading) {
            readerState.isReading = true;
            readerState.isPaused = false;
            updatePlayPauseBtn();
            if (userSettings.showCurrentTimer) currentPageTimerEl.classList.remove("nh-hidden");
            if (userSettings.showTotalTimer) totalTimerEl.classList.remove("nh-hidden");
            log("▶ Auto-read started");
            await startReadingLoop();
        } else if (!readerState.isPaused) {
            readerState.isPaused = true;
            updatePlayPauseBtn();
            log("⏸ Paused");
        } else {
            readerState.isPaused = false;
            updatePlayPauseBtn();
            log("▶ Resumed");
            await startReadingLoop();
        }
    }

    playPauseBtn.onclick = toggleAutoRead;

    // Spacebar toggle
    document.addEventListener("keydown", (e) => {
        if (e.key === " " && !e.repeat && document.activeElement.tagName !== "INPUT" && userSettings.enableSpacebar) {
            e.preventDefault();
            toggleAutoRead();
        }
    });

    async function startReadingLoop() {
        readerState.currentPage = getCurrentPageFromDOM();
        readerState.maxPages = getPageCount();
        log(`Loop: page ${readerState.currentPage}/${readerState.maxPages}`);

        while (readerState.isReading && readerState.currentPage <= readerState.maxPages) {
            if (readerState.isPaused) {
                await new Promise(r => setTimeout(r, 100));
                continue;
            }

            const pageData = readerState.pageData[readerState.currentPage];
            let delayMs = pageData?.charCount !== undefined
                ? getPageDelay(pageData.charCount)
                : userSettings.ocrFallbackS * 1000;

            log(`P${readerState.currentPage}: ${(delayMs/1000).toFixed(1)}s`);
            updateUI();

            const startTime = Date.now();
            while (Date.now() - startTime < delayMs && readerState.isReading && !readerState.isPaused && !readerState.manualNavOccurred) {
                const elapsed = Date.now() - startTime;
                updateTimerBar(elapsed, delayMs);
                currentPageTimerEl.textContent = formatTime((delayMs - elapsed) / 1000);
                await new Promise(r => setTimeout(r, 100));
            }

            updateTimerBar(0, 1);
            if (readerState.isPaused || !readerState.isReading) break;

            if (readerState.manualNavOccurred) {
                readerState.manualNavOccurred = false;
                log(`⟲ Nav occurred, restarting P${readerState.currentPage}`);
                continue;
            }

            if (readerState.currentPage >= readerState.maxPages) {
                log(`✓ Finished`);
                readerState.isReading = false;
                updatePlayPauseBtn();
                currentPageTimerEl.classList.add("nh-hidden");
                totalTimerEl.classList.add("nh-hidden");
                break;
            }

            navigateToNextPage();
            let pageChanged = false;
            for (let i = 0; i < 50; i++) {
                await new Promise(r => setTimeout(r, 100));
                const np = getCurrentPageFromDOM();
                if (np !== readerState.currentPage) {
                    readerState.currentPage = np;
                    pageChanged = true;
                    break;
                }
            }
            if (!pageChanged) {
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
        currentPageTimerEl.classList.add("nh-hidden");
        totalTimerEl.classList.add("nh-hidden");
        log("Stopped");
    }

    function detectManualPageNavigation() {
        let lastPage = getCurrentPageFromDOM();
        addInterval(() => {
            const cp = getCurrentPageFromDOM();
            if (cp !== lastPage) {
                const dir = cp > lastPage ? 'fwd' : 'bwd';
                const behavior = dir === 'fwd' ? userSettings.manualNavForward : userSettings.manualNavBackward;
                log(`↔ Manual ${dir} (${lastPage}→${cp})`);
                readerState.currentPage = cp;
                if (readerState.isReading) {
                    if (behavior === 'pause') {
                        readerState.isPaused = true;
                        updatePlayPauseBtn();
                    } else {
                        readerState.manualNavOccurred = true;
                    }
                }
                lastPage = cp;
            }
        }, 500);
    }

    GM_registerMenuCommand("Settings", () => settingsBtn.click());

    /**********************
     * OCR & PROCESSING
     **********************/
    let worker;
    async function waitFor(cond, delay = 100, max = 50) {
        for (let i = 0; i < max; i++) {
            const r = cond();
            if (r) return r;
            await new Promise(r => setTimeout(r, delay));
        }
        throw new Error(`Timeout`);
    }

    async function initOCR() {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        document.documentElement.appendChild(s);
        const Tesseract = await waitFor(() => unsafeWindow.Tesseract);
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters({ tesseract_create_pdf: '0', tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
        log("✓ OCR ready");
    }

    function getGalleryId() { return location.pathname.match(/\/g\/(\d+)/)?.[1] ?? null; }
    function getPageCount() { const el = document.querySelector(".num-pages"); return el ? parseInt(el.textContent.trim(), 10) : 0; }
    function isGalleryIndexPage() { return !document.querySelector(CONFIG.PAGE_SELECTOR); }

    // CSR Helper: Check if we are on a valid gallery page
    function isGalleryPage() {
        return document.title.match(/Page \d+ » nhentai$/) && !!document.querySelector(".num-pages");
    }

    function getBaseImageUrl() {
        let img = document.querySelector(CONFIG.PAGE_SELECTOR);
        if (!img) {
            for (const t of document.querySelectorAll('img')) {
                if (t.src?.includes('/galleries/')) { img = t; break; }
            }
        }
        if (!img) return null;
        const m = new URL(img.src).pathname.match(/(\/galleries\/\d+\/)\d+\.(jpg|png|webp)/);
        return m ? { base: m[1], ext: m[2] } : null;
    }

    async function fetchImage(page, baseUrl) {
        for (let h = 1; h <= CONFIG.MAX_HOSTS; h++) {
            for (const ext of CONFIG.EXTS) {
                const url = `https://i${h}.nhentai.net${baseUrl.base}${page}.${ext}`;
                try {
                    const res = await new Promise((ok, fail) => GM_xmlhttpRequest({
                        method: "GET", url, responseType: "blob",
                        onload: r => (r.status >= 200 && r.status < 300) ? ok(r.response) : fail(),
                        onerror: fail
                    }));
                    return { blob: res, ext, host: h };
                } catch {}
            }
        }
        throw new Error(`Fetch failed P${page}`);
    }

    async function recognizeText(blob) {
        const { data: { text } } = await worker.recognize(blob);
        return { text, charCount: text.replace(/\s/g, "").length };
    }

    async function processPages() {
        const gid = getGalleryId();
        const pc = getPageCount();
        const bu = getBaseImageUrl();
        if (!gid || !pc || !bu) { log(`❌ Init fail`); return; }
        log(`📖 ${gid} | ${pc} pages`);
        readerState.maxPages = pc;
        const rows = {};
        for (let i = 1; i <= pc; i++) {
            const r = document.createElement("div");
            r.textContent = `P${i}: pending`;
            debugBox.appendChild(r);
            rows[i] = r;
        }
        for (let i = 1; i <= pc; i++) {
            rows[i].textContent = `P${i}: proc...`;
            ocrProgressEl.lastChild.textContent = `${i}/${pc}`;
            try {
                const res = await fetchImage(i, bu);
                const { text, charCount } = await recognizeText(res.blob);
                readerState.pageData[i] = { text, charCount, ext: res.ext };
                rows[i].textContent = `P${i} (${res.ext}): ${charCount}c`;
            } catch {
                readerState.pageData[i] = { text: '', charCount: undefined, ext: '?' };
                rows[i].textContent = `P${i}: ✗`;
            }
        }
        ocrProgressEl.lastChild.textContent = `${pc}/${pc} done`;
        ocrProgressEl.classList.add("nh-fade-out");
        setTimeout(() => ocrProgressEl.classList.add("nh-hidden"), 1000);
        log("✓ Processing done");
    }

    /**********************
     * INIT & CSR WATCHER
     **********************/
    (async () => {
        // Phase 3: Apply Theme immediately
        if (userSettings.themeName === "Custom") {
            applyTheme(userSettings.customThemeColor);
        } else {
            const preset = CONFIG.THEME_PRESETS.find(t => t.name === userSettings.themeName);
            if (preset) applyTheme(preset.color);
        }

        applyVisibilitySettings();

        // CSR Watcher Logic
        if (isGalleryPage()) {
            // We are already on a gallery page, proceed normally
            try {
                await waitFor(() => document.querySelector(".num-pages"));
                await waitFor(() => document.querySelector(CONFIG.PAGE_SELECTOR));
                await initOCR();
                detectManualPageNavigation();
                await processPages();
            } catch (e) {
                log(`❌ ${e.message}`);
            }
        } else {
            // We are NOT on a gallery page (e.g. Homepage).
            // Start a watcher. If a gallery page is loaded, reload completely.
            log("👁 Watching for gallery navigation...");
            addInterval(() => {
                if (isGalleryPage()) {
                    log("🔄 Gallery detected, reloading page...");
                    clearAllIntervals(); // Stop watcher
                    location.reload();   // Hard reload to initialize script on gallery
                }
            }, 1000);

            // Hide UI elements on non-gallery pages
            uiContainer.style.display = "none";
        }
    })();

})();
