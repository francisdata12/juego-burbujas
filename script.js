const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();

window.addEventListener("resize", () => {
  resizeCanvas();
  if (bubbles.length > 0) initLevel();
});

let currentLevel = 1;
const MAX_LEVELS = 10;
let levelFailures = 0;

const SIZE_MAP = {
  S: { radius: 22, weight: 0.12 },
  M: { radius: 32, weight: 0.22 },
  L: { radius: 44, weight: 0.35 }
};

let bubbles = [];
let rings = [];
let particles = [];
let clearedInLevel = 0;
let audioContext, analyser, microphone;
let isTransitioning = false;
let uiTimeout = null;

let tiltGamma = 0; 

window.addEventListener("deviceorientation", (event) => {
  if (event.gamma !== null) {
    tiltGamma = Math.max(-45, Math.min(45, event.gamma));
  }
});

function triggerUINotice(duration = 2500) {
  const ui = document.getElementById("ui");
  ui.classList.add("show");

  if (uiTimeout) clearTimeout(uiTimeout);
  uiTimeout = setTimeout(() => {
    ui.classList.remove("show");
  }, duration);
}

class Ring {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = SIZE_MAP[type].radius + 12;
    this.isCleared = false;

    this.vx = (Math.random() - 0.5) * 1.8;
    this.vy = (Math.random() - 0.5) * 1.2;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    const margin = this.radius + 10;

    if (this.x - this.radius < margin || this.x + this.radius > canvas.width - margin) {
      this.vx *= -1;
    }
    if (this.y - this.radius < margin || this.y + this.radius > canvas.height * 0.6) {
      this.vy *= -1;
    }
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = this.isCleared ? "#00ff87" : "rgba(255, 215, 0, 0.85)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 3, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.stroke();

    ctx.restore();
  }
}

// FUNCIÓN DE CHOQUE Y REBOTE ENTRE AROS
function resolveRingCollisions() {
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const ringA = rings[i];
      const ringB = rings[j];

      const dx = ringB.x - ringA.x;
      const dy = ringB.y - ringA.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = ringA.radius + ringB.radius;

      // Si colisionan los dos aros
      if (distance < minDistance) {
        // 1. Separar aros para evitar solapamiento pegajoso
        const overlap = minDistance - distance;
        const nx = dx / (distance || 1);
        const ny = dy / (distance || 1);

        ringA.x -= nx * (overlap / 2);
        ringA.y -= ny * (overlap / 2);
        ringB.x += nx * (overlap / 2);
        ringB.y += ny * (overlap / 2);

        // 2. Invertir y repeler las velocidades
        const tempVx = ringA.vx;
        const tempVy = ringA.vy;

        ringA.vx = ringB.vx;
        ringA.vy = ringB.vy;

        ringB.vx = tempVx;
        ringB.vy = tempVy;
      }
    }
  }
}

class Bubble {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = SIZE_MAP[type].radius;
    this.weight = SIZE_MAP[type].weight;

    this.vx = 0;
    this.vy = 0;
    this.isPopped = false;
  }

  update(blowForce) {
    if (this.isPopped) return;

    const tiltForce = (tiltGamma / 45) * 0.4;
    this.vx += tiltForce;
    this.vy += 0.07;

    if (blowForce > 0.12) {
      this.vy -= (blowForce * 0.45) / (this.weight * 3);
    }

    this.vx *= 0.94;
    this.vy *= 0.97;

    this.x += this.vx;
    this.y += this.vy;

    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx *= -0.6;
    }
    if (this.x + this.radius > canvas.width) {
      this.x = canvas.width - this.radius;
      this.vx *= -0.6;
    }

    if (this.y + this.radius > canvas.height - 50) {
      this.y = canvas.height - 50 - this.radius;
      this.vy = -this.vy * 0.4;
    }

    if (this.y - this.radius <= 0) {
      this.isPopped = true;
      createBurstEffect(this.x, this.radius);
      handlePopOverblow();
    }
  }

  draw() {
    if (this.isPopped) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 230, 255, 0.35)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fill();

    ctx.restore();
  }
}

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 6;
    this.vy = (Math.random() - 0.5) * 6;
    this.radius = Math.random() * 3 + 1;
    this.alpha = 1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 0.03;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 100, 100, ${this.alpha})`;
    ctx.fill();
  }
}

function handlePopOverblow() {
  if (isTransitioning) return;
  isTransitioning = true;
  levelFailures++;

  if (levelFailures > 5) {
    triggerUINotice(3500);
    document.getElementById("level-display").innerText = "⚠️ ¡Demasiados tropiezos! Volviendo al Nivel 1...";
    setTimeout(() => {
      currentLevel = 1;
      levelFailures = 0;
      initLevel();
      isTransitioning = false;
    }, 1500);
    return;
  }

  triggerUINotice(3000);
  document.getElementById("level-display").innerText = `💥 ¡Soplo fuerte! (${levelFailures}/5 fallos)`;

  setTimeout(() => {
    initLevel();
    isTransitioning = false;
  }, 1200);
}

function initLevel() {
  bubbles = [];
  rings = [];
  particles = [];
  clearedInLevel = 0;

  const types = ["S", "M", "L"];

  for (let i = 0; i < currentLevel; i++) {
    const randomType = types[Math.floor(Math.random() * types.length)];
    const ringX = Math.random() * (canvas.width - 160) + 80;
    const ringY = Math.random() * (canvas.height * 0.45) + 80;

    rings.push(new Ring(ringX, ringY, randomType));

    const bubbleX = (canvas.width / (currentLevel + 1)) * (i + 1);
    const bubbleY = canvas.height - 90;
    bubbles.push(new Bubble(bubbleX, bubbleY, randomType));
  }

  updateUI();
  triggerUINotice(2500);
}

function updateUI() {
  document.body.className = `bg-${currentLevel}`;
  document.getElementById("level-display").innerText = `Nivel ${currentLevel} ⭐ (Fallos: ${levelFailures}/5)`;
  document.getElementById("cleared-count").innerText = clearedInLevel;
  document.getElementById("total-count").innerText = currentLevel;
}

document.getElementById("start-btn").addEventListener("click", async () => {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') {
        alert("Se requieren permisos de movimiento para mover la burbuja.");
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } 
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);

    document.getElementById("welcome-modal").style.display = "none";
    triggerUINotice(2500);
  } catch (err) {
    alert("Se requiere acceso al micrófono para jugar.");
  }
});

function detectBlowing() {
  if (!analyser) return 0;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  const startIndex = Math.floor(dataArray.length * 0.15);
  const endIndex = Math.floor(dataArray.length * 0.65);

  for (let i = startIndex; i < endIndex; i++) sum += dataArray[i];

  let average = sum / (endIndex - startIndex);
  let normalized = average / 255;

  const NOISE_THRESHOLD = 0.20;
  if (normalized < NOISE_THRESHOLD) return 0;

  return Math.min((normalized - NOISE_THRESHOLD) / (1 - NOISE_THRESHOLD) * 2.0, 1);
}

function createBurstEffect(x, y) {
  for (let i = 0; i < 25; i++) particles.push(new Particle(x, y));
}

function checkCollisions() {
  if (isTransitioning) return;

  for (let b = 0; b < bubbles.length; b++) {
    const bubble = bubbles[b];
    if (bubble.isPopped) continue;

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      if (ring.isCleared || ring.type !== bubble.type) continue;

      const dx = bubble.x - ring.x;
      const dy = bubble.y - ring.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < ring.radius - bubble.radius + 8) {
        bubble.isPopped = true;
        ring.isCleared = true;
        clearedInLevel++;
        createBurstEffect(ring.x, ring.y);
        updateUI();
        triggerUINotice(2000);

        if (clearedInLevel >= currentLevel) {
          isTransitioning = true;
          levelFailures = 0;
          setTimeout(() => {
            if (currentLevel === MAX_LEVELS) {
              alert("🏆 ¡IMPRESIONANTE! Has completado el juego maestro.");
              currentLevel = 1;
            } else {
              currentLevel++;
            }
            initLevel();
            isTransitioning = false;
          }, 600);
        }
      }
    }
  }
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const blowIntensity = detectBlowing();
  document.getElementById("blow-meter").style.width = `${blowIntensity * 100}%`;

  // Mover aros
  rings.forEach(ring => {
    ring.update();
  });

  // Resolver choques entre los aros para que se repelan
  resolveRingCollisions();

  // Dibujar aros actualizados
  rings.forEach(ring => {
    ring.draw();
  });

  bubbles.forEach(bubble => {
    bubble.update(blowIntensity);
    bubble.draw();
  });

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw();
    if (particles[i].alpha <= 0) particles.splice(i, 1);
  }

  checkCollisions();

  requestAnimationFrame(animate);
}

initLevel();
animate();