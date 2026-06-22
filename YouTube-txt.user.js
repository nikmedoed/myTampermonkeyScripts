// ==UserScript==
// @name         YouTube TXT
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      1.0.0
// @description  Скачивает расшифровку текущего YouTube-видео в аккуратный .txt файл одной кнопкой.
// @match        https://www.youtube.com/watch*
// @match        https://youtube.com/watch*
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/youtube-txt.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/youtube-txt.png
// @homepageURL  https://github.com/nikmedoed/myTampermonkeyScripts#youtube-txt
// @supportURL   https://github.com/nikmedoed/myTampermonkeyScripts/issues
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YouTube-txt.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YouTube-txt.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const BUTTON_ID = "yt-txt-transcript-download-button";
    const WAIT_TIMEOUT_MS = 12000;
    const SHORT_DELAY_MS = 350;
    const BUTTON_TEXT = "TXT";

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function isWatchPage() {
        return location.pathname === "/watch" && new URLSearchParams(location.search).has("v");
    }

    function getVideoId() {
        return new URLSearchParams(location.search).get("v") || "youtube-video";
    }

    function normalizeSpaces(text) {
        return String(text || "")
            .replace(/\u00A0/g, " ")
            .replace(/[ \t\r\n]+/g, " ")
            .replace(/\s+([,.!?;:)\]}»])/g, "$1")
            .replace(/([([{«])\s+/g, "$1")
            .trim();
    }

    function sanitizeFileName(name) {
        const cleaned = normalizeSpaces(name)
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/[. ]+$/g, "")
            .slice(0, 160)
            .trim();

        return cleaned || `youtube-transcript-${getVideoId()}`;
    }

    function getVideoTitle() {
        const selectors = [
            "#title > h1 yt-formatted-string",
            "#title > h1",
            "ytd-watch-metadata h1 yt-formatted-string",
            "ytd-watch-metadata h1",
            "h1.ytd-watch-metadata"
        ];

        for (const selector of selectors) {
            const node = document.querySelector(selector);
            const text = normalizeSpaces(node?.textContent || node?.getAttribute("title"));
            if (text) {
                return text;
            }
        }

        return normalizeSpaces(document.title.replace(/- YouTube$/i, ""));
    }

    function downloadTextFile(fileName, text) {
        const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizeFileName(fileName)}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function isVisible(element) {
        if (!element) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0"
        );
    }

    async function waitFor(getValue, timeoutMs = WAIT_TIMEOUT_MS, intervalMs = 150) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            const value = getValue();

            if (value) {
                return value;
            }

            await sleep(intervalMs);
        }

        return null;
    }

    function smartClick(element) {
        if (!element) {
            return false;
        }

        element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        element.click();

        return true;
    }

    async function expandDescriptionIfPossible() {
        const expandButton = document.querySelector("ytd-watch-metadata ytd-text-inline-expander #expand");

        if (expandButton && isVisible(expandButton)) {
            smartClick(expandButton);
            await sleep(SHORT_DELAY_MS);
            return true;
        }

        return false;
    }

    function findTranscriptButton() {
        const directButton = document.querySelector(
            "ytd-video-description-transcript-section-renderer #primary-button button"
        );

        if (directButton) {
            return directButton;
        }

        const transcriptSection = document.querySelector("ytd-video-description-transcript-section-renderer");
        const sectionButton = transcriptSection?.querySelector("button, tp-yt-paper-button, ytd-button-renderer");

        if (sectionButton) {
            return sectionButton.closest("button") || sectionButton;
        }

        const candidates = Array.from(
            document.querySelectorAll("button, tp-yt-paper-button, ytd-button-renderer")
        );

        return candidates.find((node) => {
            const text = normalizeSpaces(
                [
                    node.textContent,
                    node.getAttribute("aria-label"),
                    node.getAttribute("title")
                ].join(" ")
            ).toLowerCase();

            return (
                text.includes("показать текст видео") ||
                text.includes("текст видео") ||
                text.includes("расшифровка") ||
                text.includes("transcript") ||
                text.includes("show transcript")
            );
        }) || null;
    }

    function findTranscriptPanel() {
        const exactPanel = document.querySelector(
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
        );

        if (exactPanel) {
            return exactPanel;
        }

        return Array.from(document.querySelectorAll("ytd-engagement-panel-section-list-renderer"))
            .find((panel) => {
                const text = normalizeSpaces(panel.textContent).toLowerCase();

                return (
                    text.includes("расшифровка видео") ||
                    text.includes("поиск по видео") ||
                    text.includes("transcript")
                );
            }) || null;
    }

    function extractVisibleTranscriptSegments(panel) {
        const segmentNodes = Array.from(panel.querySelectorAll("ytd-transcript-segment-renderer"));

        const rows = [];

        for (const segmentNode of segmentNodes) {
            const timestamp = normalizeSpaces(
                segmentNode.querySelector(".segment-timestamp")?.textContent || ""
            );

            const text = normalizeSpaces(
                segmentNode.querySelector(".segment-text")?.textContent || ""
            );

            if (!text) {
                continue;
            }

            rows.push({
                key: `${timestamp}|||${text}`,
                timestamp,
                text
            });
        }

        return rows;
    }

    function findScrollableParent(element) {
        let node = element;

        while (node && node !== document.body && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10;

            if (canScroll) {
                return node;
            }

            node = node.parentElement;
        }

        return null;
    }

    async function collectTranscriptFromPanel(panel) {
        await waitFor(() => {
            const count = panel.querySelectorAll("ytd-transcript-segment-renderer .segment-text").length;
            const error = panel.querySelector("#error-container:not([hidden])");
            return count > 0 || error;
        }, WAIT_TIMEOUT_MS);

        const segmentsContainer = panel.querySelector("#segments-container");
        const scrollable = segmentsContainer ? findScrollableParent(segmentsContainer) : null;

        const collected = new Map();

        async function collectOnce() {
            const rows = extractVisibleTranscriptSegments(panel);

            for (const row of rows) {
                if (!collected.has(row.key)) {
                    collected.set(row.key, row.text);
                }
            }
        }

        await collectOnce();

        if (scrollable) {
            scrollable.scrollTop = 0;
            await sleep(200);
            await collectOnce();

            let stuckCount = 0;

            for (let i = 0; i < 120; i++) {
                const previousTop = scrollable.scrollTop;

                scrollable.scrollTop = Math.min(
                    scrollable.scrollHeight,
                    scrollable.scrollTop + Math.max(250, Math.floor(scrollable.clientHeight * 0.85))
                );

                await sleep(120);
                await collectOnce();

                const isAtBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 5;

                if (scrollable.scrollTop === previousTop || isAtBottom) {
                    stuckCount += 1;
                } else {
                    stuckCount = 0;
                }

                if (stuckCount >= 2) {
                    break;
                }
            }
        }

        const parts = Array.from(collected.values());
        return normalizeTranscriptText(parts);
    }

    function closeTranscriptPanel(panel) {
        const closeButton =
            panel?.querySelector('#visibility-button button[aria-label]') ||
            panel?.querySelector('#visibility-button button') ||
            panel?.querySelector('button[aria-label="Закрыть"]') ||
            panel?.querySelector('button[aria-label="Close"]');

        if (closeButton) {
            smartClick(closeButton);
        }
    }

    function normalizeTranscriptText(parts) {
        const text = parts
            .map((part) => normalizeSpaces(part))
            .filter(Boolean)
            .join(" ");

        return normalizeSpaces(text);
    }

    async function getTranscriptFromYouTubePanel() {
        await expandDescriptionIfPossible();

        const transcriptButton = await waitFor(() => findTranscriptButton(), 5000);

        if (!transcriptButton) {
            return "";
        }

        smartClick(transcriptButton);

        const panel = await waitFor(() => findTranscriptPanel(), WAIT_TIMEOUT_MS);

        if (!panel) {
            return "";
        }

        const text = await collectTranscriptFromPanel(panel);
        closeTranscriptPanel(panel);

        return text;
    }

    function getPlayerResponse() {
        const moviePlayer = document.querySelector("#movie_player");

        if (moviePlayer && typeof moviePlayer.getPlayerResponse === "function") {
            const response = moviePlayer.getPlayerResponse();

            if (response?.videoDetails?.videoId === getVideoId()) {
                return response;
            }
        }

        if (window.ytInitialPlayerResponse?.videoDetails?.videoId === getVideoId()) {
            return window.ytInitialPlayerResponse;
        }

        const rawPlayerResponse = window.ytplayer?.config?.args?.player_response;

        if (rawPlayerResponse) {
            try {
                const parsed = JSON.parse(rawPlayerResponse);

                if (parsed?.videoDetails?.videoId === getVideoId()) {
                    return parsed;
                }
            } catch (error) {
                console.warn("[YT TXT] Cannot parse ytplayer player_response", error);
            }
        }

        return null;
    }

    function chooseCaptionTrack(captionTracks) {
        if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
            return null;
        }

        const preferredByLanguage = captionTracks.find((track) => {
            const lang = String(track.languageCode || "").toLowerCase();
            const name = normalizeSpaces(track.name?.simpleText || track.name?.runs?.map((run) => run.text).join(" "));
            const full = `${lang} ${name}`.toLowerCase();

            return (
                lang === "ru" ||
                lang.startsWith("ru-") ||
                full.includes("русский") ||
                full.includes("russian")
            );
        });

        if (preferredByLanguage) {
            return preferredByLanguage;
        }

        return captionTracks.find((track) => track.isTranslatable) || captionTracks[0];
    }

    async function fetchCaptionTrackAsJson(track) {
        const separator = track.baseUrl.includes("?") ? "&" : "?";
        const url = `${track.baseUrl}${separator}fmt=json3`;

        const response = await fetch(url, {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Caption request failed: ${response.status}`);
        }

        return response.json();
    }

    function extractTextFromJson3(data) {
        const parts = [];

        for (const event of data?.events || []) {
            if (!Array.isArray(event.segs)) {
                continue;
            }

            const eventText = event.segs
                .map((seg) => seg.utf8 || "")
                .join("")
                .replace(/\n/g, " ");

            const cleaned = normalizeSpaces(eventText);

            if (cleaned) {
                parts.push(cleaned);
            }
        }

        return normalizeTranscriptText(parts);
    }

    async function fetchCaptionTrackAsXml(track) {
        const response = await fetch(track.baseUrl, {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Caption XML request failed: ${response.status}`);
        }

        const xmlText = await response.text();
        const xml = new DOMParser().parseFromString(xmlText, "text/xml");

        return normalizeTranscriptText(
            Array.from(xml.querySelectorAll("text")).map((node) => node.textContent || "")
        );
    }

    async function getTranscriptFromCaptionTracks() {
        const playerResponse = getPlayerResponse();
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const track = chooseCaptionTrack(captionTracks);

        if (!track?.baseUrl) {
            return "";
        }

        try {
            const json = await fetchCaptionTrackAsJson(track);
            const text = extractTextFromJson3(json);

            if (text) {
                return text;
            }
        } catch (error) {
            console.warn("[YT TXT] JSON3 captions failed, trying XML", error);
        }

        try {
            return await fetchCaptionTrackAsXml(track);
        } catch (error) {
            console.warn("[YT TXT] XML captions failed", error);
            return "";
        }
    }

    async function getTranscriptText() {
        let text = await getTranscriptFromYouTubePanel();

        if (text) {
            return text;
        }

        text = await getTranscriptFromCaptionTracks();

        if (text) {
            return text;
        }

        return "";
    }

    function setButtonState(button, text, disabled) {
        button.textContent = text;
        button.disabled = Boolean(disabled);
    }

    async function handleButtonClick(button) {
        if (!isWatchPage()) {
            alert("Это не страница видео YouTube.");
            return;
        }

        const title = getVideoTitle();

        try {
            setButtonState(button, "...", true);

            const transcriptText = await getTranscriptText();

            if (!transcriptText) {
                alert("Текст видео не найден. Возможно, у ролика нет доступной расшифровки/субтитров.");
                return;
            }

            downloadTextFile(title, transcriptText);

            setButtonState(button, "OK", true);
            await sleep(900);
        } catch (error) {
            console.error("[YT TXT] Failed to download transcript", error);
            alert(`Не получилось скачать текст видео: ${error.message || error}`);
        } finally {
            setButtonState(button, BUTTON_TEXT, false);
        }
    }

    function createButton() {
        const button = document.createElement("button");

        button.id = BUTTON_ID;
        button.type = "button";
        button.textContent = BUTTON_TEXT;
        button.title = "Download YouTube transcript as TXT";

        Object.assign(button.style, {
            height: "32px",
            minWidth: "42px",
            padding: "0 10px",
            marginRight: "10px",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: "16px",
            background: "var(--yt-spec-badge-chip-background, rgba(255,255,255,0.1))",
            color: "var(--yt-spec-text-primary, #fff)",
            fontSize: "13px",
            fontWeight: "700",
            lineHeight: "30px",
            cursor: "pointer",
            zIndex: "9999"
        });

        button.addEventListener("mouseenter", () => {
            button.style.filter = "brightness(1.2)";
        });

        button.addEventListener("mouseleave", () => {
            button.style.filter = "";
        });

        button.addEventListener("click", () => {
            handleButtonClick(button);
        });

        return button;
    }

    function addButtonToHeader() {
        if (!isWatchPage()) {
            document.getElementById(BUTTON_ID)?.remove();
            return;
        }

        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        const masthead = document.querySelector("ytd-masthead");
        const center = masthead?.querySelector("#center");
        const end = masthead?.querySelector("#end");

        const parent = center || end;

        if (!parent) {
            return;
        }

        const button = createButton();

        if (center) {
            parent.insertBefore(button, parent.firstChild);
        } else {
            parent.prepend(button);
        }
    }

    function scheduleButtonInstall() {
        setTimeout(addButtonToHeader, 250);
        setTimeout(addButtonToHeader, 1000);
        setTimeout(addButtonToHeader, 2500);
    }

    document.addEventListener("yt-navigate-finish", scheduleButtonInstall);
    document.addEventListener("yt-page-data-updated", scheduleButtonInstall);

    const observer = new MutationObserver(() => {
        addButtonToHeader();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    scheduleButtonInstall();
})();
