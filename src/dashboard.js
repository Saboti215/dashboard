

let taskLabels = null;

$(document).ready(() => {

    // Background
    loadBackground();
    loadCalendar();
    loadTasks();
    loadClock();
    loadToggle();
    loadCsAutoLogin();
});

function loadCalendar(){
    $("#calendar-wrapper").html(CALENDER_FRAME);
}

function loadClock(){
    window.setInterval(() => {
        $("#clock").html(getClock());
    }, 1000);
}

function getClock(){
    const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const today = new Date();
    return `
        <span id="clock-time">${today.toLocaleTimeString()}</span><br />
        <span id="clock-date">${days[today.getDay()]}, ${today.getDate()}.${today.getMonth()+1}.${today.getFullYear()}</span>
    `;
}

function loadToggle() {
    $.ajax({
        beforeSend: function (xhr) {
            xhr.setRequestHeader ("Authorization", "Basic " + btoa(`${TOGGL_TOKEN}:api_token`));
        },
        type: "GET",
        dataType: "json",
        data: {
            "user_agent": EMAIL,
            "workspace_id": 4654037,
            "since": "2020-12-07",
            "user_ids": 5245584,
        },
        url: "https://api.track.toggl.com/reports/api/v2/weekly",
        success: function(data) {
            let workedMinutes = Math.round(data.total_grand / 60000);
            let hours = Math.floor(workedMinutes / 60);
            let minutes = workedMinutes % 60;

            if(hours < 10) hours = `0${hours}`;
            if(minutes < 10) minutes = `0${minutes}`;

            $("#toggl > #cc-time").text(`${hours}:${minutes}`);
        }
    });
}

function loadBackground(){
    const imageNumber = 200;
    // Standard query: skyline
    const url = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=skyline&image_type=photo&per_page=200&orientation=horizontal&category=backgrounds`;
    $.getJSON(url, data => {
        if (parseInt(data.hits.length) > 0){
            const n = getRandomInt(3, data.hits.length-1);
            $(document.body).css("background-image", `url(${data.hits[n].largeImageURL})`);
        }else
            console.warn('No background image found');
    });
}

async function getLabels(taskId){
    const url = `https://www.meistertask.com/api/tasks/${taskId}/labels?access_token=${MASTER_TASK_API_KEY}`;
    let res = null;
    await $.getJSON(url, data => {
        res = data;
    });
    return res;
}

async function getProjects(){
    const url = `https://www.meistertask.com/api/projects?access_token=${MASTER_TASK_API_KEY}`;
    let res = null;
    await $.getJSON(url, data => {
        res = data;
    });
    return res;
}

async function loadTasks(){

    // Get all tasks which aren't closed
    const url = `https://www.meistertask.com/api/tasks?status=1&access_token=${MASTER_TASK_API_KEY}`;
    $.getJSON(url, async data => {

        // Sort tasks by project
        data = data.sort((a,b) => a.project_id > b.project_id ? 1 : -1);
        let last_project = null;

        await getProjects().then(async projects => {
            for(task of data){
                // Get labels of the task
                await getLabels(task.id).then(labels => {
                    let label_html = "";
                    for (label of labels)
                        label_html += `<span style="background-color: #${label.color}">${label.name}</span>`;
    
                    // Make project breaker
                    if(task.project_id !== last_project){
                        $("#todo-wrapper").append(`<div class="task-project-headline">${projects.find(p => p.id === task.project_id).name}</div>`);
                    }
                    last_project = task.project_id;

                    // Display the tasks
                    $("#todo-wrapper").append(`
                        <div data-taskid="${task.id}" class="task${task.notes ? " has-desc" : ""}">
                            <div class="task-labels">${label_html}</div>
                            <span class="task-name">${task.name}</span>
                            <div class="task-desc">${task.notes_html}</div>
                            <span class="task-deadline">${task.due === null ? "" : (new Date(task.due).toLocaleString())}</span>
                        </div>
                    `);
                });
            }
            
            // Anzahl der Tasks anzeigen
            $("#task-counter").text(data.length);

            // Event Listener setzen
            $("#todo-wrapper .task.has-desc").click(function() {
                $(this).toggleClass("active");
            });

        });
    });

}

function loadCsAutoLogin(){
    $("a[data-name=CodingSpace]").on("click", () => {
        const form = `<form id="cs-login-form" action="https://codeclub.de/internal/?page=login" method="post" style="display: none;">
            <input name="login[userName]" value="${CS_USERNAME}">
            <input name="login[password]" value="${CS_PASSWORD}">
            <input name="login[returnPage]" value="https://codeclub.de">
        </form>`;

        $(document.body).append(form);
        $("form#cs-login-form").submit();
    });
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max + 1 - min) + min);
}