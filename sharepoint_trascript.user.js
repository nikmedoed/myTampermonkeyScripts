// ==UserScript==
// @name         Teams / SharePoint Transcript TXT Downloader
// @namespace    local.teams.transcript.txt
// @version      1.0.3
// @description  Download Microsoft Teams / SharePoint Stream transcript as TXT by scrolling the virtualized transcript list.
// @homepageURL  https://github.com/nikmedoed/myTampermonkeyScripts
// @supportURL   https://github.com/nikmedoed/myTampermonkeyScripts/issues
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/sharepoint-download.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/sharepoint-download.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/sharepoint_trascript.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/sharepoint_trascript.user.js
// @match        https://teams.microsoft.com/*
// @match        https://*.teams.microsoft.com/*
// @match        https://teams.live.com/*
// @match        https://*.teams.live.com/*
// @match        https://*.sharepoint.com/*
// @match        https://*.sharepoint-df.com/*
// @match        https://stream.office.com/*
// @match        https://*.microsoftstream.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'teams-transcript-txt-download-button';
    const BUTTON_TEXT = 'TXT';

    const INITIAL_RENDER_WAIT_MS = 350;
    const RENDER_WAIT_TIMEOUT_MS = 1500;
    const RENDER_POLL_INTERVAL_MS = 60;

    const MAX_MAIN_SCROLL_STEPS = 900;
    const MAX_TARGETED_PASSES = 5;

    const NORMAL_STEP_VIEWPORT_RATIO = 0.65;
    const STUCK_JUMP_VIEWPORT_RATIO = 1.8;
    const TARGET_OFFSETS_VIEWPORT_RATIO = [0, -0.65, 0.65, -1.25, 1.25];

    const BUTTON_STYLE = {
        position: 'fixed',
        top: '72px',
        right: '18px',
        zIndex: '2147483647',
        padding: '6px 10px',
        border: '1px solid #666',
        borderRadius: '6px',
        background: '#1f1f1f',
        color: '#fff',
        fontSize: '13px',
        fontWeight: '700',
        fontFamily: 'Arial, sans-serif',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function normalizeText(text) {
        return String(text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t\r\f\v]+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .trim();
    }

    function escapeRegExp(text) {
        return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function sanitizeFileName(name) {
        const cleaned = String(name || 'teams-transcript')
            .replace(/\s*[-|]\s*Microsoft Teams\s*$/i, '')
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned || 'teams-transcript';
    }

    function applyStyle(element, style) {
        for (const [key, value] of Object.entries(style)) {
            element.style[key] = value;
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function findTranscriptRoot() {
        return (
            document.querySelector('#OneTranscript') ||
            document.querySelector('[data-testid="transcript-list-wrapper"]')?.closest('div') ||
            document.querySelector('[data-testid="transcript-list-wrapper"]')
        );
    }

    function findScrollContainer(root) {
        const directCandidates = [
            root.querySelector('#scrollToTargetTargetedFocusZone'),
            root.querySelector('[data-testid="scroll-to-target-targeted-focus-zone"]'),
            root.querySelector('[data-is-scrollable="true"]'),
        ].filter(Boolean);

        for (const element of directCandidates) {
            if (element.scrollHeight > element.clientHeight + 30) {
                return element;
            }
        }

        return [root, ...root.querySelectorAll('*')].find(element => {
            const style = window.getComputedStyle(element);
            const canScroll = element.scrollHeight > element.clientHeight + 100;
            const scrollable = ['auto', 'scroll', 'overlay'].includes(style.overflowY);

            return canScroll && scrollable;
        }) || null;
    }

    function parseReadableTimeToClock(readableTime) {
        const text = normalizeText(readableTime).toLowerCase();

        const hours = Number((text.match(/(\d+)\s+hours?/) || [0, 0])[1]);
        const minutes = Number((text.match(/(\d+)\s+minutes?/) || [0, 0])[1]);
        const seconds = Number((text.match(/(\d+)\s+seconds?/) || [0, 0])[1]);

        if (!hours && !minutes && !seconds && !/\b0\s+minutes?\b/.test(text)) {
            return '';
        }

        const mm = String(minutes).padStart(hours ? 2 : 1, '0');
        const ss = String(seconds).padStart(2, '0');

        return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
    }

    function parseSpeakerAndTimeFromAria(label) {
        const text = normalizeText(label);

        const match = text.match(
            /^(.*?)\s+((?:(?:\d+)\s+hours?\s*)?(?:(?:\d+)\s+minutes?\s*)?(?:(?:\d+)\s+seconds?\s*)?)$/i
        );

        if (!match) {
            return { speaker: '', time: '' };
        }

        return {
            speaker: normalizeText(match[1]),
            time: parseReadableTimeToClock(match[2]),
        };
    }

    function getEntryText(subEntryElement) {
        const clone = subEntryElement.cloneNode(true);

        clone.querySelectorAll(
            [
                '[class*="screenReaderFriendlyHiddenTag"]',
                '[aria-hidden="true"]',
            ].join(',')
        ).forEach(element => element.remove());

        return normalizeText(clone.textContent);
    }

    function cleanTranscriptText(text, speaker, time, position) {
        let cleaned = normalizeText(text);
        const escapedSpeaker = escapeRegExp(normalizeText(speaker));
        const escapedTime = escapeRegExp(normalizeText(time));
        const escapedPosition = position ? escapeRegExp(String(position)) : '';

        if (escapedPosition) {
            cleaned = cleaned.replace(new RegExp(`^${escapedPosition}(?:\\s+${escapedPosition})?\\s+`), '');
        }

        if (escapedSpeaker) {
            cleaned = cleaned.replace(new RegExp(`^${escapedSpeaker}\\s+`, 'i'), '');
        }

        if (escapedTime) {
            cleaned = cleaned
                .replace(new RegExp(`^${escapedTime}\\s*[,\\-–—:]?\\s*`, 'i'), '')
                .replace(new RegExp(`^${escapedSpeaker}\\s+${escapedTime}\\s*[,\\-–—:]?\\s*`, 'i'), '')
                .replace(new RegExp(`^${escapedTime}\\s+${escapedSpeaker}\\s*[,\\-–—:]?\\s*`, 'i'), '');
        }

        return normalizeText(cleaned);
    }

    function getVisibleWindow(root) {
        const positions = [...root.querySelectorAll('[id^="sub-entry-"][aria-posinset]')]
            .map(element => Number(element.getAttribute('aria-posinset') || 0))
            .filter(Boolean)
            .sort((a, b) => a - b);

        const totals = [...root.querySelectorAll('[id^="sub-entry-"][aria-setsize]')]
            .map(element => Number(element.getAttribute('aria-setsize') || 0))
            .filter(Boolean);

        if (!positions.length) {
            return {
                min: 0,
                max: 0,
                count: 0,
                total: totals.length ? Math.max(...totals) : 0,
                key: 'empty',
            };
        }

        return {
            min: positions[0],
            max: positions[positions.length - 1],
            count: positions.length,
            total: totals.length ? Math.max(...totals) : 0,
            key: `${positions[0]}-${positions[positions.length - 1]}-${positions.length}`,
        };
    }

    async function waitForRenderAfterScroll(root, previousWindowKey) {
        await sleep(RENDER_POLL_INTERVAL_MS);

        const startedAt = Date.now();
        let lastKey = '';
        let stableCount = 0;

        while (Date.now() - startedAt < RENDER_WAIT_TIMEOUT_MS) {
            const currentWindow = getVisibleWindow(root);

            if (currentWindow.key !== previousWindowKey && currentWindow.key !== 'empty') {
                await sleep(RENDER_POLL_INTERVAL_MS);
                return currentWindow;
            }

            if (currentWindow.key === lastKey) {
                stableCount += 1;
            } else {
                stableCount = 0;
                lastKey = currentWindow.key;
            }

            if (stableCount >= 4 && currentWindow.key !== 'empty') {
                return currentWindow;
            }

            await sleep(RENDER_POLL_INTERVAL_MS);
        }

        return getVisibleWindow(root);
    }

    function createState() {
        return {
            entriesByPosition: new Map(),
            seenPositions: new Set(),
            skippedPositions: new Map(),
            knownTotal: 0,
        };
    }

    function collectVisibleEntries(root, state) {
        const entryElements = root.querySelectorAll('[id^="entry-"][role="group"]');

        for (const entryElement of entryElements) {
            const subEntryElement = entryElement.querySelector('[id^="sub-entry-"]');

            if (!subEntryElement) {
                continue;
            }

            const position = Number(subEntryElement.getAttribute('aria-posinset') || 0);
            const total = Number(subEntryElement.getAttribute('aria-setsize') || 0);

            if (total > state.knownTotal) {
                state.knownTotal = total;
            }

            if (!position) {
                continue;
            }

            state.seenPositions.add(position);

            const cell = entryElement.closest('[data-list-index]');
            const header = cell?.querySelector('[id^="itemHeader-"]');

            let speaker = normalizeText(
                header?.querySelector('[class*="itemDisplayName"]')?.textContent
            );

            let time = normalizeText(
                header?.querySelector('[id^="Header-timestamp-"]')?.textContent
            );

            const ariaLabel = normalizeText(
                entryElement.querySelector('[id^="timestampSpeakerAriaLabel-"]')?.textContent ||
                entryElement.getAttribute('aria-label') ||
                ''
            );

            const parsedFromAria = parseSpeakerAndTimeFromAria(ariaLabel);

            if (!speaker) {
                speaker = parsedFromAria.speaker;
            }

            if (!time) {
                time = parsedFromAria.time;
            }

            const text = getEntryText(subEntryElement);

            if (!speaker || !time || !text) {
                state.skippedPositions.set(position, {
                    position,
                    reason: 'service-or-non-speech-row',
                    rawText: text,
                    ariaLabel,
                });
                continue;
            }

            state.entriesByPosition.set(position, {
                position,
                speaker,
                time,
                text,
            });
        }
    }

    function getMissingSeenPositions(state) {
        const missing = [];

        if (!state.knownTotal) {
            return missing;
        }

        for (let position = 1; position <= state.knownTotal; position++) {
            if (!state.seenPositions.has(position)) {
                missing.push(position);
            }
        }

        return missing;
    }

    function groupMissingPositions(missingPositions) {
        const ranges = [];

        for (const position of missingPositions) {
            const lastRange = ranges[ranges.length - 1];

            if (lastRange && position === lastRange.end + 1) {
                lastRange.end = position;
            } else {
                ranges.push({ start: position, end: position });
            }
        }

        return ranges;
    }

    function estimateScrollTopForPosition(position, total, scrollContainer) {
        if (!total || total <= 1) {
            return 0;
        }

        const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        const ratio = (position - 1) / (total - 1);

        return clamp(Math.round(maxScrollTop * ratio), 0, maxScrollTop);
    }

    function updateButtonProgress(button, state, stage) {
        const txtCount = state.entriesByPosition.size;
        const total = state.knownTotal;

        if (total) {
            button.textContent = `${BUTTON_TEXT} ${txtCount}/${total}${stage ? ` ${stage}` : ''}`;
        } else {
            button.textContent = `${BUTTON_TEXT} ${txtCount}${stage ? ` ${stage}` : ''}`;
        }
    }

    function scrollToPosition(scrollContainer, targetScrollTop) {
        scrollContainer.scrollTop = targetScrollTop;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    function chooseRescueTarget(state, visibleWindow, scrollContainer) {
        const missing = getMissingSeenPositions(state);

        if (!missing.length) {
            return null;
        }

        const firstMissingAfterVisible = missing.find(position => position > visibleWindow.max);
        const targetPosition = firstMissingAfterVisible || missing[0];

        let targetScrollTop = estimateScrollTopForPosition(targetPosition, state.knownTotal, scrollContainer);

        if (Math.abs(targetScrollTop - scrollContainer.scrollTop) < 100) {
            const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
            targetScrollTop = clamp(
                scrollContainer.scrollTop + scrollContainer.clientHeight * STUCK_JUMP_VIEWPORT_RATIO,
                0,
                maxScrollTop
            );
        }

        return Math.round(targetScrollTop);
    }

    async function mainSweep(root, scrollContainer, state, button) {
        let previousWindow = getVisibleWindow(root);
        let repeatedWindowCount = 0;
        let noNewSeenCount = 0;

        scrollToPosition(scrollContainer, 0);
        await sleep(INITIAL_RENDER_WAIT_MS);

        previousWindow = getVisibleWindow(root);

        for (let stepIndex = 0; stepIndex < MAX_MAIN_SCROLL_STEPS; stepIndex++) {
            const beforeSeenCount = state.seenPositions.size;

            collectVisibleEntries(root, state);
            updateButtonProgress(button, state, '');

            if (state.knownTotal && state.seenPositions.size >= state.knownTotal) {
                return;
            }

            const currentWindow = getVisibleWindow(root);

            if (currentWindow.key === previousWindow.key) {
                repeatedWindowCount += 1;
            } else {
                repeatedWindowCount = 0;
            }

            if (state.seenPositions.size === beforeSeenCount) {
                noNewSeenCount += 1;
            } else {
                noNewSeenCount = 0;
            }

            const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
            const isAtBottom = scrollContainer.scrollTop >= maxScrollTop - 4;

            if (isAtBottom) {
                collectVisibleEntries(root, state);
                return;
            }

            let nextScrollTop = null;

            if (state.knownTotal && (repeatedWindowCount >= 2 || noNewSeenCount >= 3)) {
                nextScrollTop = chooseRescueTarget(state, currentWindow, scrollContainer);
            }

            if (nextScrollTop === null || nextScrollTop === undefined) {
                const normalStep = Math.max(
                    180,
                    Math.round(scrollContainer.clientHeight * NORMAL_STEP_VIEWPORT_RATIO)
                );

                nextScrollTop = clamp(scrollContainer.scrollTop + normalStep, 0, maxScrollTop);
            }

            scrollToPosition(scrollContainer, nextScrollTop);
            previousWindow = await waitForRenderAfterScroll(root, currentWindow.key);
        }
    }

    async function targetedMissingSweep(root, scrollContainer, state, button) {
        if (!state.knownTotal) {
            return;
        }

        for (let passIndex = 0; passIndex < MAX_TARGETED_PASSES; passIndex++) {
            const missing = getMissingSeenPositions(state);

            if (!missing.length) {
                return;
            }

            const ranges = groupMissingPositions(missing);
            updateButtonProgress(button, state, `fix ${passIndex + 1}`);

            let collectedSomethingOnThisPass = false;

            for (const range of ranges) {
                if (state.seenPositions.size >= state.knownTotal) {
                    return;
                }

                const targetPosition = Math.max(1, range.start - 2);
                const baseScrollTop = estimateScrollTopForPosition(
                    targetPosition,
                    state.knownTotal,
                    scrollContainer
                );

                for (const offsetRatio of TARGET_OFFSETS_VIEWPORT_RATIO) {
                    const beforeSeenCount = state.seenPositions.size;
                    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
                    const targetScrollTop = clamp(
                        Math.round(baseScrollTop + scrollContainer.clientHeight * offsetRatio),
                        0,
                        maxScrollTop
                    );

                    const previousWindow = getVisibleWindow(root);
                    scrollToPosition(scrollContainer, targetScrollTop);
                    await waitForRenderAfterScroll(root, previousWindow.key);

                    collectVisibleEntries(root, state);
                    updateButtonProgress(button, state, `fix ${passIndex + 1}`);

                    if (state.seenPositions.size > beforeSeenCount) {
                        collectedSomethingOnThisPass = true;
                        break;
                    }
                }
            }

            if (!collectedSomethingOnThisPass) {
                return;
            }
        }
    }

    async function collectTranscriptByScrolling(root, scrollContainer, button) {
        const originalScrollTop = scrollContainer.scrollTop;
        const originalScrollBehavior = scrollContainer.style.scrollBehavior;

        scrollContainer.style.scrollBehavior = 'auto';

        const state = createState();

        try {
            await mainSweep(root, scrollContainer, state, button);
            await targetedMissingSweep(root, scrollContainer, state, button);

            collectVisibleEntries(root, state);

            return {
                entries: [...state.entriesByPosition.values()].sort((a, b) => a.position - b.position),
                knownTotal: state.knownTotal,
                seenTotal: state.seenPositions.size,
                missing: getMissingSeenPositions(state),
                skipped: [...state.skippedPositions.values()],
            };
        } finally {
            scrollToPosition(scrollContainer, originalScrollTop);
            scrollContainer.style.scrollBehavior = originalScrollBehavior;
        }
    }

    function buildTranscriptText(entries) {
        return entries
            .map(entry => {
                const text = cleanTranscriptText(entry.text, entry.speaker, entry.time, entry.position);

                return `${entry.time}, ${entry.speaker}\n${text}`;
            })
            .join('\n\n') + '\n';
    }

    function downloadTextFile(text) {
        const title = sanitizeFileName(document.title);
        const date = new Date().toISOString().slice(0, 10);
        const fileName = `${title} transcript ${date}.txt`;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    }

    async function handleDownloadClick(button) {
        const root = findTranscriptRoot();

        if (!root) {
            alert('Не вижу Transcript. Открой боковую панель Transcript в Teams / Stream и нажми TXT ещё раз.');
            return;
        }

        const scrollContainer = findScrollContainer(root);

        if (!scrollContainer) {
            alert('Нашёл Transcript, но не нашёл scroll-контейнер. Возможно, Microsoft поменял DOM.');
            return;
        }

        const previousText = button.textContent;

        try {
            button.disabled = true;
            button.style.opacity = '0.65';
            button.textContent = 'TXT...';

            const result = await collectTranscriptByScrolling(root, scrollContainer, button);

            console.log('[Teams transcript TXT] result:', result);

            if (!result.entries.length) {
                alert('Реплики не найдены. Проверь, что Transcript реально открыт и загружен.');
                return;
            }

            if (result.knownTotal && result.missing.length) {
                const shouldDownloadPartial = confirm(
                    `Собрано ${result.entries.length} реплик. ` +
                    `Просмотрено ${result.seenTotal}/${result.knownTotal} строк Teams. ` +
                    `Реально не удалось увидеть ${result.missing.length} строк. Скачать частичный TXT?`
                );

                if (!shouldDownloadPartial) {
                    return;
                }
            }

            const text = buildTranscriptText(result.entries);
            downloadTextFile(text);
        } finally {
            button.disabled = false;
            button.style.opacity = '1';
            button.textContent = previousText || BUTTON_TEXT;
        }
    }

    function mountButton() {
        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = BUTTON_TEXT;
        button.title = 'Download Teams transcript as TXT';

        applyStyle(button, BUTTON_STYLE);

        button.addEventListener('click', () => {
            handleDownloadClick(button);
        });

        document.body.appendChild(button);
    }

    mountButton();

    const observer = new MutationObserver(() => {
        mountButton();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
})();
