// ===================== Sound engine =====================
// Background music is a plain <audio> element (loops continuously once started).
// Crackers/surprise effects are synthesized with the Web Audio API so no extra
// sound files are needed. `siteMuted` is shared by every sound-producing function.
let siteMuted = false;
let siteAudioCtx = null;

function getAudioContext(){
  if (!siteAudioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) siteAudioCtx = new AC();
  }
  if (siteAudioCtx && siteAudioCtx.state === 'suspended'){
    siteAudioCtx.resume();
  }
  return siteAudioCtx;
}

// Firework/crackers burst: a handful of short filtered-noise pops layered
// with slight random timing.
function playCrackersSound(){
  const ctx = getAudioContext();
  if (!ctx || siteMuted) return;
  const now = ctx.currentTime;

  for (let i = 0; i < 7; i++){
    const start = now + Math.random() * 0.35;
    const duration = 0.12 + Math.random() * 0.1;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < bufferSize; j++){
      data[j] = (Math.random() * 2 - 1) * (1 - j / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200 + Math.random() * 1800;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(start);
    noise.stop(start + duration);
  }
}

// Bright little ascending chime for the teddy's surprise reveal.
function playSurpriseSound(){
  const ctx = getAudioContext();
  if (!ctx || siteMuted) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

  notes.forEach((freq, i) => {
    const start = now + i * 0.09;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.5);
  });
}

// Plays a real audio-file sound effect (as opposed to the synthesized ones
// above). Restarts from the beginning every time so rapid re-triggers work.
function playSfxElement(id){
  if (siteMuted) return;
  const el = document.getElementById(id);
  if (!el) return;
  try{
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch (e){ /* ignore */ }
}

function initSound(){
  const bgMusic = document.getElementById('bgMusic');
  const muteBtn = document.getElementById('muteBtn');
  const enterBtn = document.getElementById('enterBtn');
  if (!bgMusic || !muteBtn) return;

  let started = false;
  bgMusic.volume = 0.45;
  bgMusic.loop = true;

  function startMusic(){
    if (started) return;
    started = true;
    getAudioContext();
    bgMusic.muted = siteMuted;
    bgMusic.play().catch(() => {});
  }

  function toggleMute(){
    siteMuted = !siteMuted;
    bgMusic.muted = siteMuted;
    ['sfxMeme', 'sfxSurprise', 'sfxFirecrackers'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.muted = siteMuted;
    });
    muteBtn.textContent = siteMuted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', siteMuted ? 'Unmute music' : 'Mute music');
  }

  muteBtn.addEventListener('click', toggleMute);

  // Music starts the moment she enters the celebration -- a real user
  // gesture, which browsers require before audio can autoplay.
  if (enterBtn){
    enterBtn.addEventListener('click', startMusic, { once: true });
  }
}

// ===================== Ambient gold particles =====================
function spawnParticles(){
  const container = document.getElementById('particles');
  if (!container) return;
  const count = window.innerWidth < 500 ? 14 : 24;

  for (let i = 0; i < count; i++){
    const p = document.createElement('span');
    p.className = 'particle';
    const left = Math.random() * 100;
    const duration = 6 + Math.random() * 7;
    const delay = Math.random() * 10;
    const driftX = (Math.random() * 60 - 30) + 'px';
    const size = 2 + Math.random() * 3;

    p.style.left = left + '%';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.setProperty('--drift-x', driftX);
    p.style.animationDuration = duration + 's';
    p.style.animationDelay = delay + 's';

    container.appendChild(p);
  }
}

// ===================== Surprise box (pull the ribbon to open) =====================
function initGiftBox(){
  const lid = document.getElementById('boxLid');
  const ribbonV = document.getElementById('ribbonV');
  const ribbonH = document.getElementById('ribbonH');
  const teddy = document.getElementById('teddy');
  const revealLine = document.getElementById('revealLine');
  const hint = document.getElementById('boxHint');
  const header = document.getElementById('surpriseHeader');
  const title = document.getElementById('surpriseTitle');
  const reveal = document.getElementById('surpriseReveal');
  const confettiLayer = document.getElementById('confettiLayer');
  const findBtn = document.getElementById('findSurpriseBtn');
  if (!ribbonV) return;

  const PULL_THRESHOLD = 45; // px pulled (either direction) before it counts as "open"
  const TOTAL_ATTEMPTS = 3; // first two are empty (meme sound); third has the teddy

  const ATTEMPT_TITLES = [
    'Pull the Ribbon to Open',
    'Empty? Try Once More',
    'One Last Pull...'
  ];
  const ATTEMPT_HINTS = [
    'pull the ribbon ↕',
    'pull again ↕',
    'pull the ribbon ↕'
  ];
  const EMPTY_LINES = [
    "Huh... it's empty? 🎁",
    "Still nothing... one more try 👀"
  ];

  let startY = 0;
  let dragging = false;
  let busy = false; // locks input during any animation, including resets
  let attempt = 1;

  function onPointerDown(e){
    if (busy) return;
    dragging = true;
    startY = e.clientY;
    ribbonV.classList.add('tugging');
    ribbonV.setPointerCapture && ribbonV.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e){
    if (!dragging || busy) return;
    const deltaY = e.clientY - startY;
    const clamped = Math.max(-70, Math.min(70, deltaY));
    ribbonV.style.transform = `translateX(-50%) translateY(${clamped}px)`;

    if (Math.abs(clamped) >= PULL_THRESHOLD){
      finishOpen();
    }
  }

  function onPointerUp(){
    if (!dragging || busy) return;
    dragging = false;
    ribbonV.classList.remove('tugging');
    ribbonV.style.transform = '';
  }

  function finishOpen(){
    if (busy) return;
    busy = true;
    dragging = false;
    ribbonV.classList.remove('tugging');
    ribbonV.style.transform = '';

    // Ribbon pulls free and disappears; lid relocates beside the box
    // (stays fully visible, never fades or flies off-screen).
    ribbonV.classList.add('pulled');
    if (ribbonH) ribbonH.classList.add('pulled');
    if (lid) lid.classList.add('set-aside');
    if (hint) hint.style.opacity = '0';

    spawnConfetti(confettiLayer);

    if (attempt < TOTAL_ATTEMPTS){
      revealEmpty();
    } else {
      revealTeddy();
    }
  }

  function revealEmpty(){
    playSfxElement('sfxMeme');

    setTimeout(() => {
      if (revealLine){
        revealLine.textContent = EMPTY_LINES[attempt - 1];
        revealLine.classList.add('show');
      }
    }, 500);

    setTimeout(() => {
      resetBox();
    }, 2200);
  }

  function resetBox(){
    if (revealLine) revealLine.classList.remove('show');

    setTimeout(() => {
      // Restore the box to its unopened state for the next attempt.
      ribbonV.classList.remove('pulled');
      if (ribbonH) ribbonH.classList.remove('pulled');
      if (lid) lid.classList.remove('set-aside');
      if (hint){
        hint.style.opacity = '';
        hint.textContent = ATTEMPT_HINTS[attempt];
      }

      attempt++;
      if (title) title.textContent = ATTEMPT_TITLES[attempt - 1];
      if (revealLine) revealLine.textContent = '';

      busy = false;
    }, 500);
  }

  function revealTeddy(){
    if (header) header.classList.add('fade');

    // Text first...
    setTimeout(() => {
      if (revealLine){
        revealLine.textContent = 'This is for you 🎁';
        revealLine.classList.add('show');
      }
    }, 700);

    // ...then the teddy peeks out after it.
    setTimeout(() => {
      teddy.classList.add('burst');
      playSfxElement('sfxSurprise');
    }, 1400);

    setTimeout(() => {
      if (reveal) reveal.classList.add('show');
    }, 2600);
  }

  ribbonV.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  // Fallback: tap/click also opens, for accessibility & non-drag users
  ribbonV.addEventListener('click', () => { if (!busy) finishOpen(); });

  if (findBtn){
    findBtn.addEventListener('click', () => goToScreen('screen-open-box'));
  }
}

// ===================== Second gift box (click to open) =====================
function initGiftBox2(){
  const openBtn = document.getElementById('openBox2Btn');
  const box2 = document.getElementById('giftBox2');
  if (!openBtn || !box2) return;

  let opened = false;

  openBtn.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    box2.classList.add('opening');
    openBtn.disabled = true;
    openBtn.style.opacity = '0.55';

    setTimeout(() => {
      goToScreen('screen-cake');
    }, 650);
  });
}

function spawnConfetti(container){
  if (!container) return;
  const colors = ['#c9a15a', '#ecd39a', '#c22a42', '#1f7a68', '#f3e9d8'];
  const count = window.innerWidth < 500 ? 22 : 34;

  for (let i = 0; i < count; i++){
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 110;
    const cx = Math.cos(angle) * distance;
    const cy = Math.sin(angle) * distance - 40; // bias upward
    const rot = (Math.random() * 480 - 240) + 'deg';

    piece.style.setProperty('--cx', cx + 'px');
    piece.style.setProperty('--cy', cy + 'px');
    piece.style.setProperty('--crot', rot);
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.15) + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';

    container.appendChild(piece);
    setTimeout(() => piece.remove(), 1800);
  }
}

// ===================== Cake (click to blow out candles) =====================
function initCake(){
  const blowBtn = document.getElementById('blowBtn');
  const flame1 = document.getElementById('flame1');
  const flame2 = document.getElementById('flame2');
  const reveal = document.getElementById('cakeReveal');
  const fx = document.getElementById('cakeFx');
  const cakeNextBtn = document.getElementById('cakeNextBtn');
  if (!blowBtn) return;

  let blown = false;

  blowBtn.addEventListener('click', () => {
    if (blown) return;
    blown = true;

    if (flame1) flame1.classList.add('out');
    if (flame2) flame2.classList.add('out');
    blowBtn.disabled = true;
    blowBtn.style.opacity = '0.55';

    spawnFireworks(fx);
    spawnFloaters(fx, 4200);
    playSfxElement('sfxFirecrackers');

    setTimeout(() => {
      if (reveal) reveal.classList.add('show');
    }, 900);
  });

  if (cakeNextBtn){
    cakeNextBtn.addEventListener('click', () => goToScreen('screen-video'));
  }
}

function spawnFireworks(container){
  if (!container) return;
  const colors = ['#c9a15a', '#ecd39a', '#c22a42', '#f3e9d8', '#e8cd8a'];
  const bursts = 4;

  for (let b = 0; b < bursts; b++){
    setTimeout(() => {
      const originX = 12 + Math.random() * 76; // vw
      const originY = 12 + Math.random() * 42; // vh
      const count = 20;

      for (let i = 0; i < count; i++){
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        const angle = Math.random() * Math.PI * 2;
        const distance = 70 + Math.random() * 130;
        const cx = Math.cos(angle) * distance;
        const cy = Math.sin(angle) * distance;
        const rot = (Math.random() * 480 - 240) + 'deg';

        piece.style.left = originX + 'vw';
        piece.style.top = originY + 'vh';
        piece.style.setProperty('--cx', cx + 'px');
        piece.style.setProperty('--cy', cy + 'px');
        piece.style.setProperty('--crot', rot);
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.animationDuration = '1.3s';

        container.appendChild(piece);
        setTimeout(() => piece.remove(), 1500);
      }
    }, b * 380);
  }
}

function spawnFloaters(container, durationMs){
  if (!container) return;
  const emojis = ['❤️', '✨', '🎈', '💛'];

  function spawnOne(){
    const item = document.createElement('span');
    item.className = 'fx-item';
    item.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const left = Math.random() * 100;
    const duration = 3.4 + Math.random() * 2.4;
    const driftX = (Math.random() * 120 - 60) + 'px';
    const rot = (Math.random() * 50 - 25) + 'deg';
    const size = 1.1 + Math.random() * 0.9;

    item.style.left = left + '%';
    item.style.fontSize = size + 'rem';
    item.style.setProperty('--fx-x', driftX);
    item.style.setProperty('--fx-rot', rot);
    item.style.animationDuration = duration + 's';

    container.appendChild(item);
    setTimeout(() => item.remove(), duration * 1000 + 200);
  }

  const interval = setInterval(() => {
    spawnOne();
    spawnOne();
  }, 220);

  setTimeout(() => clearInterval(interval), durationMs);
}

// ===================== Games hub =====================
function initGamesHub(){
  const map = {
    cardSpin: 'screen-spin',
    cardChoose: 'screen-game-card',
    cardBalloon: 'screen-game-balloon',
    cardQuiz: 'screen-game-quiz'
  };

  Object.keys(map).forEach((id) => {
    const btn = document.getElementById(id);
    if (btn){
      btn.addEventListener('click', () => goToScreen(map[id]));
    }
  });

  const returnMap = ['returnFromSpin', 'returnFromCard', 'returnFromBalloon', 'returnFromQuiz', 'returnFromSecret'];
  returnMap.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn){
      btn.addEventListener('click', () => goToScreen('screen-games-hub'));
    }
  });
}

// ===================== Spin the Wheel =====================
function initSpinWheel(){
  const wheel = document.getElementById('spinWheel');
  const spinBtn = document.getElementById('spinBtn');
  const dareReveal = document.getElementById('dareReveal');
  const dareText = document.getElementById('dareText');
  if (!wheel || !spinBtn) return;

  // 10 sections, matching the emoji order placed around the wheel markup above.
  // Edit the dare text here whenever you'd like to personalize them.
  const dares = [
    'Send me a selfie making the funniest face you can.',
    'Do a silly dance for 20 seconds!',
    'Sing the chorus of your favorite song out loud!',
    'Send a love letter to a random Instagram follower.',
    'Take a goofy selfie right now!',
    'Text your crush and ask, “Will you marry me?”',
    'Make me your profile picture for a week. 😉',
    'Try to lick your elbow!',
    'Give your best royal wave for 10 seconds!',
    'Draw a beard on your face and take a selfie.'
  ];

  const SEGMENT = 36; // degrees per section (360 / 10)
  let currentAngle = 0;
  let spinning = false;

  spinBtn.addEventListener('click', () => {
    if (spinning) return;
    spinning = true;
    dareReveal.classList.remove('show');

    const sectionIndex = Math.floor(Math.random() * dares.length);
    const sectionCenter = sectionIndex * SEGMENT + SEGMENT / 2;
    const jitter = Math.random() * (SEGMENT - 6) - (SEGMENT - 6) / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full spins

    // Rotate so the chosen section's center lands under the fixed top pointer,
    // always spinning forward from wherever the wheel currently sits.
    const targetOffset = (360 - sectionCenter + jitter + 360) % 360;
    const previous = currentAngle;
    currentAngle = previous - (previous % 360) + extraSpins * 360 + targetOffset;
    if (currentAngle <= previous) currentAngle += 360;

    wheel.style.transform = `rotate(${currentAngle}deg)`;

    setTimeout(() => {
      spinning = false;
      dareText.textContent = dares[sectionIndex];
      dareReveal.classList.add('show');
    }, 4100);
  });
}

// ===================== Choose a Card / Truth Game =====================
function initTruthCardGame(){

  const cardGrid = document.getElementById('cardGrid');
  const cardSub = document.getElementById('cardSub');

  const cardRevealStage = document.getElementById('cardRevealStage');
  const truthCard = document.getElementById('truthCard');
  const truthCardInner = document.getElementById('truthCardInner');

  const truthCardNum = document.getElementById('truthCardNum');
  const truthCardFrontNum = document.getElementById('truthCardFrontNum');
  const truthCardQuestion = document.getElementById('truthCardQuestion');

  const truthAnswer = document.getElementById('truthAnswer');
  const truthAnswerInput = document.getElementById('truthAnswerInput');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');

  const truthDone = document.getElementById('truthDone');
  const anotherCardBtn = document.getElementById('anotherCardBtn');

  if (!cardGrid || !cardRevealStage || !truthCardInner) return;


  // =========================================================
  // GOOGLE SHEET LOGGING (optional)
  // Paste your Apps Script Web App URL below (ends in /exec) to have
  // every submitted answer saved to a Google Sheet automatically.
  // Leave it as-is to skip saving answers anywhere.
  // =========================================================

  const SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx8kupFF4a7AWlLHpaSSb5H8FmZvbdTHTL0vzulj7xIyUYC3JrYUTbDqJdBjafSpiAW/exec';

function sendAnswerToSheet(cardNumber, question, answer){
    if (!SHEET_WEBHOOK_URL || SHEET_WEBHOOK_URL.indexOf('PASTE_YOUR') !== -1) return;

    fetch(SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
            cardNumber: cardNumber,
            question: question,
            answer: answer
        })
    }).catch(() => {});
}

  // =========================================================
  // 20 TRUTH QUESTIONS
  // Edit these questions whenever you want.
  // =========================================================

  const truthQuestions = [

    "What is one thing you secretly wish you could tell me?",

    "What was your first impression of me?",

    "What is one memory of us that you will never forget?",

    "Have you ever smiled because of something I said or did?",

    "What is something about me that you genuinely like?",

    "Have you ever missed talking to me but didn't say it?",

    "What is one thing you think I understand about you better than most people?",

    "Have you ever thought about what our friendship might be like years from now?",

    "What is something you have wanted to ask me but never did?",

    "What is one moment with me that made you genuinely happy?",

    "Have you ever been nervous while talking to me?",

    "What is something you think I should never change about myself?",

    "Did you ever love me?",

    "What is one thing about me that surprised you?",

    "Have you ever wondered what I really think about you?",

    "What is something you would honestly miss if I disappeared from your life?",

    "What is one thing you think makes our connection different?",

    "Have you ever kept something from me because you were afraid of my reaction?",

    "If you could describe me in three honest words, what would they be?",

    "What is one truth about yourself that you think I should know?"
    
  ];


  // =========================================================
  // GAME STATE
  // =========================================================

  let currentCard = null;
  let cardLocked = false;

  const usedCards = new Set();


  // =========================================================
  // CREATE THE 20 FACE-DOWN MINI CARDS
  // =========================================================

  function createCards(){

    cardGrid.innerHTML = '';

    truthQuestions.forEach((question, index) => {

      const card = document.createElement('button');

      card.type = 'button';
      card.className = 'mini-card';

      card.dataset.cardNumber = index + 1;

      card.innerHTML = `
        <span class="mini-card-mark">${index + 1}</span>
      `;

      card.addEventListener('click', () => {

        if (cardLocked) return;

        if (usedCards.has(index)) return;

        selectCard(index, card);

      });

      cardGrid.appendChild(card);
    });
  }


  // =========================================================
  // SELECT A CARD
  // =========================================================

  function selectCard(index, miniCard){

    if (cardLocked) return;

    if (usedCards.has(index)) return;

    cardLocked = true;
    currentCard = index;

    // Mark selected card as used
    usedCards.add(index);
    miniCard.classList.add('used');

    // Dim the remaining cards while the question is being shown
    cardGrid.classList.add('picking');

    // Fill the large card
    const number = index + 1;

    truthCardNum.textContent = number;
    truthCardFrontNum.textContent = number;
    truthCardQuestion.textContent = truthQuestions[index];

    // Reset previous state
    truthCardInner.classList.remove('flipped');

    truthAnswer.classList.remove('show');
    truthDone.classList.remove('show');

    truthAnswerInput.value = '';

    submitAnswerBtn.disabled = false;
    submitAnswerBtn.style.opacity = '1';

    // Show the large card
    cardRevealStage.classList.add('show');

    // Allow the browser to render the back of the card first,
    // then perform the 3D flip.
    requestAnimationFrame(() => {

      setTimeout(() => {

        truthCardInner.classList.add('flipped');

      }, 120);

    });


    // Show answer box after card finishes rotating
    setTimeout(() => {

      truthAnswer.classList.add('show');

      truthAnswerInput.focus();

      cardLocked = false;

    }, 1050);

  }


  // =========================================================
  // SUBMIT ANSWER
  // =========================================================

  if (submitAnswerBtn){

    submitAnswerBtn.addEventListener('click', () => {

      const answer = truthAnswerInput.value.trim();

      // Don't allow an empty answer
      if (!answer){

        truthAnswerInput.focus();

        truthAnswerInput.style.borderColor = 'var(--wine-light)';

        setTimeout(() => {
          truthAnswerInput.style.borderColor = '';
        }, 700);

        return;
      }


      // Lock the answer
      truthAnswerInput.disabled = true;

      submitAnswerBtn.disabled = true;
      submitAnswerBtn.style.opacity = '0.55';

      truthAnswer.classList.remove('show');

      // Save to the Google Sheet (if configured above)
      sendAnswerToSheet(currentCard + 1, truthQuestions[currentCard], answer);

      // Show confirmation
      setTimeout(() => {

        truthDone.classList.add('show');

      }, 350);

    });

  }


  // =========================================================
  // PICK ANOTHER CARD
  // =========================================================

  if (anotherCardBtn){

    anotherCardBtn.addEventListener('click', () => {

      // Hide the revealed card
      truthDone.classList.remove('show');

      truthAnswer.classList.remove('show');

      truthCardInner.classList.remove('flipped');

      // Reset answer box
      truthAnswerInput.value = '';
      truthAnswerInput.disabled = false;

      submitAnswerBtn.disabled = false;
      submitAnswerBtn.style.opacity = '1';

      // Remove selected-card state
      cardGrid.classList.remove('picking');

      cardRevealStage.classList.remove('show');

      currentCard = null;

      cardLocked = false;


      // Update instruction text
      updateCardInstruction();

    });

  }


  // =========================================================
  // UPDATE CARD INSTRUCTION
  // =========================================================

  function updateCardInstruction(){

    const remaining = truthQuestions.length - usedCards.size;

    if (!cardSub) return;

    if (remaining === 0){

      cardSub.textContent = "All 20 truths have been answered ✨";

    }
    else if (remaining === 1){

      cardSub.textContent = "One last truth remains...";

    }
    else{

      cardSub.textContent =
        `Pick any card to reveal your question • ${remaining} cards left`;

    }

  }


  // =========================================================
  // INITIAL SETUP
  // =========================================================

  createCards();

  updateCardInstruction();

}
// ===================== Balloon Pop =====================
function initBalloonPop(){
  const stage = document.getElementById('balloonStage');
  const startBtn = document.getElementById('balloonStartBtn');
  const playAgainBtn = document.getElementById('balloonPlayAgainBtn');
  const scoreEl = document.getElementById('balloonScore');
  const timeEl = document.getElementById('balloonTime');
  const highScoreEl = document.getElementById('balloonHighScoreDisplay');
  const resultPanel = document.getElementById('balloonResult');
  const resultTitle = document.getElementById('balloonResultTitle');
  const finalScoreEl = document.getElementById('balloonFinalScore');
  const hintBox = document.getElementById('balloonHint');
  if (!stage || !startBtn) return;

  // ---- Edit these two to set your own hint & unlock score ----
  const HINT_THRESHOLD = 40;
  const HINT_TEXT = "My handwritten letter...those two line of numbers are not just a number...but it can be converted into texts...people used to decode it before smartphone arrived...oops! I said too much i guess...";
  // -------------------------------------------------------------

  const ROUND_SECONDS = 30;
  const HIGH_SCORE_KEY = 'nargisBalloonHighScore';

  const COLORS = [
    'radial-gradient(circle at 32% 26%, #ff90a0 0%, #c22a42 55%, #4a0e18 100%)',
    'radial-gradient(circle at 32% 26%, #f6e2ab 0%, #c9a15a 55%, #6e5527 100%)',
    'radial-gradient(circle at 32% 26%, #7fe3d1 0%, #1f7a68 55%, #0c332b 100%)',
    'radial-gradient(circle at 32% 26%, #e3aee6 0%, #7a2a6b 55%, #34112f 100%)',
    'radial-gradient(circle at 32% 26%, #fff9ec 0%, #cbbba0 55%, #7a6a52 100%)'
  ];
  const GOLDEN = 'radial-gradient(circle at 32% 26%, #fff6d0 0%, #ecd39a 45%, #c9a15a 80%, #8a6a35 100%)';

  let score = 0;
  let timeLeft = ROUND_SECONDS;
  let spawnTimer = null;
  let countdownTimer = null;
  let running = false;
  let hintShown = false;

  const savedHigh = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10);
if (highScoreEl) highScoreEl.textContent = savedHigh;

  function revealHint(){
    if (hintShown || !hintBox) return;
    hintShown = true;
    const hintTextEl = document.getElementById('balloonHintText');
    if (hintTextEl) hintTextEl.textContent = HINT_TEXT;
    hintBox.classList.add('show');
  }

  function clearBalloons(){
    stage.querySelectorAll('.balloon').forEach(b => b.remove());
    stage.querySelectorAll('.pop-plus').forEach(p => p.remove());
  }

  function spawnBalloon(){
    const el = document.createElement('div');
    el.className = 'balloon';
    const isGolden = Math.random() < 0.1;
    const size = 42 + Math.random() * 26;
    const left = 6 + Math.random() * 84;
    const duration = 4 + Math.random() * 2.6;
    const sway = Math.round(Math.random() * 60 - 30) + 'px';

    el.style.width = size + 'px';
    el.style.height = (size * 1.18) + 'px';
    el.style.left = left + '%';
    el.style.setProperty('--rise-duration', duration + 's');
    el.style.setProperty('--sway', sway);

    if (isGolden){
      el.classList.add('golden');
      el.style.background = GOLDEN;
      el.style.color = '#8a6a35';
      el.dataset.value = '5';
    } else {
      el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      el.style.color = 'rgba(0,0,0,0.4)';
      el.dataset.value = '1';
    }

    el.addEventListener('animationend', () => { if (!el.dataset.popped) el.remove(); });
    el.addEventListener('pointerdown', (e) => popBalloon(el, e));

    stage.appendChild(el);
  }

  function popBalloon(el){
    if (el.dataset.popped || !running) return;
    el.dataset.popped = 'true';

    const value = parseInt(el.dataset.value || '1', 10);
    const stageRect = stage.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const x = rect.left - stageRect.left + rect.width / 2;
    const y = rect.top - stageRect.top + rect.height / 2;

    el.style.animationPlayState = 'paused';
    el.style.transition = 'opacity 0.22s ease, filter 0.22s ease';
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      el.style.filter = 'brightness(1.7) blur(1px)';
    });

    spawnPopBurst(stage, x, y);
    showPlusFloat(stage, x, y, value);
    addScore(value);

    setTimeout(() => el.remove(), 240);
  }

  function showPlusFloat(container, x, y, value){
    const plus = document.createElement('span');
    plus.className = 'pop-plus';
    plus.textContent = '+' + value;
    plus.style.left = x + 'px';
    plus.style.top = y + 'px';
    container.appendChild(plus);
    setTimeout(() => plus.remove(), 750);
  }

  function addScore(value){
    score += value;
    if (scoreEl) scoreEl.textContent = score;
    if (score >= HINT_THRESHOLD) revealHint();
  }

  function tick(){
    timeLeft -= 1;
    if (timeEl) timeEl.textContent = Math.max(timeLeft, 0);
    if (timeLeft <= 0) endGame();
  }

  function scheduleSpawns(){
    if (!running) return;
    spawnBalloon();
    spawnTimer = setTimeout(scheduleSpawns, 500 + Math.random() * 450);
  }

  function startGame(){
    running = true;
    score = 0;
    timeLeft = ROUND_SECONDS;
    if (scoreEl) scoreEl.textContent = '0';
    if (timeEl) timeEl.textContent = ROUND_SECONDS;
    clearBalloons();
    if (resultPanel) resultPanel.classList.remove('show');
    startBtn.style.display = 'none';

    scheduleSpawns();
    countdownTimer = setInterval(tick, 1000);
  }

  function endGame(){
    running = false;
    clearTimeout(spawnTimer);
    clearInterval(countdownTimer);
    clearBalloons();

    const prevHigh = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10);
    const isNewHigh = score > prevHigh;
    if (isNewHigh){
      localStorage.setItem(HIGH_SCORE_KEY, String(score));
      if (highScoreEl) highScoreEl.textContent = score;
    }

    if (resultTitle) resultTitle.textContent = isNewHigh ? 'New High Score! 🌟' : "Time's up!";
    if (finalScoreEl) finalScoreEl.textContent = score;
    if (resultPanel) resultPanel.classList.add('show');
  }

  startBtn.addEventListener('click', startGame);
  if (playAgainBtn){
    playAgainBtn.addEventListener('click', () => {
      resultPanel.classList.remove('show');
      startGame();
    });
  }
}

function spawnPopBurst(container, x, y){
  const colors = ['#c9a15a', '#ecd39a', '#c22a42', '#1f7a68', '#f3e9d8'];
  for (let i = 0; i < 10; i++){
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = Math.random() * Math.PI * 2;
    const distance = 26 + Math.random() * 46;

    piece.style.left = x + 'px';
    piece.style.top = y + 'px';
    piece.style.setProperty('--cx', Math.cos(angle) * distance + 'px');
    piece.style.setProperty('--cy', Math.sin(angle) * distance + 'px');
    piece.style.setProperty('--crot', (Math.random() * 300 - 150) + 'deg');
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = '0.6s';
    piece.style.width = '6px';
    piece.style.height = '9px';

    container.appendChild(piece);
    setTimeout(() => piece.remove(), 700);
  }
}

// ===================== How Well You Know Me (quiz) =====================
function initKnowMeQuiz(){
  const quizCard = document.getElementById('quizCard');
  const questionEl = document.getElementById('quizQuestion');
  const optionsEl = document.getElementById('quizOptions');
  const progressEl = document.getElementById('quizProgress');
  const subEl = document.getElementById('quizSub');
  const unlockBox = document.getElementById('quizUnlock');
  const unlockBtn = document.getElementById('unlockSecretBtn');
  if (!quizCard || !questionEl || !optionsEl) return;

  // =========================================================
  // 17 QUESTIONS — edit the text, options, and `correct` index
  // (0 = first option, 1 = second, etc.) whenever you like.
  // =========================================================
  const questions = [
    { q: "What is my favorite color?", options: ["Blue", "Red", "Black", "White"], correct: 0 },
    { q: "What is my favorite food?", options: ["Pizza", "Biryani", "Pasta", "Sushi"], correct: 1 },
    { q: "Which one would I choose for a late-night conversation?", options: ["Random jokes", "Deep conversations", "Talking about movies", "Talking about studies"], correct: 1 },
    { q: "What season do I love the most?", options: ["Summer", "Monsoon", "Winter", "Spring"], correct: 2 },
    { q: "What would hurt me the most from someone important to me?", options: ["Ignoring me", "Lying to me", "Forgetting my birthday", "Not giving me a gift"], correct: 1 },
    { q: "What am I most likely to do when I miss someone?", options: ["Tell them directly", "Check their messages/profile", "Write something but never send it", "Pretend I don't miss them"], correct: 2 },
    { q: "What kind of movies do I enjoy the most?", options: ["Horror", "Romance", "Comedy", "Action"], correct: 0 },
    { q: "What is something I can never tolerate easily?", options: ["Being corrected", "Being ignored", "Losing a game", "Being alone"], correct: 1 },
    { q: "What would I do if someone remembered a tiny detail I told them months ago?", options: ["Think it's weird", "Be genuinely happy", "Ignore it", "Forget about it"], correct: 1 },
    { q: "What is one thing I would probably never tell you directly?", options: ["How much I care", "How much I love you", "How much I miss you", "All of these"], correct: 3 },
    { q: "If I had to choose between being remembered by everyone and being remembered by one special person, what would I choose?", options: ["Everyone", "One special person", "I wouldn't care", "Nobody"], correct: 1 },
    { q: "Which genre of music or artist do I listen to the most?", options: ["Pop / Top hits", "Rock / Alternative", "Hip-hop / Rap", "Classical / Lo-fi / Instrumental"], correct: 3 },
    { q: "What's my love language?", options: ["Roasting,nicknaming", "Words of affirmation", "Quality time", "Acts of service"], correct: 0 },
    { q: "What's something that instantly makes my day better?", options: ["Good food", "A funny meme", "A long call", "My message"], correct: 3 },
    { q: "If I could change one thing about myself, what would I most likely change?", options: ["My appearance", "My overthinking", "Nothing", "My personality"], correct: 1 },
    { q: "What do I do when I'm stressed?", options: ["Talk it out", "Go quiet", "Eat something", "Listen to music"], correct: 1 },
    { q: "What do you think I want people to remember about me?", options: ["That I was successful", "That I was funny", "That I genuinely cared about the people I loved", "That I achieved everything I wanted"], correct: 2 }
  ];

  const TOTAL = questions.length;

  let order = [];
  let index = 0;

  function shuffledIndexes(n){
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function shuffledOptions(opts, correctIdx){
    const paired = opts.map((text, i) => ({ text, correct: i === correctIdx }));
    for (let i = paired.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [paired[i], paired[j]] = [paired[j], paired[i]];
    }
    return paired;
  }

  function startRun(){
    order = shuffledIndexes(TOTAL);
    index = 0;
    quizCard.style.display = '';
    if (unlockBox) unlockBox.classList.remove('show');
    if (subEl) subEl.textContent = "Answer correctly to keep going — one wrong answer sends you back to the start.  Answer all to open a secret message.";
    renderQuestion();
  }

  function renderQuestion(){
    if (progressEl) progressEl.textContent = `Question ${index + 1} of ${TOTAL}`;

    const qData = questions[order[index]];
    questionEl.textContent = qData.q;
    optionsEl.innerHTML = '';

    const opts = shuffledOptions(qData.options, qData.correct);
    opts.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => handleAnswer(opt.correct));
      optionsEl.appendChild(btn);
    });

    quizCard.classList.remove('swap');
  }

  function handleAnswer(wasCorrect){
    // No per-click correctness feedback is shown — the flow itself
    // (next question, or restarting) is the only signal.
    if (wasCorrect){
      index++;
      if (index >= TOTAL){
        finishAllCorrect();
        return;
      }
      swapToNext();
    } else {
      restartRun();
    }
  }

  function swapToNext(){
    quizCard.classList.add('swap');
    setTimeout(renderQuestion, 260);
  }

  function restartRun(){
    quizCard.classList.add('swap');
    if (subEl) subEl.textContent = "Let's start over from the beginning...";
    setTimeout(() => {
      order = shuffledIndexes(TOTAL);
      index = 0;
      if (subEl) subEl.textContent = "Answer correctly to keep going — one wrong answer sends you back to the start.";
      renderQuestion();
    }, 700);
  }

  function finishAllCorrect(){
    quizCard.style.display = 'none';
    if (progressEl) progressEl.textContent = '';
    if (subEl) subEl.textContent = '';
    if (unlockBox) unlockBox.classList.add('show');
  }

  if (unlockBtn){
    unlockBtn.addEventListener('click', () => goToScreen('screen-secret-locked'));
  }

  startRun();
}

// ===================== Secret locked page =====================
function initSecretPage(){
  const passwordCard = document.getElementById('passwordCard');
  const passwordInput = document.getElementById('secretPasswordInput');
  const unlockBtn = document.getElementById('secretUnlockBtn');
  const errorEl = document.getElementById('passwordError');
  const secretContent = document.getElementById('secretContent');
  const secretMessageEl = document.getElementById('secretMessage');
  const downloadBtn = document.getElementById('secretDownloadBtn');
  if (!passwordCard || !unlockBtn) return;

  // ---- Edit these to set your own password & secret note ----
  const SECRET_PASSWORD = 'iknowhewasyourfirstloveiwanttobeyourlast';
  const SECRET_MESSAGE = `Hiii,Naaargis... Where do I start from? I don't know... I'm nervous...

At first, sorry for leaving you… Even without saying a thing….

I failed to arrange a conversation between you adn him...

I tried to find him everywhere on social media but couldn't find the right person...

I am a selfish person... I know...

Maybe deep down I didn't want to...

But when you love someone...You can't be selfish with them...Even when it hurts you to the core of your heart...

I don't know how to say the things that I wanted to tell...

This will probably be the first and last time that I'll be telling you this...

Let's start though...

I don't know when will you be reading this letter... I don't know what the date is today… Maybe it's been days, weeks, months or even years since I sent you this link on email...

I am not sure... But what I am do sure of is that I am still in love...

Yesss, I'm in love...

Whom do I love? For whom did I fall? I will tell you everything I can...

I don't know when it started...... But yeah it was long before my birthday....

I was in love with you...

If you ask me the reason then I will probably stay silent.... Because even I don't know...

Your texts, your snaps.... Your presence gave me peace....

You asked me if I was in love with you or not, twice or thrice... And I couldn't reply directly because I feared losing you....

Because if I answered correctly everything will change...and even if I don't then also....

so Everytime, i answered "hana" To anything, my actual answer was "haan"...

I feared what your reaction would be... And my overthinking problem is a major problem...

Days passed...the time your phone broke...

And when it was my birthday... I waited so badly for you to wish me... But I didn't tell you that it was my birthday....

For those 3-5 days... I couldn't do a thing... I waited and waited... I got ill...

And you came online on Instagram and told me that even you missed me...

And believe me I was so relieved of my pain like it didn't exist...

I thought I was so so special to you, I am such an idiot…

You still loved him… You never unloved him…

And then on Eid ul Zuha... I wanted to see you wearing the Eid outfit.....

And when you called me.... I saw you on the video call...

And my eyes just wanted to look at you as long as I can....

The way you were jingling the bangles by the gentle movement of your hand...And swaying Jhumka by your finger...

I couldn't help but gaze at you with love and admiration......

After sometimes, the things got difficult for me...

Your late replies, less attention made me overthink and afterwards it got more and more hard to survive the day...

Yet talking to you at any moment... used to change my mood totally....

People say confess before it's too late... But what's the point when you already know the answer…

This is why I never planned to tell you anything…

But I don't want my whole life to be an act of letting go...

For once I want to hold onto something and never have to let go...

I don't want you to be mine... I want you to be free and still choose to stay with me...

Kisi ko paane ke liye naseeb chahye.. Sirf mohabbat se kuch nahi hota...

Isliye main chala apna naseeb likhne... Sabse door…sabse hatke… online toh ab milunga nahi… main chala Allah se maangne…

I am not as good looking as him, not smart or handsome like him…

I am not perfect but for you I'll try...Because you are the only one that is worth trying for...

I hate giving up on people but I hate forcing things upon people more...

Yet no one can change my feelings for you not even you...

And you can never be unloved by me... for long as I exists…you will be loved...

I would rather spend every moment in agony than erase the memory of you…

And if you're wondering... Yesss… I still want to be with you…

I'm just here waiting... And not because I'm patient... But because you are worth waiting for...

And even if you don't come... I can,t live without the hope of your return...

I was born to love you like a poem... And here I'm forced to yearn for you like a poet...

My wait has just started... It's just the beginning...

It won't end until my death... I am waiting and I will wait...

It's a test for me and my Allah will have to provide result in favour of me...

So, I will wait for you...

And if you want to find me, I'll be waiting from 7-7:30 pm at the place where we first have a tea together...

If I'm in Khidderpore... I'll be there every Sunday....

If I'm near Kolkata then I'll be there for every 27th of the month....

And if I'm not in Kolkata then... I'll be there for every 27th august of every year...

Waiting for you...

I don't know what the future holds for us...

I don't know if you will ever love me or not...

But I request you, if there was even a single moment before that you think you like me or even if there is a single shred of love for me...

Then do come Nargis...

Without you my life...I…feel so empty....

Waiting has never been a trait of me...My Allah knows and my family knows that I have never been a patient guy…

I request you to give a chance on 'us'....

You will never be unloved by me as long as I live...

I know you love him... It's difficult for me to accept but I have accepted....

I know he was your first love. I want to be your last...

However long it takes.... I love you Nargis... Always and Forever...

You are by far the greatest thing that ever happened to me on my 22 years on this Earth.

Agar intezar karna hi ishq hain… toh phir aakhri saans bhi tumhare hawale...`;
  // -------------------------------------------------------------

  function checkPassword(){
    const entered = (passwordInput.value || '').trim().toUpperCase();
    if (entered === SECRET_PASSWORD.toUpperCase()){
      passwordCard.classList.add('hide');
      if (errorEl) errorEl.classList.remove('show');
      if (secretMessageEl) secretMessageEl.textContent = SECRET_MESSAGE;
      if (secretContent) secretContent.classList.add('show');
      prepareDownload();
    } else {
      if (errorEl) errorEl.classList.add('show');
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  function prepareDownload(){
    if (!downloadBtn) return;
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>A Secret Just For You</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0c0706;color:#f3e9d8;font-family:Georgia,serif;padding:2rem;text-align:center;}
.card{max-width:480px;padding:2.4rem;border:1px solid rgba(201,161,90,0.5);border-radius:10px;
background:linear-gradient(160deg, rgba(94,15,26,0.35), rgba(10,10,10,0.6));}
h1{color:#ecd39a;font-size:1.6rem;margin-bottom:1rem;}
p{line-height:1.7;font-style:italic;}
</style></head>
<body><div class="card"><h1>🔓 A Secret Just For You</h1><p>${SECRET_MESSAGE}</p></div></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    downloadBtn.href = url;
    downloadBtn.download = 'secret-message.html';
    downloadBtn.textContent = 'Download Secret Page ⬇';
  }

  unlockBtn.addEventListener('click', checkPassword);
  if (passwordInput){
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') checkPassword();
    });
  }
}

// ===================== Ending: One Last Wish → Goodbye → Credits =====================
function initEnding(){
  const startEndingBtn = document.getElementById('startEndingBtn');
  const finalWishBtn = document.getElementById('finalWishBtn');
  const endFlame1 = document.getElementById('endFlame1');
  const endFlame2 = document.getElementById('endFlame2');
  const endingHeader = document.getElementById('endingHeader');
  const endingCakeStage = document.getElementById('endingCakeStage');
  const wishLine1 = document.getElementById('wishLine1');
  const wishLine2 = document.getElementById('wishLine2');
  const goodbyeLetterNextBtn = document.getElementById('goodbyeLetterNextBtn');
  if (!startEndingBtn) return;

  startEndingBtn.addEventListener('click', () => goToScreen('screen-ending-candle'));

  // ---- Part 1: One Last Wish ----
  let wished = false;
  if (finalWishBtn){
    finalWishBtn.addEventListener('click', () => {
      if (wished) return;
      wished = true;

      if (endFlame1) endFlame1.classList.add('out');
      if (endFlame2) endFlame2.classList.add('out');
      playSfxElement('sfxFirecrackers');

      setTimeout(() => {
        if (endingHeader) endingHeader.classList.add('hide');
        if (endingCakeStage) endingCakeStage.classList.add('hide');
        finalWishBtn.classList.add('hide');
      }, 700);

      setTimeout(() => { if (wishLine1) wishLine1.classList.add('show'); }, 1500);
      setTimeout(() => { if (wishLine2) wishLine2.classList.add('show'); }, 3500);

      setTimeout(() => {
        goToScreen('screen-goodbye-intro');
        playGoodbyeIntro();
      }, 6500);
    });
  }

  // ---- Part 2: Before You Close This ----
  function playGoodbyeIntro(){
    const line1 = document.getElementById('goodbyeLine1');
    const line2 = document.getElementById('goodbyeLine2');
    if (line1) line1.classList.remove('show');
    if (line2) line2.classList.remove('show');

    setTimeout(() => { if (line1) line1.classList.add('show'); }, 300);
    setTimeout(() => { if (line2) line2.classList.add('show'); }, 2400);
    setTimeout(() => goToScreen('screen-goodbye-letter'), 5200);
  }

  // ---- Part 3: The Final Letter ----
  if (goodbyeLetterNextBtn){
    goodbyeLetterNextBtn.addEventListener('click', () => {
      goToScreen('screen-goodbye-outro');
      playGoodbyeOutro();
    });
  }

  // ---- Part 4: Thank You For Being a Chapter ----
  function playGoodbyeOutro(){
    const line3 = document.getElementById('goodbyeLine3');
    const line4 = document.getElementById('goodbyeLine4');
    const final = document.getElementById('goodbyeFinal');
    if (line3) line3.classList.remove('show');
    if (line4) line4.classList.remove('show');
    if (final) final.classList.remove('show');

    setTimeout(() => { if (line3) line3.classList.add('show'); }, 300);
    setTimeout(() => { if (line4) line4.classList.add('show'); }, 2800);
    setTimeout(() => { if (final) final.classList.add('show'); }, 4900);
    setTimeout(() => goToScreen('screen-credits'), 7600);
  }
}

// ===================== Screen navigation =====================
// Simple screen-switcher: every "screen" in the site is a <section class="screen">.
// Call goToScreen('screen-id') to move to it. We'll keep adding screens/logic here
// part by part as we build the rest of the flow.
function goToScreen(id){
  const current = document.querySelector('.screen.active');
  const next = document.getElementById(id);
  if (!next || next === current) return;

  if (current){
    current.classList.remove('active');
  }
  next.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

// ===================== Init =====================
document.addEventListener('DOMContentLoaded', () => {
  initSound();
  spawnParticles();

  const enterBtn = document.getElementById('enterBtn');
  if (enterBtn){
    enterBtn.addEventListener('click', () => {
      enterBtn.classList.add('pressed');
      setTimeout(() => {
        goToScreen('screen-envelope');
      }, 220);
    });
  }

  // ---- Envelope open ----
  const openEnvelopeBtn = document.getElementById('openEnvelopeBtn');
  const envelopeFlap = document.getElementById('envelopeFlap');
  const envelopePaper = document.getElementById('envelopePaper');

  if (openEnvelopeBtn){
    openEnvelopeBtn.addEventListener('click', () => {
      openEnvelopeBtn.disabled = true;
      envelopeFlap.classList.add('open');
      envelopePaper.classList.add('rise');

      setTimeout(() => {
        goToScreen('screen-letter');
      }, 1700);
    });
  }

  // ---- Letter next ----
  const letterNextBtn = document.getElementById('letterNextBtn');
  if (letterNextBtn){
    letterNextBtn.addEventListener('click', () => {
      goToScreen('screen-surprise');
    });
  }

  // ---- Surprise box ----
  initGiftBox();

  // ---- Second gift box ----
  initGiftBox2();

  // ---- Cake ----
  initCake();

  // ---- Video next ----
  const videoNextBtn = document.getElementById('videoNextBtn');
  if (videoNextBtn){
    videoNextBtn.addEventListener('click', () => goToScreen('screen-games-hub'));
  }

  // ---- Games hub ----
  initGamesHub();
  initSpinWheel();
  initTruthCardGame();
  initBalloonPop();
  initKnowMeQuiz();
  initSecretPage();

  // ---- Ending sequence ----
  initEnding();

});