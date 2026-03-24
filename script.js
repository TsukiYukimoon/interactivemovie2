// configuration
const decisionTime = 150; // seconds, 2:30
let lowThreshold = 0.1;
let highThreshold = 0.3;

// elements

const mainVideo = document.getElementById('mainVideo');
const startExperienceBtn = document.getElementById('startExperienceBtn');

let urls = {
    prologue: null,
    intro: null,
    good: null,
    neutral: null,
    bad: null
};

function bindFileInput(id, key, nameId) {
    document.getElementById(id).addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        if (urls[key]) URL.revokeObjectURL(urls[key]);
        urls[key] = URL.createObjectURL(file);
        if (nameId) document.getElementById(nameId).textContent = file.name;
        checkReady();
    });
}

bindFileInput('input-prologue', 'prologue', 'name-prologue');
bindFileInput('input-intro', 'intro', 'name-intro');
bindFileInput('input-good', 'good', 'name-good');
bindFileInput('input-neutral', 'neutral', 'name-neutral');
bindFileInput('input-bad', 'bad', 'name-bad');

function checkReady() {
    const ready = urls.prologue && urls.intro && urls.good && urls.neutral && urls.bad;
    if (startExperienceBtn) startExperienceBtn.disabled = !ready;
}

if (startExperienceBtn) {
    startExperienceBtn.disabled = true;
    startExperienceBtn.addEventListener('click', () => {
        document.getElementById('setupPanel').style.display = 'none';
        document.getElementById('stage').style.display = '';
        // Start with prologue or intro video
        if (urls.prologue) {
            mainVideo.src = urls.prologue;
            mainVideo.play();
        }
    });
}

// thresholds
lowSlider.addEventListener('input', () => {
    lowThreshold = parseFloat(lowSlider.value);
    lowVal.textContent = lowThreshold.toFixed(2);
});
highSlider.addEventListener('input', () => {
    highThreshold = parseFloat(highSlider.value);
    highVal.textContent = highThreshold.toFixed(2);
});

toggleAdmin.addEventListener('click', () => {
    adminControls.style.display = adminControls.style.display === 'none' ? 'block' : 'none';
});

// manual overrides
forceBad.addEventListener('click', () => playEnding('bad'));
forceNeutral.addEventListener('click', () => playEnding('neutral'));
forceGood.addEventListener('click', () => playEnding('good'));



function playEnding(type) {
    if (!urls[type]) return;
    mainVideo.pause();
    mainVideo.src = urls[type];
    mainVideo.load();
    mainVideo.volume = 1;
    mainVideo.play();
    if (mainVideo.requestFullscreen) {
        mainVideo.requestFullscreen().catch(() => {});
    }
}

// allow pressing 'A' to toggle admin panel
window.addEventListener('keydown', e => {
    if (e.key === 'a' || e.key === 'A') {
        adminControls.style.display = adminControls.style.display === 'none' ? 'block' : 'none';
    }
});

// ensure main video returns to normal when ended
mainVideo.addEventListener('ended', () => {
    document.exitFullscreen().catch(() => {});
});
