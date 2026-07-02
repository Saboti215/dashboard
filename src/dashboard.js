
$(document).ready(() => {
    // Set the copyright year
    $(document.body).attr("data-copy-right", `© ${new Date().getFullYear()} Tobias Schlößer`);

    loadBackground();
    loadMeetings();
    loadCalendar();
    loadClock();
    loadCsAutoLogin();
    loadRadio();
});

function loadMeetings() {
    if (updateMeetings()) {
        window.setInterval(() => {
            updateMeetings();
        }, 60 * 1000); // Reload every minute
    }
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
    if (typeof ZOOM_URL === "undefined") return false;

    // Get data
    $.getJSON("src/meetings.json", data => {
        // Check if there is a meeting in the next 15 minutes or right now
        const today = new Date();
        const now = today.getHours() * 60 + today.getMinutes();
        
        let meeting = data.find(m => {
            const startHour = parseInt(m.start_time.split(":")[0]);
            const endHour = parseInt(m.end_time.split(":")[0]);
            const startMin = parseInt(m.start_time.split(":")[1]);
            const endMin = parseInt(m.end_time.split(":")[1]);
            const start = startHour * 60 + startMin - 15; // 15 Minutes before the start
            const end = endHour * 60 + endMin;

            // Return whether this meeting is now or not
            return (m.weekday === today.getDay() && start <= now && now < end);
        });

        if (meeting) {
            // Check if meeting alert is already rendered
            if ($("#active-meeting").length === 0) {
                const meetingHtml = `
                    <div class="meeting-card" id="active-meeting">
                        <div class="meeting-header">
                            <span class="pulse-dot"></span>
                            <span class="meeting-badge">AKTIVES MEETING</span>
                        </div>
                        <div class="meeting-title">${meeting.name}</div>
                        <div class="meeting-time">Heute ${meeting.start_time} - ${meeting.end_time} Uhr</div>
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
                    // Check if we have a meeting with password link
                    if (meeting.pwd && meeting.type === "zoom") {
                        // Join the meeting directly
                        window.location.href = ZOOM_URL + meeting.meeting_id + "?pwd=" + meeting.pwd;
                    } else {
                        // Copy pw and join the meeting
                        copyToClipboard(meeting.password);

                        switch (meeting.type) {
                            case "dfn":
                                window.location.href = DFN_URL + meeting.meeting_id;
                                break;
                            case "zoom":
                                window.location.href = ZOOM_URL + meeting.meeting_id;
                                break;
                        }
                    }
                });
            }
        } else {
            $("#meeting-portal").removeClass("visible").empty();
        }
    });

    return true;
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
    if (typeof CS_USERNAME === "undefined" || typeof CS_PASSWORD === "undefined") {
        $("a[data-name=CodingSpace]").remove();
        return;
    }

    $("a[data-name=CodingSpace]").on("click", (e) => {
        e.preventDefault();
        const form = `<form id="cs-login-form" action="https://internal.codeclubmg.de/?page=login" method="post" style="display: none;">
            <input name="login[userName]" value="${CS_USERNAME}">
            <input name="login[password]" value="${CS_PASSWORD}">
            <input name="login[returnPage]" value="https://codeclubmg.de">
        </form>`;

        $(document.body).append(form);
        $("form#cs-login-form").submit();
    });

    $("a[data-name=CodingSpaceTest]").on("click", (e) => {
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
