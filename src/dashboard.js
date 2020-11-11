const PIXABAY_API_KEY = '19070084-2bd82541ac44e87df591e85c4';
const MASTER_TASK_API_KEY = 'e33470187517078b63a549d69cfb0b8bec2061d4ed62a8f36f3e51df10a6bdc5';


// Google Stuff
var CLIENT_ID = "440713874264-8bp3gdu4fvvdn9cu3l9pdn6f46t8r3ir.apps.googleusercontent.com";
var API_KEY = 'AIzaSyBNaaSweOwi1-mpRuh44sV94eti5VB6Eyc';
// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
var SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

let taskLabels = null;

$(document).ready(() => {

    // Background
    loadBackground();
    loadTasks();
    loadClock();
});

function loadClock(){
    window.setInterval(() => {
        $("#clock-wrapper").html(getClock());
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

function loadBackground(){
    const imageNumber = 200;
    const url = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=skyline&image_type=photo&per_page=200&orientation=horizontal&category=backgrounds`;
    $.getJSON(url, data => {
        if (parseInt(data.hits.length) > 0){
            const n = getRandomInt(3, data.hits.length-1);
            $("#dashboard")
                .css("background-image", `url(${data.hits[n].largeImageURL})`)
                .removeClass("hidden");
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

function initCalendar(){
    // Client ID and API key from the Developer Console
    
}

// Google stuff
// ========================================================
function authenticate() {
    return gapi.auth2.getAuthInstance()
        .signIn({scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.readonly"})
        .then(function() { console.log("Sign-in successful"); },
                function(err) { console.error("Error signing in", err); });
}
function loadClient() {
    gapi.client.setApiKey(API_KEY);
    return gapi.client.load("https://content.googleapis.com/discovery/v1/apis/calendar/v3/rest")
        .then(function() { console.log("GAPI client loaded for API"); },
                function(err) { console.error("Error loading GAPI client for API", err); });
}
// Make sure the client is loaded and sign-in is complete before calling this method.
function execute() {
    return gapi.client.calendar.calendarList.get({
        "calendarId": "\"8ib9emdu58tc00cqmh2cs9gcj0@group.calendar.google.com\"",
    })
        .then(function(response) {
                // Handle the results here (response.result has the parsed body).
                console.log("Response", response);
                },
                function(err) { console.error("Execute error", err); });
    }
    gapi.load("client:auth2", function() {
    gapi.auth2.init({client_id: CLIENT_ID});
});

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max + 1 - min) + min);
}