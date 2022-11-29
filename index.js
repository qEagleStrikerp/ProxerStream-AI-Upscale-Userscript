// ==UserScript==
// @name         ProxerStream AI Upscale
// @namespace    qeaglestrikerp@web.de
// @version      0.1
// @description  Adds AI Upscaling for ProxerStreams
// @author       qEagleStrikerp
// @match        stream.proxer.me/*
// @grant        GM_xmlhttpRequest
// @connect      proxer.me
// @require      https://raw.githubusercontent.com/mobooru/Anime4K/master/index.js
// @license      GPL-3.0
// ==/UserScript==

'use strict';

// const player is set by the website and is used to access the Plyr player itself
// let plyr is used to access the player's HTML element
let plyr, innerPlayerWrapper;
let video, videoURL, playerWidth, playerHeight, aspectRatio;
let outerWrapper, middleCanvasWrapper, innerCanvasWrapper, canvas, middlePlayerWrapper, canvasContext;
let scaler, scaleRatio;

// Since the player is loaded rather late, we'll start the userscript only after the page has been fully loaded
window.addEventListener('load', main, false);

// Will be called upon finishing loading the page
function main() {
    initializeCanvas();

    // Initialize Anime4K
    // Anime4K gets loaded via the require call at the top of this file
    scaler = Anime4K.Scaler(canvasContext);

    startFetch();
}

// Create a canvas and place it between video player and controls
function initializeCanvas() {
    // Save the Plyr HTML element (we'll need it for fetching current width and height)
    plyr = document.getElementsByClassName("plyr")[0];

    // Find the video and save its URL
    innerPlayerWrapper = document.getElementsByClassName("plyr__video-wrapper")[0];
    video = innerPlayerWrapper.firstChild;
    videoURL = video.firstElementChild.src;

    // Fetch current width and height and calculate aspect ratio
    playerWidth = plyr.getBoundingClientRect().width;
    playerHeight = plyr.getBoundingClientRect().height;
    aspectRatio = video.videoWidth / video.videoHeight;

    // The final structure we're creating is going to look like this:
    // outer-wrapper
    // -> middle-canvas-wrapper (position:absolute)
    // ---> inner-canvas-wrapper (position:relative)
    // -> middle-player-wrapper (position:absolute)
    // ---> plyr__video-wrapper (position:relative)

    // The reason for this is that this is the only way to place player and canvas on top of each other while centering them horizontally

    // Create an outer wrapper in which we will place the wrapper for the player and wrapper for the canvas
    outerWrapper = document.createElement("div");
    outerWrapper.id = "outer-wrapper";
    outerWrapper.style.width = "" + playerWidth + "px";
    outerWrapper.style.height = "" + playerHeight + "px";

    // Create a middle canvas wrapper in which we will place the inner canvas wrapper
    middleCanvasWrapper = document.createElement("div");
    middleCanvasWrapper.id = "middle-canvas-wrapper";
    middleCanvasWrapper.style.position = "absolute";
    middleCanvasWrapper.style.width = "100%";
    middleCanvasWrapper.style.height = "100%";

    // Create an inner wrapper in which we will place the canvas
    innerCanvasWrapper = document.createElement("div");
    innerCanvasWrapper.id = "inner-canvas-wrapper";
    innerCanvasWrapper.style.position = "relative";

    // Create a canvas and place it inside its wrapper
    canvas = document.createElement("canvas");
    innerCanvasWrapper.style.margin = "auto";
    innerCanvasWrapper.appendChild(canvas);
    middleCanvasWrapper.appendChild(innerCanvasWrapper);

    // Create a middle player wrapper in which we will place the player
    middlePlayerWrapper = document.createElement("div");
    middlePlayerWrapper.id = "middle-player-wrapper";
    middlePlayerWrapper.style.position = "absolute";
    middlePlayerWrapper.style.width = "100%";
    middlePlayerWrapper.style.height = "100%";

    // Set player CSS
    innerPlayerWrapper.style.position = "relative";

    // Place the outer wrapper at the right position
    innerPlayerWrapper.parentElement.insertBefore(outerWrapper, innerPlayerWrapper);

    // Append the player (this will remove it from its former position)
    outerWrapper.appendChild(middlePlayerWrapper);
    middlePlayerWrapper.appendChild(innerPlayerWrapper);

    // Append the canvas
    outerWrapper.appendChild(middleCanvasWrapper);

    // Fetch the canvas's context for later
    canvasContext = canvas.getContext("webgl");

    // Set event listeners for when fullscreen mode gets toggled
    player.on("enterfullscreen", (event) => {
        resizeFullscreen();
    });
    player.on("exitfullscreen", (event) => {
        resizeSmall();
    });

    // Logging
    console.log("Canvas initialized");
}

function resizeFullscreen() {
    // Calculate a new scaling ratio (this determines how much the video will be enlarged) and render the frame (happens within scaler.resize())
    // We fetch the new height from the player
    scaleRatio = plyr.getBoundingClientRect().height / video.videoHeight;
    scaler.resize(scaleRatio, {});

    // Change the outer wrapper's CSS to fit the new size
    outerWrapper.style.width = "" + plyr.getBoundingClientRect().width + "px";
    outerWrapper.style.height = "" + plyr.getBoundingClientRect().height + "px";

    // Calculate the inner canvas wrapper's percentual width so that it gets centered properly
    innerCanvasWrapper.style.width = "" + Math.ceil(100 * canvas.width / plyr.getBoundingClientRect().width) + "%";
}

function resizeSmall() {
    // For resizing to the small player, we set height and width back to their original values
    scaleRatio = playerHeight / video.videoHeight;
    scaler.resize(scaleRatio, {});

    outerWrapper.style.width = "" + playerWidth + "px";
    outerWrapper.style.height = "" + playerHeight + "px";

    innerCanvasWrapper.style.width = "" + Math.ceil(100 * canvas.width / playerWidth) + "%";
}

async function startFetch() {
    // Logging
    console.log("Start fetching the video");

    // First we stop loading the current video by replacing it with a dummy
    video.src = "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/37/Big_Buck_Bunny_with_VTT_acid_test.webm/Big_Buck_Bunny_with_VTT_acid_test.webm.360p.webm";
    // Then we make an XML request to fetch the video in Blob format
    let blob = await fetchVideo();
    let blobURL = window.URL.createObjectURL(blob);
    // After the data has been successfully buffered, we pass them on to the video element
    video.src = blobURL;

    // Logging
    if(blobURL) {
        console.log("Successfully swapped video");
    } else {
        console.log("Failed swapping the video");
    }

    // Adds an event listener that sets up the upscaling parameters once and removes the Listener immediately afterwards
    video.addEventListener("playing", initializeUpscaling, false);
}

// Swap the video for a blob object that we can manipulate without getting a Cross-Origin error
function fetchVideo() {
    return new Promise((resolve, reject) => {
        // We'll use a very handy tool called GM_xmlhttpRequest()
        // In contrast to the standard xmlhttpRequest, it allows for bypassing Cross-Origin
        GM_xmlhttpRequest({
            method: "GET",
            url: videoURL,
            responseType: "blob",
            onload: e => resolve(e.response),
            onerror: reject,
            ontimeout: reject,
        });
    });
}

function initializeUpscaling() {
    // Logging
    console.log("Start upscaling");

    // Tell the Anime4K scaler which video to use
    scaler.inputVideo(video);

    // Do a resize right away so the canvas is set to the correct width and height
    if(player.fullscreen.active) {
        resizeFullscreen();
    } else {
        resizeSmall();
    }

    // Remove the Event Listener so that it doesn't re-initialize on every pause-play
    video.removeEventListener("playing", initializeUpscaling);

    // This checks if the very handy function requestVideoFrameCallback is available
    // Sadly, this doesn't work in Firefox, so we have to use a legacy solution
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        renderFrame();
    } else {
        console.log("requestVideoFrameCallback not available. Fallback to legacy solution.");
        video.addEventListener("playing", renderFrameLegacy, false);
        mytimer = Date.now();
        renderFrameLegacy();
    }
}

function renderFrame() {
    // It's very important to call scaler.resize() first. That way, if a frame takes too long to render, the next frame will automatically be skipped,
    // since the callback is set only after the frame has been rendered.
    scaler.resize(scaleRatio, {});
    video.requestVideoFrameCallback(renderFrame);
}

function renderFrameLegacy() {
    // For the legacy version, we will have to use another solution to handle dropped frames
    // We'll set a callback that fires 24 times a second
    if (!player.paused) {
        // Repeat this 24 times a second (most Anime have 24fps)
        window.setTimeout(renderFrameLegacy, 1000/24);

        // In this legacy version, it's very important to set the callback first and do the rendering afterwards
        // Only by doing this can we ensure that the framerate will be a constant 24fps
        // If we did it the other way round, the rendering would finish and afterwards there would be a 1 frame delay until the next callback
        // But we want to render the frame within that 1 frame delay, that's why the callback has to be set first
        let promise = new Promise((resolve) => {
            scaler.resize(scaleRatio, {});
            resolve();
        });
    }
}
