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
  S: { radius: 24, weight: 0.05 },
  M: { radius: 34, weight: 0.07 },
  L: { radius: 46, weight: 0.09 }
};

let bubbles = [];
let rings = [];
let particles = [];
let clearedInLevel = 0;
let isTransitioning = false;
let uiTimeout = null;

let tiltGamma = 0; 

window.addEventListener("deviceorientation", (event) => {
  if (event.gamma !== null) {
    tiltGamma = Math.max(-45, Math.min(45, event.gamma));
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") tiltGamma = -30;
  if (event.key === "ArrowRight") tiltGamma = 30;
});
window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") tiltGamma = 0;
});

let touchStartPos = null;
let activeBubble = null;

function triggerUINotice(duration = 2500) {
  const ui = document.getElementById("ui");
  if (!ui) return;
  ui.classList.add("show");

  if (uiTimeout) clearTimeout(uiTimeout);
  uiTimeout = setTimeout(() => {
    ui.classList.remove("show");
  }, duration);
}

class Ring {
  constructor(x, y, type, requiredCount = 1) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = SIZE_MAP[type].radius + 14;
    this.requiredCount = requiredCount; // Cuántas burbujas de este tipo debe recibir
    this.currentCount = 0;              // Cuántas han entrado
    this.isCleared = false;

    const speedX = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 1.5 + 2.0);
    const speedY = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 1.2 + 1.5);
    this.vx = speedX;
    this.vy = speedY;
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

    // Cambia de color según el progreso del aro
    if (this.isCleared) {
      ctx.strokeStyle = "#00ff87"; // Verde completo
    } else if (this.currentCount > 0) {
      ctx.strokeStyle = "#00d2ff"; // Azul verdoso brillante (progreso parcial)
    } else {
      ctx.strokeStyle = "rgba(255, 215, 0, 0.85)"; // Dorado inicial
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 3, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.stroke();

    ctx.restore();
  }
}

function resolveRingCollisions() {
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const ringA = rings[i];
      const ringB = rings[j];

      const dx = ringB.x - ringA.x;
      const dy = ringB.y - ringA.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = ringA.radius + ringB.radius;

      if (distance < minDistance) {
        const overlap = minDistance - distance;
        const nx = dx / (distance || 1);
        const ny = dy / (distance || 1);

        ringA.x -= nx * (overlap / 2);
        ringA.y -= ny * (overlap / 2);
        ringB.x += nx * (overlap / 2);
        ringB.y += ny * (overlap / 2);

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

    this.vx = 0;
    this.vy = 0;
    this.isPopped = false;
  }

  update() {
    if (this.isPopped) return;

    const tiltForce = (tiltGamma / 45) * 0.15;
    this.vx += tiltForce;
    this.vy += 0.03; 

    this.vx *= 0.98;
    this.vy *= 0.98;

    this.x += this.vx;
    this.y += this.vy;

    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx *= -0.7;
    }
    if (this.x + this.radius > canvas.width) {
      this.x = canvas.width - this.radius;
      this.vx *= -0.7;
    }

    if (this.y + this.radius > canvas.height - 40) {
      this.y = canvas.height - 40 - this.radius;
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
    ctx.fillStyle = "rgba(180, 230, 255, 0.45)";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
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
    const lvlDisp = document.getElementById("level-display");
    if (lvlDisp) lvlDisp.innerText = "⚠️ ¡Demasiados tropiezos! Volviendo al Nivel 1...";
    setTimeout(() => {
      currentLevel = 1;
      levelFailures = 0;
      initLevel();
      isTransitioning = false;
    }, 1500);
    return;
  }

  triggerUINotice(3000);
  const lvlDisp = document.getElementById("level-display");
  if (lvlDisp) lvlDisp.innerText = `💥 ¡Tocó el techo! (${levelFailures}/5 fallos)`;

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
  const typeCounts = { S: 0, M: 0, L: 0 };

  // 1. Crear burbujas y contar cuántas hay de cada tamaño
  for (let i = 0; i < currentLevel; i++) {
    const randomType = types[Math.floor(Math.random() * types.length)];
    typeCounts[randomType]++;
    
    const bubbleX = (canvas.width / (currentLevel + 1)) * (i + 1);
    const bubbleY = canvas.height - 90;
    bubbles.push(new Bubble(bubbleX, bubbleY, randomType));
  }

  // 2. Crear aros asignando la capacidad necesaria según las burbujas activas
  const ringCount = currentLevel + 1;
  const activeTypes = Object.keys(typeCounts).filter(t => typeCounts[t] > 0);

  for (let i = 0; i < ringCount; i++) {
    // Garantizamos presencia de los tipos de burbujas en pantalla
    const ringType = activeTypes[i % activeTypes.length] || types[Math.floor(Math.random() * types.length)];
    const neededForThisType = typeCounts[ringType] || 1;

    const ringX = Math.random() * (canvas.width - 160) + 80;
    const ringY = Math.random() * (canvas.height * 0.45) + 80;

    rings.push(new Ring(ringX, ringY, ringType, neededForThisType));
  }

  updateUI();
  triggerUINotice(2500);
}

function updateUI() {
  document.body.className = `bg-${currentLevel}`;
  const lvlDisp = document.getElementById("level-display");
  if (lvlDisp) lvlDisp.innerText = `Nivel ${currentLevel} ⭐ (Fallos: ${levelFailures}/5)`;
  
  const clearedEl = document.getElementById("cleared-count");
  if (clearedEl) clearedEl.innerText = clearedInLevel;
  
  const totalEl = document.getElementById("total-count");
  if (totalEl) totalEl.innerText = currentLevel;
}

const startBtn = document.getElementById("start-btn");
if (startBtn) {
  startBtn.addEventListener("click", async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch (e) {}
    }
    const modal = document.getElementById("welcome-modal");
    if (modal) modal.style.display = "none";
    triggerUINotice(2500);
  });
}

function handleStart(x, y) {
  for (let b of bubbles) {
    if (b.isPopped) continue;
    const dist = Math.hypot(x - b.x, y - b.y);
    if (dist < b.radius + 20) {
      activeBubble = b;
      touchStartPos = { x, y, time: Date.now() };
      break;
    }
  }
}

function handleEnd(x, y) {
  if (!activeBubble || !touchStartPos) return;

  const dx = x - touchStartPos.x;
  const dy = y - touchStartPos.y;
  const dt = (Date.now() - touchStartPos.time) / 1000;

  if (dt > 0) {
    activeBubble.vx = (dx / dt) * 0.012;
    activeBubble.vy = (dy / dt) * 0.012;
  }

  activeBubble = null;
  touchStartPos = null;
}

canvas.addEventListener("touchstart", (e) => {
  const touch = e.touches[0];
  handleStart(touch.clientX, touch.clientY);
});

canvas.addEventListener("touchend", (e) => {
  const touch = e.changedTouches[0];
  handleEnd(touch.clientX, touch.clientY);
});

canvas.addEventListener("mousedown", (e) => {
  handleStart(e.clientX, e.clientY);
});

canvas.addEventListener("mouseup", (e) => {
  handleEnd(e.clientX, e.clientY);
});

function createBurstEffect(x, y) {
  for (let i = 0; i < 25; i++) particles.push(new Particle(x, y));
}

// LOGICA DE COLISION MULTI-BURBUJA
function checkCollisions() {
  if (isTransitioning) return;

  for (let b = 0; b < bubbles.length; b++) {
    const bubble = bubbles[b];
    if (bubble.isPopped) continue;

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      
      // Solo verificamos la coincidencia de tipo (S, M o L) y que el aro no haya alcanzado su tope máximo
      if (ring.isCleared || ring.type !== bubble.type) continue;

      const dx = bubble.x - ring.x;
      const dy = bubble.y - ring.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const captureTolerance = ring.radius * 0.8;

      if (distance < captureTolerance) {
        bubble.isPopped = true;
        ring.currentCount++;
        clearedInLevel++;

        // Si ya recibió la cantidad de burbujas requerida, el aro se completa totalmente
        if (ring.currentCount >= ring.requiredCount) {
          ring.isCleared = true;
        }

        createBurstEffect(ring.x, ring.y);
        updateUI();
        triggerUINotice(2000);

        if (clearedInLevel >= currentLevel) {
          isTransitioning = true;
          levelFailures = 0;
          setTimeout(() => {
            if (currentLevel === MAX_LEVELS) {
              alert("🏆 ¡IMPRESIONANTE! Has completado todos los niveles.");
              currentLevel = 1;
            } else {
              currentLevel++;
            }
            initLevel();
            isTransitioning = false;
          }, 600);
        }
        
        break; // La burbuja explotó, pasa a la siguiente
      }
    }
  }
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  rings.forEach(ring => {
    ring.update();
  });

  resolveRingCollisions();

  rings.forEach(ring => {
    ring.draw();
  });

  bubbles.forEach(bubble => {
    bubble.update();
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
