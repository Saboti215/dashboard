
$(document).ready(() => {
    // Set the copyright year
    $(document.body).attr("data-copy-right", `© ${new Date().getFullYear()} Tobias Schlößer`);

    loadBackground();
    loadMeetings();
    loadCalendar();
    loadClock();
    loadBookmarks();
    loadCsAutoLogin();
    loadRadio();
    loadSearch();
});

function loadSearch() {
    // Ensure the search bar has focus even if the browser tries to focus the omnibox instead
    $("#search-input").trigger("focus");
}

function loadBookmarks() {
    if (typeof chrome === "undefined" || !chrome.bookmarks) return;

    chrome.bookmarks.getTree(nodes => {
        const root = nodes[0];
        const bar = (root.children || []).find(n => n.id === "1") || (root.children || [])[0];
        if (!bar || !bar.children) return;

        const folders = [];
        const loose = [];

        bar.children.forEach(node => {
            if (node.children) {
                folders.push(node);
            } else if (node.url) {
                loose.push(node);
            }
        });

        let html = "";

        // Loose bookmarks directly on the bookmarks bar (not in a folder)
        if (loose.length) {
            html += renderBookmarkCategory("Allgemein", loose);
        }

        // Every folder becomes its own category, just like the previous static sections
        folders.forEach(folder => {
            const bookmarks = folder.children.filter(n => n.url);
            if (bookmarks.length) {
                html += renderBookmarkCategory(folder.title || "Sonstiges", bookmarks);
            }
        });

        $("#apps-wrapper").html(html);
    });
}

function renderBookmarkCategory(title, bookmarks) {
    const links = bookmarks.map(b => {
        const name = escapeHtml(b.title || b.url);
        const url = escapeHtml(b.url);
        const icon = escapeHtml(getFaviconUrl(b.url));
        return `<a href="${url}" data-name="${name}" style="background-image: url(${icon});"></a>`;
    }).join("");

    return `
        <div class="app-category">
            <div class="category-title">${escapeHtml(title)}</div>
            <div class="app-grid">${links}</div>
        </div>
    `;
}

function getFaviconUrl(pageUrl) {
    // Uses Chromium's built-in favicon store (requires the "favicon" permission),
    // so icons are served from the browser's local cache instead of being re-fetched from the web.
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "64");
    return url.toString();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function loadMeetings() {
    if (typeof chrome === "undefined" || !chrome.storage) {
        $("#meetings-toggle, #meetings-modal").remove();
        return;
    }

    updateMeetings();
    window.setInterval(() => {
        updateMeetings();
    }, 60 * 1000); // Reload every minute

    loadMeetingsModal();
}

// Meetings live in chrome.storage (synced across devices) instead of src/meetings.json
function getMeetingsStorageArea() {
    return chrome.storage.sync || chrome.storage.local;
}

function getMeetings(cb) {
    getMeetingsStorageArea().get({ meetings: [] }, data => cb(data.meetings || []));
}

function saveMeetings(meetings, cb) {
    getMeetingsStorageArea().set({ meetings }, () => {
        if (cb) cb();
    });
}

function formatDateForStorage(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
}

function loadRadio() {
    if (typeof TUNEIN_SENDER_ID === "undefined") {
        $("#radio-panel, #radio-toggle").remove();
        return;
    }

    $("#radio-frame").attr("src", `https://tunein.com/embed/player/s${TUNEIN_SENDER_ID}/`);

    // Toggle player panel visibility
    $("#radio-toggle").on("click", function() {
        $("#radio-panel").toggleClass("active");
        $(this).toggleClass("active");
    });

    // Close player when clicking outside it
    $(document).on("click", function(event) {
        if (!$(event.target).closest("#radio-panel, #radio-toggle").length) {
            $("#radio-panel").removeClass("active");
            $("#radio-toggle").removeClass("active");
        }
    });
}

function loadCalendar() {
    if (typeof CALENDER_FRAME === "undefined") {
        $("#calendar-container").remove();
        return;
    }

    $("#calendar-wrapper").html(CALENDER_FRAME);
}

function updateMeetings() {
    getMeetings(meetings => {
        // Check if there is a meeting in the next 15 minutes or right now
        const today = new Date();
        const now = today.getHours() * 60 + today.getMinutes();
        const todayStr = formatDateForStorage(today);

        let meeting = meetings.find(m => {
            const startHour = parseInt(m.start_time.split(":")[0]);
            const endHour = parseInt(m.end_time.split(":")[0]);
            const startMin = parseInt(m.start_time.split(":")[1]);
            const endMin = parseInt(m.end_time.split(":")[1]);
            const start = startHour * 60 + startMin - 15; // 15 Minutes before the start
            const end = endHour * 60 + endMin;

            const isToday = m.recurrence === "once"
                ? m.date === todayStr
                : Number(m.weekday) === today.getDay();

            // Return whether this meeting is now or not
            return (isToday && start <= now && now < end);
        });

        if (meeting) {
            // Check if meeting alert is already rendered
            if ($("#active-meeting").length === 0) {
                const typeLabel = meeting.type === "teams" ? "MS Teams" : "Zoom";
                const meetingHtml = `
                    <div class="meeting-card" id="active-meeting">
                        <div class="meeting-header">
                            <span class="pulse-dot"></span>
                            <span class="meeting-badge">AKTIVES MEETING &middot; ${escapeHtml(typeLabel)}</span>
                        </div>
                        <div class="meeting-title">${escapeHtml(meeting.name)}</div>
                        <div class="meeting-time">Heute ${escapeHtml(meeting.start_time)} - ${escapeHtml(meeting.end_time)} Uhr</div>
                        <button class="meeting-btn" id="join-meeting-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="btn-icon">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Beitreten
                        </button>
                    </div>
                `;
                $("#meeting-portal").html(meetingHtml).addClass("visible");

                $("#join-meeting-btn").on("click", () => {
                    // Copy the password (if any) and join via the stored link
                    if (meeting.password) {
                        copyToClipboard(meeting.password);
                    }

                    window.location.href = meeting.link;
                });
            }
        } else {
            $("#meeting-portal").removeClass("visible").empty();
        }
    });
}

function loadMeetingsModal() {
    renderMeetingsList();

    $("#meetings-toggle").on("click", () => {
        renderMeetingsList();
        $("#meetings-modal").addClass("active");
    });

    $("#meetings-modal-close, #meetings-modal-backdrop").on("click", () => {
        $("#meetings-modal").removeClass("active");
    });

    $(document).on("keydown", (e) => {
        if (e.key === "Escape") $("#meetings-modal").removeClass("active");
    });

    // Toggle between "weekly" (weekday select) and "once" (date picker)
    $("#recurrence-toggle button").on("click", function() {
        const value = $(this).data("value");
        $("#meeting-recurrence").val(value);
        $("#recurrence-toggle button").removeClass("active");
        $(this).addClass("active");
        $("#weekday-row").toggle(value === "weekly");
        $("#date-row").toggle(value === "once");
    });

    $("#meeting-form-cancel").on("click", () => resetMeetingForm());

    $("#meeting-form").on("submit", (e) => {
        e.preventDefault();

        const meeting = {
            id: $("#meeting-id").val() || crypto.randomUUID(),
            name: $("#meeting-name").val().trim(),
            type: $("#meeting-type").val(),
            link: $("#meeting-link").val().trim(),
            password: $("#meeting-password").val().trim(),
            start_time: $("#meeting-start").val(),
            end_time: $("#meeting-end").val(),
            recurrence: $("#meeting-recurrence").val(),
            weekday: Number($("#meeting-weekday").val()),
            date: $("#meeting-date").val()
        };

        if (!meeting.name || !meeting.link || !meeting.start_time || !meeting.end_time) return;
        if (meeting.recurrence === "once" && !meeting.date) return;

        getMeetings(meetings => {
            const existingIndex = meetings.findIndex(m => m.id === meeting.id);
            if (existingIndex >= 0) {
                meetings[existingIndex] = meeting;
            } else {
                meetings.push(meeting);
            }

            saveMeetings(meetings, () => {
                resetMeetingForm();
                renderMeetingsList();
                // Refresh the active-meeting card in case the change affects it right now
                $("#meeting-portal").removeClass("visible").empty();
                updateMeetings();
            });
        });
    });

    $("#meetings-list").on("click", "[data-edit]", function() {
        const id = $(this).data("edit");
        getMeetings(meetings => {
            const meeting = meetings.find(m => m.id === id);
            if (meeting) fillMeetingForm(meeting);
        });
    });

    $("#meetings-list").on("click", "[data-delete]", function() {
        const id = $(this).data("delete");
        getMeetings(meetings => {
            const filtered = meetings.filter(m => m.id !== id);
            saveMeetings(filtered, () => {
                renderMeetingsList();
                $("#meeting-portal").removeClass("visible").empty();
                updateMeetings();
            });
        });
    });
}

function renderMeetingsList() {
    getMeetings(meetings => {
        if (!meetings.length) {
            $("#meetings-list").html(`<div class="meetings-empty">Noch keine Meetings angelegt.</div>`);
            return;
        }

        const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

        const rows = meetings
            .slice()
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map(m => {
                const when = m.recurrence === "once"
                    ? formatDateForDisplay(m.date)
                    : weekdays[Number(m.weekday)];
                const typeLabel = m.type === "teams" ? "MS Teams" : "Zoom";

                return `
                    <div class="meeting-row">
                        <div class="meeting-row-info">
                            <div class="meeting-row-name">${escapeHtml(m.name)}</div>
                            <div class="meeting-row-meta">${escapeHtml(typeLabel)} &middot; ${escapeHtml(when)} &middot; ${escapeHtml(m.start_time)}-${escapeHtml(m.end_time)}</div>
                        </div>
                        <div class="meeting-row-actions">
                            <button type="button" data-edit="${escapeHtml(m.id)}" title="Bearbeiten">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button type="button" data-delete="${escapeHtml(m.id)}" title="Löschen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

        $("#meetings-list").html(rows);
    });
}

function fillMeetingForm(meeting) {
    $("#meeting-id").val(meeting.id);
    $("#meeting-name").val(meeting.name);
    $("#meeting-type").val(meeting.type);
    $("#meeting-link").val(meeting.link);
    $("#meeting-password").val(meeting.password || "");
    $("#meeting-start").val(meeting.start_time);
    $("#meeting-end").val(meeting.end_time);
    $("#meeting-recurrence").val(meeting.recurrence);
    $("#meeting-weekday").val(meeting.weekday);
    $("#meeting-date").val(meeting.date || "");

    $("#recurrence-toggle button").removeClass("active");
    $(`#recurrence-toggle button[data-value="${meeting.recurrence}"]`).addClass("active");
    $("#weekday-row").toggle(meeting.recurrence === "weekly");
    $("#date-row").toggle(meeting.recurrence === "once");

    $("#meeting-name").trigger("focus");
}

function resetMeetingForm() {
    $("#meeting-form")[0].reset();
    $("#meeting-id").val("");
    $("#meeting-recurrence").val("weekly");
    $("#recurrence-toggle button").removeClass("active");
    $("#recurrence-toggle button[data-value=weekly]").addClass("active");
    $("#weekday-row").show();
    $("#date-row").hide();
}

function loadClock() {
    // Initial load
    $("#clock-time").html(getClockTime());
    $("#clock-date").html(getClockDate());

    window.setInterval(() => {
        $("#clock-time").html(getClockTime());
        $("#clock-date").html(getClockDate());
    }, 1000);
}

function getClockTime() {
    const today = new Date();
    return today.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getClockDate() {
    const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const today = new Date();
    return `${days[today.getDay()]}, ${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
}

function loadBackground() {
    // Sets standard local image
    $(document.body).css("background-image", `url(assets/bg.jpg)`);
}

function loadCsAutoLogin() {
    if (typeof CS_USERNAME === "undefined" || typeof CS_PASSWORD === "undefined") return;

    // Bookmarks are rendered asynchronously, so bind via delegation on a static ancestor
    // instead of the (not yet existing) anchor elements themselves.
    $("#apps-wrapper").on("click", "a[data-name=CodingSpace]", (e) => {
        e.preventDefault();
        const form = `<form id="cs-login-form" action="https://internal.codeclubmg.de/?page=login" method="post" style="display: none;">
            <input name="login[userName]" value="${CS_USERNAME}">
            <input name="login[password]" value="${CS_PASSWORD}">
            <input name="login[returnPage]" value="https://codeclubmg.de">
        </form>`;

        $(document.body).append(form);
        $("form#cs-login-form").submit();
    });

    $("#apps-wrapper").on("click", "a[data-name=CodingSpaceTest]", (e) => {
        e.preventDefault();
        const form = `<form id="cs-login-form" action="https://test.internal.codeclubmg.de/?page=login" method="post" style="display: none;">
            <input name="login[userName]" value="${CS_USERNAME}">
            <input name="login[password]" value="${CS_PASSWORD}">
            <input name="login[returnPage]" value="https://codeclubmg.de/gleis934">
        </form>`;

        $(document.body).append(form);
        $("form#cs-login-form").submit();
    });
}

function copyToClipboard(str) {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}
