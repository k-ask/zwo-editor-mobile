let chart;
let segments = [];

// Zwift Power Zones
const ZONES = [
    { limit: 0.60, color: '#7f7f7f', bg: 'rgba(127, 127, 127, 0.2)' },
    { limit: 0.76, color: '#3284c9', bg: 'rgba(50, 132, 201, 0.2)' },
    { limit: 0.90, color: '#5aca5a', bg: 'rgba(90, 202, 90, 0.2)' },
    { limit: 1.05, color: '#ffca28', bg: 'rgba(255, 202, 40, 0.2)' },
    { limit: 1.19, color: '#ff6924', bg: 'rgba(255, 105, 36, 0.2)' },
    { limit: 99.9, color: '#ff3737', bg: 'rgba(255, 55, 55, 0.2)' }
];

function getZone(power) {
    for (let z of ZONES) if (power < z.limit) return z;
    return ZONES[ZONES.length - 1];
}

// Time Helpers
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
}

function parseTime(input) {
    if (!input) return 0;
    const parts = input.toString().split(':');
    return parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseInt(input);
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    document.getElementById('addBtn').addEventListener('click', showModal);
    document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', loadFile);
    document.getElementById('saveBtn').addEventListener('click', saveWorkout);

    // Initial Defaults
    addSegment('Warmup', { duration: 600, power_low: 0.25, power_high: 0.75 });
    addSegment('SteadyState', { duration: 300, power: 0.90 });
    updateUI();
});

function showModal() { document.getElementById('typeModal').style.display = 'flex'; }
function closeModal() { document.getElementById('typeModal').style.display = 'none'; }
function handleAdd(type) {
    addSegment(type);
    closeModal();
}

function initChart() {
    const ctx = document.getElementById('workoutChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: [], borderWidth: 0, pointRadius: 0, fill: true, tension: 0, segment: {
                    backgroundColor: c => {
                        const y = (c.p0.parsed.y + c.p1.parsed.y) / 2;
                        return getZone(y).color + 'cc';
                    }
                }
            }]
        },
        options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', display: false },
                y: { display: false, beginAtZero: true, suggestedMax: 1.2 }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function updateUI() {
    renderSegmentsList();
    updateChart();
    updateStats();
}

function updateStats() {
    let totalSec = 0;
    segments.forEach(s => totalSec += (s.type === 'IntervalsT') ? s.repeat * (s.on_duration + s.off_duration) : s.duration);
    document.getElementById('totalDuration').innerText = formatTime(totalSec);
}

function updateChart() {
    const data = [];
    let currentTime = 0;
    segments.forEach(s => {
        if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            data.push({ x: currentTime, y: s.power_low });
            currentTime += s.duration;
            data.push({ x: currentTime, y: s.power_high });
        } else if (s.type === 'SteadyState') {
            data.push({ x: currentTime, y: s.power });
            currentTime += s.duration;
            data.push({ x: currentTime, y: s.power });
        } else if (s.type === 'IntervalsT') {
            for (let i = 0; i < s.repeat; i++) {
                data.push({ x: currentTime, y: s.on_power });
                currentTime += s.on_duration;
                data.push({ x: currentTime, y: s.on_power });
                data.push({ x: currentTime, y: s.off_power });
                currentTime += s.off_duration;
                data.push({ x: currentTime, y: s.off_power });
            }
        } else {
            data.push({ x: currentTime, y: 0.5 });
            currentTime += s.duration;
            data.push({ x: currentTime, y: 0.5 });
        }
    });
    chart.data.datasets[0].data = data;
    chart.update();
}

function addSegment(type, defaults = {}) {
    const base = { id: Date.now() + Math.random(), type, duration: 300 };
    if (type === 'Warmup' || type === 'Ramp') { base.power_low = 0.25; base.power_high = 0.75; }
    else if (type === 'CoolDown') { base.power_low = 0.75; base.power_high = 0.25; }
    else if (type === 'SteadyState') { base.power = 0.85; }
    else if (type === 'IntervalsT') { base.repeat = 5; base.on_duration = 60; base.off_duration = 60; base.on_power = 1.0; base.off_power = 0.5; base.duration = 0; }

    segments.push({ ...base, ...defaults });
    updateUI();
}

function removeSegment(id) {
    segments = segments.filter(s => s.id !== id);
    updateUI();
}

function moveSegment(id, dir) {
    const idx = segments.findIndex(s => s.id === id);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx >= 0 && newIdx < segments.length) {
        const temp = segments[idx];
        segments[idx] = segments[newIdx];
        segments[newIdx] = temp;
        updateUI();
    }
}

function updateSegment(id, field, value) {
    const s = segments.find(s => s.id === id);
    if (!s) return;
    if (field.includes('power')) s[field] = parseFloat(value) / 100;
    else if (field.includes('duration')) s[field] = parseTime(value);
    else s[field] = parseInt(value);
    updateUI();
}

function renderSegmentsList() {
    const list = document.getElementById('segmentsList');
    list.innerHTML = '';
    segments.forEach(s => {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.style.borderLeftColor = getZone(s.power || s.power_high || 0.5).color;

        let inputs = `<div class="seg-input-group"><label>Dur</label><input type="text" value="${formatTime(s.duration || s.on_duration)}" onchange="updateSegment(${s.id}, '${s.type === 'IntervalsT' ? 'on_duration' : 'duration'}', this.value)"></div>`;
        if (s.type === 'SteadyState') {
            inputs += `<div class="seg-input-group"><label>Power%</label><input type="number" value="${Math.round(s.power * 100)}" onchange="updateSegment(${s.id}, 'power', this.value)"></div>`;
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            inputs += `<div class="seg-input-group"><label>Start%</label><input type="number" value="${Math.round(s.power_low * 100)}" onchange="updateSegment(${s.id}, 'power_low', this.value)"></div>`;
            inputs += `<div class="seg-input-group"><label>End%</label><input type="number" value="${Math.round(s.power_high * 100)}" onchange="updateSegment(${s.id}, 'power_high', this.value)"></div>`;
        } else if (s.type === 'IntervalsT') {
            inputs = `<div class="seg-input-group"><label>Reps</label><input type="number" value="${s.repeat}" onchange="updateSegment(${s.id}, 'repeat', this.value)"></div>` + inputs;
            inputs += `<div class="seg-input-group"><label>On%</label><input type="number" value="${Math.round(s.on_power * 100)}" onchange="updateSegment(${s.id}, 'on_power', this.value)"></div>`;
            inputs += `<div class="seg-input-group"><label>OffDur</label><input type="text" value="${formatTime(s.off_duration)}" onchange="updateSegment(${s.id}, 'off_duration', this.value)"></div>`;
            inputs += `<div class="seg-input-group"><label>Off%</label><input type="number" value="${Math.round(s.off_power * 100)}" onchange="updateSegment(${s.id}, 'off_power', this.value)"></div>`;
        }

        div.innerHTML = `
            <div class="segment-header">
                <span class="segment-type">${s.type}</span>
                <div class="segment-actions">
                    <button class="btn-icon" onclick="moveSegment(${s.id}, -1)">▲</button>
                    <button class="btn-icon" onclick="moveSegment(${s.id}, 1)">▼</button>
                    <button class="btn-icon" onclick="removeSegment(${s.id})">✕</button>
                </div>
            </div>
            <div class="segment-details">${inputs}</div>
        `;
        list.appendChild(div);
    });
}

// ZWO Generation (Simplified for Mobile)
function saveWorkout() {
    const name = "Mobile Workout";
    let xml = `<?xml version="1.0" encoding="UTF-8"?><workout_file><author>Zwifter</author><name>${name}</name><description></description><sportType>bike</sportType><workout>`;
    segments.forEach(s => {
        if (s.type === 'SteadyState') xml += `<SteadyState Duration="${s.duration}" Power="${s.power}"/>`;
        else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) xml += `<${s.type} Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>`;
        else if (s.type === 'IntervalsT') xml += `<IntervalsT Repeat="${s.repeat}" OnDuration="${s.on_duration}" OffDuration="${s.off_duration}" OnPower="${s.on_power}" OffPower="${s.off_power}"/>`;
    });
    xml += `</workout></workout_file>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "workout.zwo"; a.click();
}

function loadFile(e) { /* Implementation omitted for brevity */ }
