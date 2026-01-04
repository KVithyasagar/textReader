// --- ASSETS: STATIC SMILING FACE LOGO ---
const SMILE_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="50" height="50">
  <circle cx="50" cy="50" r="45" fill="#FFEB3B" stroke="#FBC02D" stroke-width="2"/>
  <circle cx="35" cy="40" r="5" fill="#333"/>
  <circle cx="65" cy="40" r="5" fill="#333"/>
  <path d="M 30 65 Q 50 80 70 65" stroke="#333" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

// --- SUCCESS IMAGES (You can add your own URLs here) ---
const successImages = [
    "https://cdn-icons-png.flaticon.com/512/616/616490.png", // Trophy
    "https://cdn-icons-png.flaticon.com/512/744/744922.png", // Star
    "https://cdn-icons-png.flaticon.com/512/2278/2278992.png", // Happy
    "https://cdn-icons-png.flaticon.com/512/864/864837.png"  // Medal
];

// --- VARIABLES ---
let normalData = [];
let questionData = [];
let currentUser = "Student";
let ownerEmail = "";
let geminiKey = "";
let recognition = null;
let musicPlayer = document.getElementById('bg-music');
let isMusicOn = false;

// Session Configuration
let workQueue = [];
let currentBatchIndex = 0;
let batchSize = 1;

// Stats & Persistence
let levelStartTime = 0;
let bestTimes = JSON.parse(localStorage.getItem('ghostBestTimes')) || {};
let historyLog = JSON.parse(localStorage.getItem('ghostHistory')) || [];

// Global State
let currentLevelState = {
  data: [],
  combinedText: "",
  combinedKeywords: ""
};

// ==========================================
// 1. SETUP & MUSIC
// ==========================================

document.getElementById('app-logo-header').innerHTML = SMILE_LOGO_SVG;

// Music Control Logic
const musicBtn = document.getElementById('music-btn');
musicPlayer.volume = 0.3; // Low background volume

function toggleMusic() {
    if (musicPlayer.paused) {
        musicPlayer.play();
        isMusicOn = true;
        musicBtn.classList.add('playing');
        musicBtn.innerHTML = "⏸";
    } else {
        musicPlayer.pause();
        isMusicOn = false;
        musicBtn.classList.remove('playing');
        musicBtn.innerHTML = "🎵";
    }
}

// Pause music temporarily (for speech/TTS)
function pauseMusicTemp() {
    if (isMusicOn && !musicPlayer.paused) {
        musicPlayer.pause();
    }
}

// Resume music if it was globally on
function resumeMusicTemp() {
    if (isMusicOn && musicPlayer.paused) {
        musicPlayer.play();
    }
}

musicBtn.onclick = toggleMusic;

document.getElementById('close-app-btn').onclick = () => {
    document.getElementById('ghost-overlay-root').style.display = 'none';
    document.getElementById('setup-container').style.display = 'block';
    musicPlayer.pause();
    musicBtn.classList.remove('playing');
};

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split('\n');
    const parsedData = [];
    lines.forEach(line => {
      if (line.includes('|')) {
        const parts = line.split('|');
        parsedData.push({ text: parts[0].trim(), keyword: parts[1].trim() });
      }
    });
    normalData = parsedData.filter(item => !item.text.startsWith("Q:"));
    questionData = parsedData.filter(item => item.text.startsWith("Q:"));
    document.getElementById('status').innerText = `✅ Loaded ${parsedData.length} lines`;
  };
  reader.readAsText(file);
});

document.getElementById('startBtn').addEventListener('click', () => {
    if (normalData.length === 0 && questionData.length === 0) {
        alert("Please upload a valid data file first.");
        return;
    }
    currentUser = document.getElementById('username').value.trim() || "Student";
    ownerEmail = document.getElementById('ownerEmail').value.trim() || "";
    geminiKey = document.getElementById('apiKey').value.trim();

    document.getElementById('setup-container').style.display = 'none';
    document.getElementById('ghost-overlay-root').style.display = 'block';
    
    // Auto-start music
    toggleMusic();

    currentBatchIndex = 0;
    workQueue = [];
    renderSelectionPage();
});

// ==========================================
// 2. SELECTION PAGE
// ==========================================
function renderSelectionPage() {
  const container = document.getElementById('ghost-content-area');
  container.innerHTML = `<h2 style="color:#01579b; margin-top:0;">Select Sentences</h2>`;
  const wrapper = document.createElement('div');
  wrapper.style.textAlign = "left";

  const controlRow = document.createElement('div');
  Object.assign(controlRow.style, { display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', background: '#f5f5f5', padding: '10px', borderRadius: '8px' });

  const toggleAllBtn = document.createElement('button');
  toggleAllBtn.innerText = "Select All";
  Object.assign(toggleAllBtn.style, { padding: '8px 12px', background: '#00bcd4', color: 'white', border: 'none', borderRadius: '4px' });

  const batchLabel = document.createElement('span');
  batchLabel.innerText = "Group Size:";
  batchLabel.style.fontWeight = "bold";
  batchLabel.style.fontSize = "12px";

  const batchInput = document.createElement('input');
  batchInput.type = "number";
  batchInput.value = "1"; 
  batchInput.min = "1";
  batchInput.max = "100"; 
  Object.assign(batchInput.style, { width: '50px', padding: '5px' });

  controlRow.append(toggleAllBtn, batchLabel, batchInput);

  const listContainer = document.createElement('div');
  Object.assign(listContainer.style, { maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', borderRadius: '6px' });

  const checkboxes = [];
  normalData.forEach((item, idx) => {
    const pastAttempts = historyLog.filter(h => h.sentence === item.text).length;
    const row = document.createElement('div');
    row.style.marginBottom = "8px";
    const chk = document.createElement('input');
    chk.type = "checkbox"; chk.value = idx; chk.id = `ghost-chk-${idx}`; chk.style.marginRight = "10px"; chk.style.width = "auto";
    const lbl = document.createElement('label');
    lbl.htmlFor = `ghost-chk-${idx}`;
    lbl.innerHTML = `<b>#${idx + 1}</b>: ${item.text.substring(0, 40)}... <span style="font-size:11px; color:#666;">(${pastAttempts})</span>`;
    row.append(chk, lbl);
    listContainer.appendChild(row);
    checkboxes.push(chk);
  });

  toggleAllBtn.onclick = () => {
    const allChecked = checkboxes.every(c => c.checked);
    checkboxes.forEach(c => c.checked = !allChecked);
    toggleAllBtn.innerText = allChecked ? "Deselect All" : "Select All";
  };

  const startBtn = document.createElement('button');
  startBtn.innerText = "START SESSION";
  startBtn.className = "start-btn"; 
  startBtn.onclick = () => {
    workQueue = [];
    checkboxes.forEach((c) => { if (c.checked) workQueue.push(normalData[parseInt(c.value)]); });
    if (workQueue.length === 0) return alert("Please select at least one sentence.");
    batchSize = parseInt(batchInput.value) || 1;
    currentBatchIndex = 0; 
    startLevel();
  };

  wrapper.append(controlRow, listContainer, startBtn);
  container.appendChild(wrapper);
}

// ==========================================
// 3. MAIN TRAINING LOGIC
// ==========================================
function startLevel() {
  const container = document.getElementById('ghost-content-area');
  container.innerHTML = ""; 
  levelStartTime = Date.now();
  const actualStartIndex = currentBatchIndex * batchSize;

  if (actualStartIndex >= workQueue.length) {
    showFinishScreen();
    return;
  }

  currentLevelState.data = workQueue.slice(actualStartIndex, actualStartIndex + batchSize);
  updateLevelState(); 

  const attemptCount = historyLog.filter(h => h.sentence === currentLevelState.combinedText).length + 1;
  speakText(currentLevelState.combinedText);

  const startNum = actualStartIndex + 1;
  const endNum = actualStartIndex + currentLevelState.data.length;
  
  const statsBar = document.createElement('div');
  statsBar.className = 'stats-bar';
  statsBar.id = 'ghost-stats-bar';
  statsBar.innerHTML = `
    <span>Items: ${startNum} - ${endNum}</span>
    <span id="ghost-keyword-stats">Keywords: 0 / ${getKeywordCount(currentLevelState.combinedKeywords)}</span>
    <span>Attempt #${attemptCount}</span>
  `;

  const textDiv = document.createElement('div');
  textDiv.id = "ghost-text";
  textDiv.innerHTML = formatTextHighlights(currentLevelState.combinedText, ""); 
  textDiv.style.opacity = "1";
  textDiv.onclick = () => { textDiv.style.opacity = "1"; document.getElementById('ghost-user-input').focus(); pauseMusicTemp(); };

  const input = document.createElement('input');
  input.type = "text";
  input.id = "ghost-user-input"; 
  input.placeholder = "Type here... (text hides when typing)";
  
  const feedbackDiv = document.createElement('div');
  feedbackDiv.id = "ghost-input-feedback";

  const btnRow = document.createElement('div');
  btnRow.className = "ghost-btn-row";
  
  const micBtn = createButton("🎤 Speak", "btn-mic");
  const peekBtn = createButton("👁️ Peek", "btn-peek"); 
  const knowBtn = createButton("🧠 I Know", "btn-know"); 
  
  const addGroup = document.createElement('div');
  addGroup.className = "add-group";
  const addInput = document.createElement('input');
  addInput.type = "number"; addInput.value = "5"; addInput.className = "add-input";
  const addMoreBtn = createButton("➕ Add", "btn-add");

  addMoreBtn.onclick = () => {
    pauseMusicTemp(); // Pause for interaction
    const numToAdd = parseInt(addInput.value) || 5;
    const currentCount = currentLevelState.data.length;
    const nextStart = actualStartIndex + currentCount;
    const moreItems = workQueue.slice(nextStart, nextStart + numToAdd);
    if (moreItems.length === 0) return alert("End of list reached.");
    currentLevelState.data = [...currentLevelState.data, ...moreItems];
    updateLevelState();
    const txtDiv = document.getElementById('ghost-text');
    txtDiv.innerHTML = formatTextHighlights(currentLevelState.combinedText, input.value); 
    txtDiv.style.opacity = "1"; 
    const newEndNum = actualStartIndex + currentLevelState.data.length;
    document.getElementById('ghost-stats-bar').children[0].innerText = `Items: ${startNum} - ${newEndNum}`;
    updateLiveKeywordStats(input.value);
    speakText(moreItems.map(d=>d.text).join(' '));
  };

  addGroup.append(addInput, addMoreBtn);
  const endBtn = createButton("⏹️ End", "btn-end");
  btnRow.append(micBtn, peekBtn, knowBtn, addGroup, endBtn);

  input.addEventListener('input', () => { 
      textDiv.style.opacity = "0"; 
      textDiv.innerHTML = formatTextHighlights(currentLevelState.combinedText, input.value);
      updateLiveKeywordStats(input.value); 
  });
  
  input.addEventListener('keyup', (e) => { 
    if (e.key === 'Enter') checkBatchMatch(input.value, currentLevelState.data, currentLevelState.combinedKeywords, "Typed"); 
  });

  micBtn.onclick = () => { toggleVoice(input, currentLevelState.combinedKeywords, currentLevelState.data); };
  
  peekBtn.onclick = () => { textDiv.style.opacity = "1"; input.focus(); pauseMusicTemp(); };
  
  knowBtn.onclick = () => { 
      textDiv.innerHTML = formatTextHighlights(currentLevelState.combinedText, currentLevelState.combinedText); 
      textDiv.style.opacity = "1"; 
      checkBatchMatch(currentLevelState.combinedKeywords, currentLevelState.data, currentLevelState.combinedKeywords, "Known"); 
  };
  endBtn.onclick = () => showFinishScreen(); 

  container.append(statsBar, textDiv, input, feedbackDiv, btnRow);
  setTimeout(() => input.focus(), 50); 
}

function formatTextHighlights(targetText, userText) {
    const tokens = targetText.split(/([^a-zA-Z0-9]+)/);
    const userWords = userText.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(w => w.length > 0);
    return tokens.map(token => {
        if (/[a-zA-Z0-9]/.test(token)) {
            const cleanToken = token.toLowerCase();
            if (userWords.includes(cleanToken)) return `<span style="color:#43a047; font-weight:bold;">${token}</span>`; 
            return `<span style="color:#0277bd;">${token}</span>`; 
        }
        return token;
    }).join('');
}

function parseKeywords(keywordString) {
    const raw = keywordString.toLowerCase();
    if (raw.includes(',')) {
        return raw.split(',').map(chunk => chunk.trim().split('/').map(v => v.trim()).filter(v => v.length > 0)).filter(group => group.length > 0);
    }
    const tokens = raw.split(/\s+/).filter(w => w.length > 0);
    return tokens.map(token => token.split(/[\/]/).filter(t => t.length > 0));
}

function getKeywordCount(kString) {
    return parseKeywords(kString).length;
}

function updateLiveKeywordStats(userText) {
    const requiredGroups = parseKeywords(currentLevelState.combinedKeywords);
    let matches = 0;
    let foundWords = [];
    requiredGroups.forEach(group => {
        const matchedVariants = group.filter(variant => userText.toLowerCase().includes(variant));
        if (matchedVariants.length > 0) {
            matches += matchedVariants.length; 
            matchedVariants.forEach(m => foundWords.push(`${m} ✅`));
        }
    });
    document.getElementById('ghost-keyword-stats').innerHTML = `Keywords: <b>${matches}</b> / ${requiredGroups.length}`;
    document.getElementById('ghost-input-feedback').innerHTML = foundWords.length > 0 ? foundWords.join('&nbsp;&nbsp; ') : '';
}

function updateLevelState() {
    currentLevelState.combinedText = currentLevelState.data.map(d => d.text).join(' ');
    currentLevelState.combinedKeywords = currentLevelState.data.map(d => d.keyword).join(' ');
}

function checkBatchMatch(userText, batchData, combinedKeywords, method) {
  let passed = false;
  let matchesCount = 0;
  const requiredGroups = parseKeywords(combinedKeywords);

  if (method === "Known") {
      passed = true;
      matchesCount = requiredGroups.length;
  } else {
      const userLower = userText.trim().toLowerCase();
      matchesCount = 0;
      requiredGroups.forEach(group => {
         if (group.some(variant => userLower.includes(variant))) matchesCount++; 
      });
      if ((matchesCount / requiredGroups.length) * 100 >= 80) passed = true;
  }
  
  if (passed) {
    const input = document.getElementById('ghost-user-input');
    if(input) { input.style.border = "2px solid #66bb6a"; input.value = "Correct!"; input.disabled = true; }

    const now = Date.now();
    const duration = (now - levelStartTime) / 1000; 
    const batchKey = batchData.map(d => d.text).join(' ');
    let historicalBest = bestTimes[batchKey] || Infinity;
    let isNewRecord = false;
    if (duration < historicalBest) {
        historicalBest = duration; bestTimes[batchKey] = duration; isNewRecord = true;
        localStorage.setItem('ghostBestTimes', JSON.stringify(bestTimes));
    }

    const record = {
        date: new Date().toLocaleString(),
        sentence: batchKey,
        time: duration.toFixed(2),
        best: historicalBest.toFixed(2),
        method: method, 
        deviation: (historicalBest !== Infinity ? (duration - historicalBest).toFixed(2) : "0.00"),
        keywordsFound: matchesCount,
        totalKeywords: requiredGroups.length
    };
    
    historyLog.push(record);
    localStorage.setItem('ghostHistory', JSON.stringify(historyLog));
    setTimeout(() => { showResultModal(record, isNewRecord); }, 400); 
  } else {
    const input = document.getElementById('ghost-user-input');
    input.style.border = "2px solid #ef5350"; 
    shakeInput(input);
  }
}

// --- MODIFIED SUCCESS SCREEN (RANDOM IMAGE) ---
function showResultModal(currentRecord, isNewRecord) {
    const container = document.getElementById('ghost-content-area');
    container.innerHTML = ""; 

    const modal = document.createElement('div');
    modal.style.textAlign = "center";
    
    const myHistory = historyLog.filter(h => h.sentence === currentRecord.sentence).reverse();
    let totalTime = 0; myHistory.forEach(h => totalTime += parseFloat(h.time));
    const recentHistory = myHistory.slice(0, 5); 

    // PICK RANDOM IMAGE
    const randomImgUrl = successImages[Math.floor(Math.random() * successImages.length)];

    let tableHtml = `
      <table id="ghost-history-table" style="width:100%; border-collapse:collapse; margin-top:15px; font-size:12px; text-align:left; color:#006064;">
        <tr style="border-bottom:1px solid #b2ebf2;"><th style="padding:5px;">Date</th><th style="padding:5px;">Time</th></tr>
    `;
    recentHistory.forEach(h => {
        tableHtml += `<tr style="border-bottom:1px solid #e0f7fa;"><td style="padding:5px;">${h.date.split(',')[0]}</td><td style="padding:5px;">${h.time}s</td></tr>`;
    });
    tableHtml += "</table>";

    modal.innerHTML = `
        <h3 style="color:#0277bd; margin:5px 0 5px 0;">Great Job!</h3>
        <img src="${randomImgUrl}" class="success-img" alt="Success">

        <div style="background:rgba(255,255,255,0.6); padding:10px; border-radius:10px; border:1px solid #b2ebf2; margin-bottom:15px;">
            <div style="font-size:14px; color:#006064; display:flex; justify-content:space-around; margin-bottom:8px;">
                 <span><b>${currentRecord.keywordsFound}</b> / <b>${currentRecord.totalKeywords}</b> Keywords</span>
                 <span style="color:#43a047">Correctly Typed</span>
            </div>
             <hr style="border:0; border-top:1px solid #e0f7fa; margin:5px 0;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:13px; color:#555;">
                <div>⏱️ Time: <b>${currentRecord.time}s</b></div>
                <div id="ghost-best-display">🏆 Best: <b>${currentRecord.best}s</b></div>
                <div>📉 Dev: <b>${currentRecord.deviation}s</b></div>
                <div>📊 Total: <b>${totalTime.toFixed(2)}s</b></div>
            </div>
        </div>
        <div style="text-align:left;">${tableHtml}</div>
    `;

    const btnRow = document.createElement('div');
    btnRow.className = "ghost-btn-row";
    btnRow.style.justifyContent = "center";

    const nextBtn = createButton("Continue ➡️", "start-btn"); 
    nextBtn.style.margin = "0"; 
    nextBtn.onclick = () => { currentBatchIndex++; startLevel(); resumeMusicTemp(); };

    const saveBtn = createButton("End Session", "btn-end");
    saveBtn.onclick = () => showFinishScreen();

    const resetBtn = createButton("Reset History 🔄", "btn-peek");
    resetBtn.onclick = () => {
        if (confirm("Reset all history?")) {
            historyLog = []; bestTimes = {};
            localStorage.setItem('ghostHistory', JSON.stringify([]));
            localStorage.setItem('ghostBestTimes', JSON.stringify({}));
            document.getElementById('ghost-history-table').innerHTML = '<tr><td colspan="2" style="text-align:center; padding:10px;">History Cleared</td></tr>';
            document.getElementById('ghost-best-display').innerHTML = '🏆 Best: <b>-</b>';
        }
    };

    btnRow.append(saveBtn, resetBtn, nextBtn);
    modal.appendChild(btnRow);
    container.appendChild(modal);
}

function showFinishScreen() {
    const container = document.getElementById('ghost-content-area');
    container.innerHTML = "";
    const title = document.createElement('h2'); title.innerHTML = `Session Complete`; title.style.color = "#01579b"; title.style.marginTop = "0";
    const downloadBtn = createButton("Download History (.csv)", "btn-know"); downloadBtn.style.width = "100%"; downloadBtn.onclick = downloadCSV;
    const examBtn = createButton("Start AI Exam", "btn-peek"); examBtn.style.width = "100%"; examBtn.onclick = renderAIExam;
    container.append(title, downloadBtn, document.createElement('br'), document.createElement('br'), examBtn);
}

function downloadCSV() {
    let csvContent = "data:text/csv;charset=utf-8,Student,Date,Sentence,Method,Time(s),Best(s),Deviation(s)\n";
    historyLog.forEach((row) => { csvContent += `${currentUser},${row.date},"${row.sentence.replace(/"/g, '""')}",${row.method},${row.time},${row.best},${row.deviation}\n`; });
    const link = document.createElement("a"); link.href = encodeURI(csvContent); link.download = `${currentUser}_History.csv`; document.body.appendChild(link); link.click(); link.remove();
}

function renderAIExam() {
  const container = document.getElementById('ghost-content-area'); container.innerHTML = `<h2 style="color:#01579b; margin-top:0;">AI Exam</h2>`;
  const qList = document.createElement('div'); qList.style.textAlign = "left"; qList.style.marginBottom = "20px"; qList.style.background = "rgba(255,255,255,0.7)"; qList.style.padding = "10px"; qList.style.borderRadius = "8px";
  questionData.forEach((item, index) => { qList.innerHTML += `<div style="margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #b2ebf2;"><b style="color:#0288d1">Q${index+1}:</b> <span style="font-size:16px;">${item.text.replace(/^Q:\s*/, "")}</span></div>`; });
  container.appendChild(qList);

  const instruction = document.createElement('div'); instruction.style.marginBottom = "10px"; instruction.style.fontSize = "13px"; instruction.style.color = "#555"; instruction.innerHTML = "<b>Option A:</b> Type answers below (Format: <i>1. Answer...</i>)<br><b>Option B:</b> Upload an image to scan";
  container.appendChild(instruction);

  const fileInput = document.createElement('input'); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "block"; fileInput.style.marginBottom = "10px";
  const scanBtn = createButton("UPLOAD & SCAN", "start-btn"); scanBtn.style.width = "100%";
  const textArea = document.createElement('textarea'); textArea.id = "ai-result-box"; textArea.placeholder = "1. Answer one\n2. Answer two\n(Or upload image to scan)...";
  Object.assign(textArea.style, { width: "100%", height: "120px", marginTop: "10px", padding: "10px", borderRadius: "8px", border: "1px solid #4fc3f7", fontFamily: "sans-serif" });
  const submitBtn = createButton("CHECK ANSWERS", "btn-know"); submitBtn.style.display = "block"; submitBtn.style.width = "100%";
  const resultsDiv = document.createElement('div'); resultsDiv.id = "exam-results"; resultsDiv.style.marginTop = "20px";
  
  scanBtn.onclick = () => { if (fileInput.files.length === 0) return alert("Select image!"); attemptGeminiScan(fileInput.files[0], "gemini-3-pro-preview", textArea, scanBtn, submitBtn); };
  submitBtn.onclick = () => { 
    const fullText = textArea.value; if (!fullText.trim()) return alert("Please type an answer or upload an image.");
    resultsDiv.innerHTML = "<h3 style='color:#01579b'>Exam Results</h3>";
    const parsedAnswers = {}; const regex = /(?:^|\n|\s)(\d+)[\.\)]\s*(.*?)(?=(?:\n\s*\d+[\.\)])|$)/gs; let match;
    while ((match = regex.exec(fullText)) !== null) { parsedAnswers[match[1]] = match[2].trim().toLowerCase(); }
    let correctCount = 0;
    questionData.forEach((q, idx) => {
        const qNum = (idx + 1).toString(); const extractedAnswer = parsedAnswers[qNum] || ""; 
        const requiredGroups = parseKeywords(q.keyword);
        const allGroupsMatched = requiredGroups.every(group => group.some(variant => extractedAnswer.includes(variant)));
        const passed = allGroupsMatched; if (passed) correctCount++;
        const statusIcon = passed ? "✅" : "❌"; const color = passed ? "#43a047" : "#ef5350"; const foundText = extractedAnswer ? `"${extractedAnswer.substring(0, 50)}${extractedAnswer.length>50?'...':''}"` : "<i>(No text found)</i>";
        resultsDiv.innerHTML += `<div style="text-align:left; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;"><b style="color:${color}">${statusIcon} Q${idx+1}</b><div style="font-size:12px; color:#555;">Found: ${foundText}</div></div>`;
    });
    const scorePct = Math.round((correctCount / questionData.length) * 100);
    resultsDiv.innerHTML = `<h2 style="color:${scorePct >= 50 ? '#43a047' : '#ef5350'}">Score: ${correctCount}/${questionData.length} (${scorePct}%)</h2>` + resultsDiv.innerHTML;
    const retryBtn = createButton("Retry Exam", "btn-peek"); retryBtn.style.marginTop = "10px"; retryBtn.onclick = () => renderAIExam(); resultsDiv.appendChild(retryBtn);
  };
  container.append(fileInput, scanBtn, textArea, submitBtn, resultsDiv);
}

// --- UTILS & AUDIO ---
async function attemptGeminiScan(file, modelId, textArea, scanBtn, submitBtn) {
  scanBtn.innerText = `...`;
  try {
    const base64 = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result.split(',')[1]); r.readAsDataURL(file); });
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe handwriting exactly." }, { inline_data: { mime_type: "image/jpeg", data: base64 } }] }] }) });
    const data = await resp.json();
    if(data.error && modelId.includes('pro')) return attemptGeminiScan(file, "gemini-3-flash-preview", textArea, scanBtn, submitBtn);
    textArea.value = data.candidates[0].content.parts[0].text; scanBtn.innerText = "Done"; 
  } catch (e) { alert(e.message); scanBtn.innerText = "Error"; }
}

function speakText(text) { 
    pauseMusicTemp(); // Pause music for TTS
    if ('speechSynthesis' in window) { 
        window.speechSynthesis.cancel(); 
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => resumeMusicTemp(); // Resume after TTS
        window.speechSynthesis.speak(u); 
    } else { resumeMusicTemp(); }
}

function createButton(text, className) { const b = document.createElement('button'); b.innerHTML = text; b.className = "ghost-btn " + className; return b; }

function toggleVoice(input, k, batchData) { 
    pauseMusicTemp(); // Pause music for mic
    if (!('webkitSpeechRecognition' in window)) return alert("No Voice API");
    recognition = new webkitSpeechRecognition(); recognition.lang = 'en-US';
    // MODIFIED: Voice no longer submits automatically. Just fills input.
    recognition.onresult = (e) => { 
        input.value = e.results[0][0].transcript; 
        input.dispatchEvent(new Event('input')); // Trigger visual updates
    };
    recognition.onend = () => resumeMusicTemp(); // Resume after mic
    recognition.start();
}

function shakeInput(el) { el.style.transform = "translateX(5px)"; setTimeout(() => el.style.transform = "translateX(-5px)", 50); setTimeout(() => el.style.transform = "translateX(0)", 100); }
