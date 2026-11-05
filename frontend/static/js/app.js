import { runThemeTransition } from "./theme-transition.js";
/* ================================================================
   FreshSense — Client Logic
   Handles drag-and-drop upload, AJAX prediction, animated probability bars,
   and dynamic history rendering.
   ================================================================ */

(function () {
    "use strict";

    // ---- DOM Elements ----
    const uploadZone    = document.getElementById("uploadZone");
    const uploadContent = document.getElementById("uploadContent");
    const uploadPreview = document.getElementById("uploadPreview");
    const previewImage  = document.getElementById("previewImage");
    const removeBtn     = document.getElementById("removeImage");
    const fileInput     = document.getElementById("fileInput");

    const resultEmpty   = document.getElementById("resultEmpty");
    const resultLoading = document.getElementById("resultLoading");
    const resultCard    = document.getElementById("resultCard");
    const resultBadge   = document.getElementById("resultBadge");
    const resultConf    = document.getElementById("resultConfidence");
    const resultDesc    = document.getElementById("resultDescription");
    const probChart     = document.getElementById("probChart");
    const analyzeBtn    = document.getElementById("analyzeAnother");

    const historyGrid   = document.getElementById("historyGrid");
    const historyEmpty  = document.getElementById("historyEmpty");
    const clearBtn      = document.getElementById("clearHistory");

    let selectedFile = null;

    const themeSwitch = document.getElementById("themeSwitch");
    function syncThemeButton() {
        const dark = document.documentElement.dataset.theme === "dark";
        themeSwitch.setAttribute("aria-pressed", String(dark));
        themeSwitch.title = dark ? "Switch to light theme" : "Switch to dark theme";
        themeSwitch.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }
    let requestedTheme = document.documentElement.dataset.theme;
    themeSwitch.addEventListener("click", function () {
        const theme = requestedTheme === "dark" ? "light" : "dark";
        requestedTheme = theme;
        const box = themeSwitch.getBoundingClientRect();
        runThemeTransition(function () {
            document.documentElement.dataset.theme = theme;
            try { localStorage.setItem("freshsense-theme", theme); } catch (_) {}
            syncThemeButton();
        }, { next: theme, x: box.left + box.width / 2, y: box.top + box.height / 2,
             reduced: matchMedia("(prefers-reduced-motion: reduce)").matches });
    });
    syncThemeButton();
    const systemTheme = matchMedia("(prefers-color-scheme: dark)");
    systemTheme.addEventListener("change", function (event) {
        try { if (localStorage.getItem("freshsense-theme")) return; } catch (_) {}
        document.documentElement.dataset.theme = event.matches ? "dark" : "light"; requestedTheme = document.documentElement.dataset.theme; syncThemeButton();
    });

    // A single fixed video continues through every section without restarting.
    const heroVideo = document.getElementById("heroVideo");
    const heroVideoToggle = document.getElementById("heroVideoToggle");
    const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
    if (heroVideo && heroVideoToggle) {
        let heroInView = false;
        let userPaused = false;
        const heroNavigation = document.querySelector(".navbar");
        const hero = document.querySelector(".hero");
        function syncVideoSurfaces() {
            const active = !motionPreference.matches && heroVideo.classList.contains("is-ready");
            document.body.classList.toggle("has-page-video", active);
            heroNavigation?.classList.toggle("is-over-hero", active && heroInView);
        }
        function syncVideoControl() {
            const paused = heroVideo.paused;
            heroVideoToggle.classList.toggle("is-paused", paused);
            heroVideoToggle.setAttribute("aria-label", (paused ? "Play" : "Pause") + " background video");
            heroVideoToggle.querySelector("span").textContent = (paused ? "Play" : "Pause") + " background";
        }
        function updatePageVideo() {
            syncVideoSurfaces();
            if (motionPreference.matches || document.hidden || userPaused) {
                heroVideo.pause();
                return;
            }
            if (!heroVideo.getAttribute("src")) {
                heroVideo.muted = true;
                heroVideo.src = heroVideo.dataset.src;
            }
            heroVideo.play().catch(syncVideoControl);
        }
        function sizeVideoScene() {
            if (hero) document.getElementById("pageVideoBackdrop").style.setProperty("--video-scene-height", hero.offsetHeight + "px");
        }
        sizeVideoScene();
        if ("ResizeObserver" in window && hero) {
            new ResizeObserver(sizeVideoScene).observe(hero);
        } else {
            window.addEventListener("resize", sizeVideoScene, { passive: true });
        }
        heroVideo.addEventListener("loadeddata", function () {
            heroVideo.classList.add("is-ready");
            syncVideoSurfaces();
            heroVideoToggle.hidden = false;
            syncVideoControl();
        });
        heroVideo.addEventListener("error", function () {
            heroVideo.classList.remove("is-ready");
            syncVideoSurfaces();
            heroVideoToggle.hidden = true;
        });
        heroVideo.addEventListener("play", syncVideoControl);
        heroVideo.addEventListener("pause", syncVideoControl);
        heroVideoToggle.addEventListener("click", function () {
            userPaused = !heroVideo.paused;
            updatePageVideo();
        });
        if ("IntersectionObserver" in window && hero) {
            const heroObserver = new IntersectionObserver(function (entries) {
                heroInView = entries[0].isIntersecting;
                syncVideoSurfaces();
            }, { rootMargin: "-73px 0px 0px 0px" });
            heroObserver.observe(hero);
        } else {
            heroInView = true;
        }
        document.addEventListener("visibilitychange", updatePageVideo);
        window.addEventListener("pageshow", updatePageVideo);
        motionPreference.addEventListener("change", updatePageVideo);
        updatePageVideo();
    }

    // Once-only, staggered fade-down reveals. Cards remain immediately focusable.
    const revealSelector = ".dropzone-card, .result-card-container, .scale-card, .bento-card, .history-card, .history-empty-box";
    const observedCards = new WeakSet();
    const completedHistoryCards = new Set();
    const revealFlights = new Map();
    let revealObserver = null;
    function finishCardReveal(card) {
        card.classList.remove("card-awaiting-reveal");
        const flight = revealFlights.get(card);
        if (flight) { revealFlights.delete(card); flight.cancel(); }
        if (card.dataset.historyId) completedHistoryCards.add(card.dataset.historyId);
        revealObserver?.unobserve(card);
    }
    function registerRevealCards(container) {
        if (!revealObserver || motionPreference.matches) return;
        container.querySelectorAll(revealSelector).forEach(function (card) {
            if (observedCards.has(card) || (card.dataset.historyId && completedHistoryCards.has(card.dataset.historyId))) return;
            observedCards.add(card);
            card.classList.add("card-awaiting-reveal");
            revealObserver.observe(card);
        });
    }
    if ("IntersectionObserver" in window && typeof Element.prototype.animate === "function") {
        const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "cubic-bezier(.23,1,.32,1)";
        revealObserver = new IntersectionObserver(function (entries) {
            const batch = entries.filter(function (entry) { return entry.isIntersecting; });
            batch.sort(function (a, b) {
                return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
            });
            const sectionCounts = new Map();
            batch.forEach(function (entry) {
                const card = entry.target;
                if (motionPreference.matches || card.contains(document.activeElement)) { finishCardReveal(card); return; }
                revealObserver.unobserve(card);
                const section = card.closest("section");
                const order = sectionCounts.get(section) || 0;
                sectionCounts.set(section, order + 1);
                const flight = card.animate([
                    { opacity: 0, transform: "translateY(-18px)" },
                    { opacity: 1, transform: "translateY(0px)" }
                ], { duration: 1200, delay: Math.min(order * 180, 900), easing, fill: "both" });
                revealFlights.set(card, flight);
                flight.finished.then(function () { finishCardReveal(card); }, function () { card.classList.remove("card-awaiting-reveal"); });
            });
        }, { threshold: 0.06, rootMargin: "0px 0px -24px 0px" });
        registerRevealCards(document);
        document.addEventListener("focusin", function (event) {
            const card = event.target.closest(revealSelector);
            if (card) finishCardReveal(card);
        });
        motionPreference.addEventListener("change", function (event) {
            if (event.matches) {
                revealObserver.disconnect();
                document.querySelectorAll(revealSelector).forEach(finishCardReveal);
            } else {
                registerRevealCards(document);
            }
        });
        window.addEventListener("beforeprint", function () {
            document.querySelectorAll(revealSelector).forEach(finishCardReveal);
        });
    }

    // ---- Badge and Bar CSS Class Mapping ----
    const CLASS_KEYS = {
        "Fresh":         "fresh",
        "Slightly Aged": "slightly-aged",
        "Stale":         "stale",
        "Spoiled":       "spoiled",
        "Rotten":        "rotten"
    };

    function badgeClass(cls) {
        return "badge-" + (CLASS_KEYS[cls] || "fresh");
    }

    function barClass(cls) {
        return "bar-" + (CLASS_KEYS[cls] || "fresh");
    }

    // ---- Upload Zone Interactions ----
    uploadZone.addEventListener("click", function (e) {
        if (e.target === removeBtn || removeBtn.contains(e.target)) return;
        fileInput.click();
    });

    fileInput.addEventListener("change", function () {
        if (fileInput.files.length) {
            handleFile(fileInput.files[0]);
        }
    });

    // Drag & drop handlers
    ["dragenter", "dragover"].forEach(function (evt) {
        uploadZone.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(function (evt) {
        uploadZone.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove("dragover");
        });
    });

    uploadZone.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    function handleFile(file) {
        const validTypes = ["image/jpeg", "image/png", "image/webp"];
        if (validTypes.indexOf(file.type) === -1 && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
            alert("Please upload a valid JPG, PNG, or WebP image.");
            return;
        }
        selectedFile = file;
        showPreview(file);
        uploadImage(file);
    }

    function showPreview(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImage.src = e.target.result;
            uploadContent.style.display = "none";
            uploadPreview.style.display = "flex";
        };
        reader.readAsDataURL(file);
    }

    removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        resetUpload();
    });

    function resetUpload() {
        selectedFile = null;
        fileInput.value = "";
        previewImage.src = "";
        uploadContent.style.display = "block";
        uploadPreview.style.display = "none";
        showResult("empty");
    }

    // ---- Predict Request ----
    function uploadImage(file) {
        showResult("loading");

        const formData = new FormData();
        formData.append("file", file);

        fetch("/predict", {
            method: "POST",
            body: formData
        })
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error(data.error || ("Server error (" + res.status + ")"));
                }
                return data;
            });
        })
        .then(function (data) {
            renderResult(data);
            showResult("card");
            loadHistory();
        })
        .catch(function (err) {
            alert("Error: " + err.message);
            showResult("empty");
        });
    }

    function showResult(state) {
        resultEmpty.style.display   = state === "empty"   ? "block" : "none";
        resultLoading.style.display = state === "loading" ? "block" : "none";
        resultCard.style.display    = state === "card"    ? "block" : "none";
    }

    function renderResult(data) {
        resultBadge.textContent = data.predicted_class;
        resultBadge.className = "result-tag " + badgeClass(data.predicted_class);
        resultConf.textContent = data.confidence + "% Confidence";
        resultDesc.textContent = data.description;

        // Populate Probability Bars
        probChart.innerHTML = "";
        const classOrder = ["Fresh", "Slightly Aged", "Stale", "Spoiled", "Rotten"];
        classOrder.forEach(function (cls) {
            const pct = data.probabilities[cls] || 0;
            const row = document.createElement("div");
            row.className = "prob-row";

            row.innerHTML =
                '<span class="prob-label">' + cls + '</span>' +
                '<div class="prob-bar-track">' +
                    '<div class="prob-bar-fill ' + barClass(cls) + '"></div>' +
                '</div>' +
                '<span class="prob-value">' + pct.toFixed(1) + '%</span>';

            probChart.appendChild(row);

            // Trigger animation frame for CSS transition
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    const fill = row.querySelector(".prob-bar-fill");
                    if (fill) {
                        fill.style.width = pct + "%";
                    }
                });
            });
        });
    }

    analyzeBtn.addEventListener("click", function () {
        resetUpload();
    });

    // ---- History Management ----
    const historyStatus = document.getElementById("historyStatus");
    let historyItems = [], historyBusy = false, historyVersion = 0;
    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
            return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c];
        });
    }
    function setHistoryBusy(busy) {
        historyBusy = busy;
        clearBtn.disabled = busy;
        historyGrid.querySelectorAll("[data-delete-record]").forEach(function (button) { button.disabled = busy; });
    }
    async function loadHistory() {
        const version = ++historyVersion;
        try {
            const response = await fetch("/history", { cache: "no-store" });
            if (!response.ok) throw new Error("History could not be loaded. Please try again.");
            const items = await response.json();
            if (!Array.isArray(items)) throw new Error("History could not be read. Please try again.");
            if (version === historyVersion) renderHistory(items);
            return true;
        } catch (error) {
            if (version === historyVersion) historyStatus.textContent = error.message;
            return false;
        }
    }
    const trashIcon = clearBtn.querySelector("svg").outerHTML.replace("<svg", '<svg aria-hidden="true"');
    function renderHistory(items) {
        historyItems = items;
        historyEmpty.style.display = items.length ? "none" : "block";
        clearBtn.style.display = items.length ? "inline-flex" : "none";
        historyGrid.innerHTML = items.map(function (item) {
            const id = escapeHtml(item.id), filename = escapeHtml(item.filename);
            return '<div class="history-card" data-history-id="' + id + '">' +
                '<img class="history-img" loading="lazy" decoding="async" src="' + escapeHtml(item.image_url) + '" alt="' + filename + '">' +
                '<button type="button" class="history-delete" data-delete-record="' + id + '" aria-label="Delete scan: ' + filename + '" title="Delete this record">' + trashIcon + '</button>' +
                '<div class="history-body"><div class="history-top">' +
                '<span class="history-badge ' + badgeClass(item.predicted_class) + '">' + escapeHtml(item.predicted_class) + '</span>' +
                '<span class="history-conf">' + escapeHtml(item.confidence) + '%</span></div>' +
                '<div class="history-filename" title="' + filename + '">' + filename + '</div>' +
                '<div class="history-time">' + escapeHtml(item.timestamp) + '</div></div></div>';
        }).join("");
        registerRevealCards(historyGrid);
        setHistoryBusy(historyBusy);
    }
    async function deleteRecords(path, id) {
        if (historyBusy) return;
        const focused = document.activeElement;
        const returnFocus = focused === clearBtn || focused.matches("[data-delete-record]");
        const oldIndex = Array.from(historyGrid.querySelectorAll("[data-delete-record]")).indexOf(focused);
        ++historyVersion;
        setHistoryBusy(true);
        historyStatus.textContent = id ? "Deleting this record…" : "Clearing all records…";
        try {
            const response = await fetch(path, { method: "DELETE" });
            const data = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(data.error || "Deletion failed. Please try again.");
            renderHistory(id ? historyItems.filter(function (item) { return String(item.id) !== id; }) : []);
            if (await loadHistory()) historyStatus.textContent = data.warning || (id ? "Record deleted." : "All records cleared.");
        } catch (error) {
            historyStatus.textContent = error.message || "Deletion failed. Please try again.";
        } finally {
            setHistoryBusy(false);
            if (returnFocus) {
                const buttons = historyGrid.querySelectorAll("[data-delete-record]");
                if (buttons.length && id) buttons[Math.min(Math.max(oldIndex, 0), buttons.length - 1)].focus({ preventScroll: true });
                else if (buttons.length) clearBtn.focus({ preventScroll: true });
                else { historyEmpty.tabIndex = -1; historyEmpty.focus({ preventScroll: true }); }
            }
        }
    }
    historyGrid.addEventListener("click", function (event) {
        const button = event.target.closest("[data-delete-record]");
        if (!button || historyBusy) return;
        const id = button.dataset.deleteRecord;
        if (!id) return;
        deleteRecords("/history/" + encodeURIComponent(id), id);
    });
    clearBtn.addEventListener("click", function () {
        if (historyBusy || !confirm("Are you sure you want to clear all scan records?")) return;
        deleteRecords("/history", null);
    });

    // Decorative color motion runs only while the typography is visible.
    if ("IntersectionObserver" in window) {
        const colorObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { entry.target.classList.toggle("is-in-view", entry.isIntersecting); });
        });
        document.querySelectorAll(".gradient-text, .stat-value").forEach(function (element) { colorObserver.observe(element); });
    }
    // Initialize history on load
    loadHistory();
})();
