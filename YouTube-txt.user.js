// ==UserScript==
// @name         YouTube TXT
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      1.0.10
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
    const PANEL_SEGMENTS_TIMEOUT_MS = 8000;
    const SHORT_DELAY_MS = 350;
    const BUTTON_TEXT = "TXT";
    const SCRIPT_VERSION = "1.0.10";

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

    function getElementTextForMatching(element) {
        return normalizeSpaces(
            [
                element?.textContent,
                element?.getAttribute?.("aria-label"),
                element?.getAttribute?.("title"),
                element?.querySelector?.("[aria-label]")?.getAttribute("aria-label"),
                element?.querySelector?.("[title]")?.getAttribute("title")
            ].filter(Boolean).join(" ")
        ).toLowerCase();
    }

    function getClickableElement(element) {
        return (
            element?.closest?.("button, tp-yt-paper-button, [role='button']") ||
            element?.querySelector?.("button, tp-yt-paper-button, [role='button']") ||
            element
        );
    }

    function pickHighestScore(candidates) {
        return candidates.reduce((best, candidate) => {
            if (!best || candidate.score > best.score) {
                return candidate;
            }

            return best;
        }, null);
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
            return getClickableElement(sectionButton);
        }

        const candidates = Array.from(
            document.querySelectorAll(
                [
                    "button",
                    "tp-yt-paper-button",
                    "ytd-button-renderer",
                    "chip-view-model button",
                    "[role='tab']",
                    "[role='button']"
                ].join(", ")
            )
        );

        const best = pickHighestScore(candidates
            .map((node) => {
                const text = getElementTextForMatching(node);
                let score = 0;

                if (text.includes("показать текст видео") || text.includes("show transcript")) {
                    score += 100;
                }

                if (text.includes("текст видео") || text.includes("расшифровка видео")) {
                    score += 80;
                }

                if (text.includes("расшифровк") || text.includes("transcript")) {
                    score += 60;
                }

                if (text.includes("поиск в расшифровке") || text.includes("search transcript")) {
                    score -= 100;
                }

                if (text.includes("закрыть") || text.includes("close") || text.includes("комментарии") || text.includes("comments")) {
                    score -= 100;
                }

                return {
                    node: getClickableElement(node),
                    score
                };
            })
            .filter((candidate) => candidate.score > 0 && candidate.node && isVisible(candidate.node)));

        return best?.node || null;
    }

    function findTranscriptPanel() {
        const panels = Array.from(document.querySelectorAll("ytd-engagement-panel-section-list-renderer"));
        const best = pickHighestScore(panels
            .map((panel) => ({
                panel,
                score: getTranscriptPanelScore(panel)
            }))
            .filter((candidate) => candidate.score > 0));

        return best?.panel || null;
    }

    function findTranscriptPanelWithSegments() {
        const panels = Array.from(document.querySelectorAll("ytd-engagement-panel-section-list-renderer"));

        const best = panels
            .map((panel) => {
                const segments = extractTranscriptSegments(panel).length;

                return {
                    panel,
                    segments,
                    score: (segments * 1000) + getTranscriptPanelScore(panel)
                };
            })
            .filter((candidate) => candidate.segments > 0)
            .reduce((currentBest, candidate) => {
                if (!currentBest || candidate.score > currentBest.score) {
                    return candidate;
                }

                return currentBest;
            }, null);

        return best?.panel || null;
    }

    function findTranscriptPanelWithStructuredSegments() {
        const panels = Array.from(document.querySelectorAll("ytd-engagement-panel-section-list-renderer"));

        const best = panels
            .map((panel) => {
                const segments = extractVisibleTranscriptSegments(panel).length;

                return {
                    panel,
                    segments,
                    score: (segments * 1000) + getTranscriptPanelScore(panel)
                };
            })
            .filter((candidate) => candidate.segments > 0)
            .reduce((currentBest, candidate) => {
                if (!currentBest || candidate.score > currentBest.score) {
                    return candidate;
                }

                return currentBest;
            }, null);

        return best?.panel || null;
    }

    function findLikelyTranscriptPanel() {
        const panelWithSegments = findTranscriptPanelWithSegments();

        if (panelWithSegments) {
            return panelWithSegments;
        }

        return findTranscriptPanel();
    }

    function getTranscriptPanelScore(panel) {
        const text = normalizeSpaces(panel.textContent).toLowerCase();
        const targetId = panel.getAttribute("target-id") || "";
        let score = 0;

        if (targetId === "engagement-panel-searchable-transcript") {
            score += 20;
        }

        if (panel.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
            score += 10;
        }

        if (panel.querySelector('[data-target-id="PAmodern_transcript_view"]')) {
            score += 120;
        }

        if (panel.querySelector("transcript-segment-view-model, ytd-transcript-segment-renderer")) {
            score += 100;
        }

        if (/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(text)) {
            score += 80;
        }

        if (text.includes("поиск в расшифровке") || text.includes("search transcript")) {
            score += 60;
        }

        if (text.includes("хронология") && !text.includes("поиск в расшифровке") && !panel.querySelector("transcript-segment-view-model, ytd-transcript-segment-renderer")) {
            score = 0;
        }

        if (text.includes("расшифровка видео") || text.includes("transcript")) {
            score += 30;
        }

        if (text.length < 100 && score < 100) {
            score = 0;
        }

        return score;
    }

    function extractVisibleTranscriptSegments(panel) {
        const segmentNodes = Array.from(
            panel.querySelectorAll(
                [
                    "ytd-transcript-segment-renderer",
                    "transcript-segment-view-model",
                    ".ytwTranscriptSegmentViewModelHost"
                ].join(", ")
            )
        );

        const rows = [];

        for (const segmentNode of segmentNodes) {
            const timestamp = normalizeSpaces(
                segmentNode.querySelector(
                    [
                        ".segment-timestamp",
                        ".ytwTranscriptSegmentViewModelTimestamp",
                        "[class*='Timestamp'][aria-hidden='true']"
                    ].join(", ")
                )?.textContent || ""
            );

            let text = normalizeSpaces(
                segmentNode.querySelector(
                    [
                        ".segment-text",
                        ".ytAttributedStringHost[role='text']",
                        "span[role='text']",
                        "[role='text']"
                    ].join(", ")
                )?.textContent || ""
            );

            if (!text) {
                const clone = segmentNode.cloneNode(true);

                clone.querySelectorAll(
                    [
                        ".segment-timestamp",
                        ".ytwTranscriptSegmentViewModelTimestamp",
                        ".ytwTranscriptSegmentViewModelTimestampA11yLabel",
                        "[class*='Timestamp']"
                    ].join(", ")
                ).forEach((node) => node.remove());

                text = normalizeSpaces(clone.textContent || "");
            }

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

    function extractTranscriptSegmentsFromPanelText(panel) {
        const rawText = normalizeSpaces(panel?.textContent || "");
        const markerRegex = /(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\s+/g;
        const matches = Array.from(rawText.matchAll(markerRegex));

        if (matches.length === 0) {
            return [];
        }

        const rows = [];

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const timestamp = match[1];
            const textStart = match.index + match[0].length;
            const textEnd = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
            const text = cleanPanelTextSegment(rawText.slice(textStart, textEnd));

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

    function cleanPanelTextSegment(text) {
        return normalizeSpaces(text)
            .replace(
                /^(?:(?:\d+\s+)?(?:час(?:а|ов)?|hour(?:s)?)\s*)?(?:(?:\d+\s+)?(?:минут(?:а|ы)?|minute(?:s)?)\s*)?(?:\d+\s+)?(?:секунд(?:а|ы)?|second(?:s)?)\s+/i,
                ""
            )
            .replace(/\s+(?:Показывать комментарии к текущему моменту видео|Show comments at the current video moment).*$/i, "")
            .trim();
    }

    function timestampToSeconds(timestamp) {
        const parts = String(timestamp || "").split(":").map((part) => Number(part));

        if (parts.some((part) => !Number.isFinite(part))) {
            return Number.MAX_SAFE_INTEGER;
        }

        return parts.reduce((total, part) => total * 60 + part, 0);
    }

    function decodeHtmlEntities(text) {
        const namedEntities = {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
            nbsp: " "
        };

        return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
            const lowerBody = body.toLowerCase();

            if (lowerBody.startsWith("#x")) {
                return String.fromCodePoint(parseInt(lowerBody.slice(2), 16));
            }

            if (lowerBody.startsWith("#")) {
                return String.fromCodePoint(parseInt(lowerBody.slice(1), 10));
            }

            return Object.prototype.hasOwnProperty.call(namedEntities, lowerBody)
                ? namedEntities[lowerBody]
                : entity;
        });
    }

    function extractTranscriptSegments(panel) {
        const structuredRows = extractVisibleTranscriptSegments(panel);

        if (structuredRows.length > 0) {
            return structuredRows;
        }

        if (!isTranscriptTextPanel(panel)) {
            return [];
        }

        return extractTranscriptSegmentsFromPanelText(panel);
    }

    function isTranscriptTextPanel(panel) {
        const text = normalizeSpaces(panel?.textContent || "").toLowerCase();

        return Boolean(
            panel?.querySelector('[data-target-id="PAmodern_transcript_view"], transcript-segment-view-model, ytd-transcript-segment-renderer, .ytwTranscriptSegmentViewModelHost') ||
            text.includes("поиск в расшифровке") ||
            text.includes("search transcript")
        );
    }

    function findScrollableParent(element) {
        let node = element;
        let bestCandidate = null;

        while (node && node !== document.body && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            const hasScrollableContent = node.scrollHeight > node.clientHeight + 10;
            const hasScrollableOverflow = /(auto|scroll|overlay)/.test(style.overflowY);

            if (hasScrollableContent && hasScrollableOverflow) {
                return node;
            }

            if (hasScrollableContent && !bestCandidate) {
                bestCandidate = node;
            }

            node = node.parentElement;
        }

        return bestCandidate;
    }

    function findTranscriptScrollContainer(panel) {
        const anchors = Array.from(
            panel.querySelectorAll(
                [
                    "#segments-container",
                    ".ytSectionListRendererContents",
                    "ytd-transcript-segment-list-renderer",
                    "yt-section-list-renderer[data-target-id='PAmodern_transcript_view']",
                    "[data-target-id='PAmodern_transcript_view']",
                    "transcript-segment-view-model",
                    "ytd-transcript-segment-renderer"
                ].join(", ")
            )
        );

        for (const anchor of anchors) {
            const scrollable = findScrollableParent(anchor);

            if (scrollable && panel.contains(scrollable)) {
                return scrollable;
            }
        }

        return findScrollableParent(panel);
    }

    function nudgeScroll(scrollable) {
        scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
        scrollable.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: Math.max(300, Math.floor(scrollable.clientHeight * 0.85))
        }));
    }

    async function collectTranscriptFromPanel(panel) {
        await waitFor(() => {
            const count = extractTranscriptSegments(panel).length;
            const error = panel.querySelector("#error-container:not([hidden])");
            return count > 0 || error;
        }, WAIT_TIMEOUT_MS);

        const scrollable = findTranscriptScrollContainer(panel);

        const collected = new Map();

        async function collectOnce() {
            const rows = extractTranscriptSegments(panel);

            for (const row of rows) {
                if (!collected.has(row.key)) {
                    collected.set(row.key, row);
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
                nudgeScroll(scrollable);

                await sleep(180);
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

        const parts = Array.from(collected.values())
            .sort((a, b) => timestampToSeconds(a.timestamp) - timestampToSeconds(b.timestamp))
            .map((row) => row.text);
        return normalizeTranscriptText(parts);
    }

    function getTranscriptDebugInfo(panel) {
        return {
            version: SCRIPT_VERSION,
            panels: document.querySelectorAll("ytd-engagement-panel-section-list-renderer").length,
            panelScores: Array.from(document.querySelectorAll("ytd-engagement-panel-section-list-renderer"))
                .map((candidatePanel) => ({
                    score: getTranscriptPanelScore(candidatePanel),
                    chars: normalizeSpaces(candidatePanel.textContent || "").length,
                    sample: normalizeSpaces(candidatePanel.textContent || "").slice(0, 80)
                })),
            structuredSegments: panel ? extractVisibleTranscriptSegments(panel).length : 0,
            textSegments: panel ? extractTranscriptSegmentsFromPanelText(panel).length : 0,
            panelTextLength: normalizeSpaces(panel?.textContent || "").length,
            panelSample: normalizeSpaces(panel?.textContent || "").slice(0, 300)
        };
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

        const alreadyOpenPanel = findTranscriptPanelWithStructuredSegments() || findLikelyTranscriptPanel();

        if (alreadyOpenPanel) {
            const hasTranscriptContent = extractTranscriptSegments(alreadyOpenPanel).length > 0;
            const alreadyOpenText = hasTranscriptContent ? await collectTranscriptFromPanel(alreadyOpenPanel) : "";

            if (alreadyOpenText) {
                closeTranscriptPanel(alreadyOpenPanel);
                return alreadyOpenText;
            }
        }

        const transcriptButton = await waitFor(() => findTranscriptButton(), 5000);

        if (!transcriptButton) {
            console.warn("[YT TXT] Transcript button not found", getTranscriptDebugInfo(alreadyOpenPanel));
            return "";
        }

        smartClick(transcriptButton);

        let panel = await waitFor(() => findTranscriptPanelWithStructuredSegments(), PANEL_SEGMENTS_TIMEOUT_MS);

        if (!panel) {
            panel = await waitFor(() => findLikelyTranscriptPanel(), 2500);
        }

        if (!panel) {
            console.warn("[YT TXT] Transcript panel not found", getTranscriptDebugInfo(null));
            return "";
        }

        let text = await collectTranscriptFromPanel(panel);

        if (!text) {
            await sleep(500);
            const freshPanel = findTranscriptPanelWithStructuredSegments() || findLikelyTranscriptPanel();

            if (freshPanel) {
                panel = freshPanel;
                text = await collectTranscriptFromPanel(panel);
            }
        }

        if (!text) {
            console.warn("[YT TXT] Transcript panel found but no text extracted", getTranscriptDebugInfo(panel));
        }
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

        const responseText = await response.text();

        if (!responseText.trim()) {
            throw new Error("Caption JSON3 response is empty");
        }

        return JSON.parse(responseText);
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
        const parts = [];
        const textNodeRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
        let match;

        while ((match = textNodeRegex.exec(xmlText)) !== null) {
            parts.push(decodeHtmlEntities(match[1]));
        }

        if (parts.length === 0) {
            console.warn("[YT TXT] Caption XML response has no text nodes", {
                version: SCRIPT_VERSION,
                length: xmlText.length,
                sample: xmlText.slice(0, 300)
            });
        }

        return normalizeTranscriptText(parts);
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
        let text = await getTranscriptFromCaptionTracks();

        if (text) {
            return text;
        }

        text = await getTranscriptFromYouTubePanel();

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
                const panel = findTranscriptPanel();
                const debug = getTranscriptDebugInfo(panel);
                alert(
                    `YT TXT ${SCRIPT_VERSION}: текст видео не найден.\n` +
                    `panels=${debug.panels}, structured=${debug.structuredSegments}, text=${debug.textSegments}, chars=${debug.panelTextLength}\n` +
                    "Подробности записаны в консоль DevTools."
                );
                console.warn("[YT TXT] No transcript text", debug);
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
