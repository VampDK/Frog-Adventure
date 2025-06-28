// === CANVAS ===
const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 576;
c.imageSmoothingEnabled = false;

let startScreen = true;
let titleAlpha = 0;
let frogHop = false;
let frogY = canvas.height - 150;
let frogVY = 0;
//let bgMusic;

// === CONSTANTS ===
const gravity = 1.5;
const tileSize = 96;

// === PLATFORM TILE TYPES ===
const PLATFORM_TILES = {
  top: { sx: 100, sy: 5 },
  mid: { sx: 100, sy: 21 }
};

// === IMAGES ===
const tileset = new Image();
const bgTile = new Image();
const idleImg = new Image();
const runImg = new Image();
const jumpImg = new Image();
const fallImg = new Image();
const trophyImg = new Image();
const coinGoldImg = new Image();
const coinSilverImg = new Image();
const coinBronzeImg = new Image();
const elevatorImg = new Image();
const horizontalElevatorImg = new Image();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
  });
}

Promise.all([
  loadImage('./img/Terrain/Terrain (16x16).png'),
  loadImage('./img/bg/Blue.png'),
  loadImage('./img/Ninja Frog/Idle (32x32).png'),
  loadImage('./img/Ninja Frog/Run (32x32).png'),
  loadImage('./img/Ninja Frog/Jump (32x32).png'),
  loadImage('./img/Ninja Frog/Fall (32x32).png'),
  loadImage('./img/Items/Checkpoints/End/End (Idle).png'),
  loadImage('./img/Items/Fruits/Strawberry.png'),
  loadImage('./img/Items/Fruits/Apple.png'),
  loadImage('./img/Items/Fruits/Cherries.png'),
  loadImage('./img/Traps/Fan/On (24x8).png'),
  loadImage('./img/Traps/Platforms/Brown Off.png')
])
.then(([tilesetImg, bgImg, idle, run, jump, fall, trophy, coin, cherries, apple, elevator, horizontalElevator]) => {
  tileset.src = tilesetImg.src;
  bgTile.src = bgImg.src;
  idleImg.src = idle.src;
  runImg.src = run.src;
  jumpImg.src = jump.src;
  fallImg.src = fall.src;
  trophyImg.src = trophy.src;
  coinGoldImg.src = coin.src;
  coinSilverImg.src = cherries.src;
  coinBronzeImg.src = apple.src;
  elevatorImg.src = elevator.src;
  horizontalElevatorImg.src = horizontalElevator.src;

  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(bgTile, 0, 0, tileSize, tileSize);
  bgPattern = c.createPattern(patternCanvas, 'repeat');

  init();
  animate();
})
.catch(err => {
  alert('Image load failed: ' + err.message);
  console.error(err);
});

// === BACKGROUND PATTERN ===
let bgScrollX = 0;
let bgPattern;
const patternCanvas = document.createElement('canvas');
patternCanvas.width = tileSize;
patternCanvas.height = tileSize;
const pctx = patternCanvas.getContext('2d');

let player;
let platforms = [];
let coins = [];
let trophy;
let keys = {
  right: { pressed: false },
  left: { pressed: false }
};
let scrollOffset = 0;
let gameOver = false;
let gameWin = false;
let animationId;
let score = 0;
let elevators = [];
let fanFrame = 0;

class Player {
  constructor() {
    this.position = { x: 100, y: 100 };
    this.velocity = { x: 0, y: 0 };
    this.width = 64;
    this.height = 64;
    this.currentImage = idleImg;
    this.state = 'idle';
    this.frame = 0;
    this.frameDelay = 10;
    this.frameTimer = 0;
    this.frameCounts = { idle: 10, run: 12, jump: 1, fall: 1 };
    this.onGround = false;
    this.onElevator = false;
    this.elevatorRef = null;
  }

  updateState() {
    if (this.velocity.y < 0) this.state = 'jump';
    else if (this.velocity.y > 0) this.state = 'fall';
    else if (keys.left.pressed || keys.right.pressed) this.state = 'run';
    else this.state = 'idle';

    this.currentImage = {
      idle: idleImg,
      run: runImg,
      jump: jumpImg,
      fall: fallImg
    }[this.state];
  }

  draw() {
    this.updateState();
    this.frameTimer++;
    const frames = this.frameCounts[this.state];
    if (this.frameTimer >= this.frameDelay) {
      this.frame = (this.frame + 1) % frames;
      this.frameTimer = 0;
    }

    const spriteW = 32;
    const spriteH = 32;
    const sx = this.frame * spriteW;
    const sy = 0;

    c.drawImage(
      this.currentImage,
      sx, sy, spriteW, spriteH,
      this.position.x, this.position.y, this.width, this.height
    );
  }

  update() {
    this.draw();

    if (this.onElevator && this.elevatorRef) {
      if ('minY' in this.elevatorRef) {
        this.position.y = this.elevatorRef.renderPosition.y - this.height;
      }
      if ('minX' in this.elevatorRef) {
        this.position.x += this.elevatorRef.speed * this.elevatorRef.direction;
      }
    } else {
      this.position.y += this.velocity.y;
      if (this.position.y + this.height + this.velocity.y <= canvas.height) {
        this.velocity.y += gravity;
      }
    }

    this.position.x += this.velocity.x;

    if (this.position.y < 0) {
      this.position.y = 0;
      this.velocity.y = 0;
    }
  }
}

class Platform {
  constructor({ x, y, image, tileCount = 1, stack = 1 }) {
    this.position = { x, y };
    this.image = image;
    this.tileCount = tileCount;
    this.stack = stack;
  }

  draw() {
    const sourceTile = 16;
    for (let row = 0; row < this.stack; row++) {
      const tile = row === 0 ? PLATFORM_TILES.top : PLATFORM_TILES.mid;
      for (let i = 0; i < this.tileCount; i++) {
        c.drawImage(
          this.image, tile.sx, tile.sy,
          sourceTile, sourceTile,
          this.position.x + i * tileSize,
          this.position.y + row * tileSize,
          tileSize, tileSize
        );
      }
    }
  }
}

class Coin {
  constructor(x, y, type = 'gold') {
    this.position = { x, y };
    this.size = 64;
    this.collected = false;
    this.frame = 0;
    this.frameDelay = 10;
    this.frameTimer = 0;
    this.frameCount = 6;
    this.type = type;

    this.image = {
      gold: coinGoldImg,
      silver: coinSilverImg,
      bronze: coinBronzeImg
    }[type];

    this.points = {
      gold: 3,
      silver: 2,
      bronze: 1
    }[type];
  }

  draw() {
    if (!this.collected) {
      this.frameTimer++;
      if (this.frameTimer >= this.frameDelay) {
        this.frame = (this.frame + 1) % this.frameCount;
        this.frameTimer = 0;
      }

      const sx = this.frame * 32;
      const sy = 0;
      c.drawImage(this.image, sx, sy, 32, 32, this.position.x, this.position.y, this.size, this.size);
    }
  }
}

class Elevator {
  constructor({ x, y, minY, maxY, speed = 1 }) {
    this.worldPosition = { x, y };
    this.renderPosition = { x, y };
    this.minY = minY;
    this.maxY = maxY;
    this.speed = speed;
    this.direction = -1;
    this.width = 96;
    this.height = 32;
    this.image = elevatorImg;
  }

  update() {
    this.worldPosition.y += this.speed * this.direction;
    if (this.worldPosition.y <= this.minY || this.worldPosition.y >= this.maxY) {
      this.direction *= -1;
    }
    this.renderPosition.y = this.worldPosition.y;
    this.renderPosition.x = this.worldPosition.x - scrollOffset;
  }

  draw() {
    const frameX = fanFrame % 4 * 24;
    c.drawImage(this.image, frameX, 0, 24, 8, this.renderPosition.x, this.renderPosition.y, this.width, this.height);
  }
}

class HorizontalElevator {
  constructor({ x, y, minX, maxX, speed = 1 }) {
    this.worldPosition = { x, y };
    this.renderPosition = { x, y };
    this.minX = minX;
    this.maxX = maxX;
    this.speed = speed;
    this.direction = 1;
    this.width = 96;
    this.height = 32;
    this.image = horizontalElevatorImg;
    this.frame = 0;
    this.frameDelay = 10; // Increased delay to reduce animation speed and test blinking
    this.frameTimer = 0;
  }

  update() {
    this.worldPosition.x += this.speed * this.direction;
    if (this.worldPosition.x <= this.minX || this.worldPosition.x >= this.maxX) {
      this.direction *= -1;
    }
    this.renderPosition.x = this.worldPosition.x - scrollOffset;
    this.renderPosition.y = this.worldPosition.y;

    //this.frameTimer++;
    //if (this.frameTimer >= this.frameDelay) {
     // this.frame = (this.frame + 1) % 12; // Ensure 12 frames match the sprite sheet
      //this.frameTimer = 0;
    //}
  }

  draw() {
    const sx = 0;
    c.save(); // Save context state
    c.drawImage(this.image, sx, 0, 32, 8, this.renderPosition.x, this.renderPosition.y, this.width, this.height);
    c.restore(); // Restore context state to avoid state leakage
    console.log(`Drawing Horizontal Elevator: frame=${this.frame}, x=${this.renderPosition.x}, y=${this.renderPosition.y}`); // Debug log
  }
}

function init() {
  bgScrollX = 0;
  scrollOffset = 0;
  gameOver = false;
  gameWin = false;
  score = 0;

  player = new Player();
  trophy = { x: 5500, y: 250, width: 64, height: 64 };

  platforms = [
    new Platform({ x: -1, y: 480, image: tileset, tileCount: 5, stack: 2 }),
    new Platform({ x: 620, y: 480, image: tileset, tileCount: 4, stack: 2 }),
    new Platform({ x: 1100, y: 380, image: tileset, tileCount: 3, stack: 4 }),
    new Platform({ x: 1500, y: 380, image: tileset, tileCount: 4, stack: 3 }),
    new Platform({ x: 1900, y: 450, image: tileset, tileCount: 6, stack: 2 }),
    new Platform({ x: 2700, y: 250, image: tileset, tileCount: 1, stack: 5 }),
    new Platform({ x: 3000, y: 350, image: tileset, tileCount: 5, stack: 4 }),
    new Platform({ x: 4000, y: 250, image: tileset, tileCount: 1, stack: 5 }),
    new Platform({ x: 4202, y: 350, image: tileset, tileCount: 4, stack: 4 }),
    new Platform({ x: 5000, y: 400, image: tileset, tileCount: 6, stack: 4 }),
    //new Platform({ x: 5500, y: 300, image: tileset, tileCount: 3, stack: 4 })
  ];

  coins = [
    new Coin(650, 430, 'silver'),
    new Coin(700, 430, 'silver'),
    new Coin(1150, 330, 'bronze'),
    new Coin(1320, 250, 'silver'),
    new Coin(1540, 250, 'silver'),
    new Coin(1510, 250, 'bronze'),
    new Coin(1540, 200, 'gold'),
    new Coin(2450, 100, 'gold'),
    new Coin(2450, 150, 'gold'),
    new Coin(2450, 200, 'gold'),
    new Coin(2720, 200, 'silver'),
    new Coin(3000, 2000, 'bronze'),
    new Coin(3100, 200, 'gold'),
    new Coin(3500, 100, 'gold'),
    new Coin(3200, 250, 'bronze'),
    new Coin(3200, 200, 'gold'),
    new Coin(4000, 100, 'gold'),
    new Coin(4100, 100, 'silver'),
    new Coin(4100, 150, 'silver'),
    new Coin(4900, 150, 'gold'),
    new Coin(4868, 214, 'bronze'),
    new Coin(4900, 214, 'bronze'),
    new Coin(4932, 214, 'bronze'),
    new Coin(4884, 182, 'silver'),
    new Coin(4916, 182, 'silver'),
    new Coin(5200, 300, 'gold')
  ];

  elevators = [
    new Elevator({ x: 2500, y: 450, minY: 300, maxY: 450, speed: 1 }),
    new Elevator({ x: 2850, y: 450, minY: 300, maxY: 450, speed: 1 }),
    new Elevator({ x: 3600, y: 400, minY: 250, maxY: 400, speed: 1 }),
    new Elevator({ x: 3800, y: 400, minY: 250, maxY: 400, speed: 1 }),
    new HorizontalElevator({ x: 4670, y: 350, minX: 4600, maxX: 4900, speed: 1 })
  ];

  keys = { right: { pressed: false }, left: { pressed: false } };
}

function drawScore() {
  c.fillStyle = 'black';
  c.font = '20px Arial';
  c.textAlign = 'left';
  c.fillText(`Score: ${score}`, 30, 40);
}

function showGameOver() {
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = 'white';
  c.font = '48px sans-serif';
  c.textAlign = 'center';
  c.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
  c.fillText('Press R to Restart', canvas.width / 2, canvas.height / 2 + 60);
}

function showWin() {
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = 'yellow';
  c.font = '48px sans-serif';
  c.textAlign = 'center';
  c.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2);
  c.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 60);
}

function animate() {
 if (startScreen) {
  //hh
}

  if (gameOver || gameWin) return;
  animationId = requestAnimationFrame(animate);

  // Ensure canvas is cleared before drawing
  c.clearRect(0, 0, canvas.width, canvas.height);

  bgScrollX += 0.2;
  if (bgPattern) {
    c.save();
    c.translate(-bgScrollX, 0);
    c.fillStyle = bgPattern;
    c.fillRect(bgScrollX, 0, canvas.width + tileSize, canvas.height);
    c.restore();
  }

  platforms.forEach(p => p.draw());
  coins.forEach(cn => cn.draw());

  player.onGround = false;
  let onAnyElevator = false;

  platforms.forEach(p => {
    const isOnPlatform = (
      player.position.y + player.height <= p.position.y &&
      player.position.y + player.height + player.velocity.y >= p.position.y &&
      player.position.x + player.width >= p.position.x &&
      player.position.x <= p.position.x + p.tileCount * tileSize
    );
    if (isOnPlatform) {
      player.velocity.y = 0;
      player.onGround = true;
    }
  });

  elevators.forEach(elevator => {
    elevator.update();
    elevator.draw();

    const onElevator = (
      player.position.y + player.height <= elevator.renderPosition.y + 5 &&
      player.position.y + player.height + player.velocity.y >= elevator.renderPosition.y &&
      player.position.x + player.width > elevator.renderPosition.x &&
      player.position.x < elevator.renderPosition.x + elevator.width
    );

    if (onElevator) {
      player.onGround = true;
      player.onElevator = true;
      player.elevatorRef = elevator;
      onAnyElevator = true;
    }
  });

  if (!onAnyElevator) {
    player.onElevator = false;
    player.elevatorRef = null;
  }

  if (keys.right.pressed && player.position.x < 400) {
    player.velocity.x = 5;
  } else if (keys.left.pressed && player.position.x > 0) {
    player.velocity.x = -5;
  } else {
    player.velocity.x = 0;

    if (keys.right.pressed) {
      scrollOffset += 5;
      platforms.forEach(p => p.position.x -= 5);
      coins.forEach(c => c.position.x -= 5);
      trophy.x -= 5;
    } else if (keys.left.pressed && scrollOffset > 0) {
      scrollOffset -= 5;
      platforms.forEach(p => p.position.x += 5);
      coins.forEach(c => c.position.x += 5);
      trophy.x += 5;
    }
  }

  coins.forEach(c => {
    if (
      !c.collected &&
      player.position.x < c.position.x + c.size &&
      player.position.x + player.width > c.position.x &&
      player.position.y < c.position.y + c.size &&
      player.position.y + player.height > c.position.y
    ) {
      c.collected = true;
      score += c.points;
    }
  });

  if (
    player.position.x + player.width > trophy.x &&
    player.position.x < trophy.x + trophy.width &&
    player.position.y + player.height > trophy.y
  ) {
    gameWin = true;
    showWin();
  }

  player.update();
  fanFrame++;
  if (player.position.y > canvas.height + 50) {
     cancelAnimationFrame(animationId)
     gameOver = true
     showGameOver()
   }

  c.drawImage(trophyImg, trophy.x, trophy.y, 64, 64);
  drawScore();
}

addEventListener('keydown', e => {
  if (startScreen) {
    startScreen = false;
    frogHop = true;
    frogVY = -20;
    document.getElementById('startScreen').style.display = 'none'; // ✅ Hide HTML start screen
    return;
  }

  switch (e.key) {
    case 'a':
    case 'ArrowLeft':
      keys.left.pressed = true;
      break;
    case 'd':
    case 'ArrowRight':
      keys.right.pressed = true;
      break;
    case 'w':
    case 'ArrowUp':
      if (player.onGround) {
        player.velocity.y = -20;
        player.onGround = false;
      }
      break;
    case 'r':
      if (gameOver || gameWin) {
        init();
        animate();
      }
      break;
  }
});



addEventListener('keyup', e => {
  switch (e.key) {
    case 'a': case 'ArrowLeft': keys.left.pressed = false; break;
    case 'd': case 'ArrowRight': keys.right.pressed = false; break;
  }
});
function startGame() {
  startScreen = false;
  frogHop = true;
  frogVY = -20;
  document.getElementById('startScreen').style.display = 'none';
}
