// ============================================
// 심해 탐험 3D - Three.js 1인칭 시점 게임
// ============================================

let scene, camera, renderer, clock;
let controls = {};
let player = {
    position: new THREE.Vector3(0, -10, 0),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    depth: 0,
    oxygen: 100,
    light: 100,
    maxSpeed: 0.5
};

let game = {
    running: false,
    creatures: [],
    ruins: [],
    particles: [],
    discovered: new Set(),
    maxDepth: 0,
    lightOn: true,
    mouseX: 0,
    mouseY: 0,
    keys: {}
};

// 마우스 감도
const mouseSensitivity = 0.002;

// 깊이 존 정의
const ZONES = [
    { depth: 0, name: '표층 - Epipelagic Zone', color: 0x0a7bc4, fogNear: 50, fogFar: 300 },
    { depth: 200, name: '중층 - Mesopelagic Zone', color: 0x064273, fogNear: 30, fogFar: 150 },
    { depth: 1000, name: '심층 - Bathypelagic Zone', color: 0x031633, fogNear: 20, fogFar: 100 },
    { depth: 4000, name: '심해층 - Abyssopelagic Zone', color: 0x020a1a, fogNear: 10, fogFar: 50 },
    { depth: 6000, name: '초심해층 - Hadal Zone', color: 0x000508, fogNear: 5, fogFar: 30 }
];

// 생물 타입 정의
const CREATURE_TYPES = {
    fish: { minDepth: 0, maxDepth: 300, size: 1, color: 0xFFD700, speed: 2, name: '물고기', scary: false },
    jellyfish: { minDepth: 50, maxDepth: 400, size: 1.5, color: 0xFF69B4, speed: 0.5, name: '해파리', scary: false },
    squid: { minDepth: 300, maxDepth: 1500, size: 3, color: 0xFF4500, speed: 3, name: '오징어', scary: true },
    anglerfish: { minDepth: 1000, maxDepth: 4500, size: 3.5, color: 0x8B4513, speed: 1, name: '아귀', scary: true },
    viperfish: { minDepth: 1000, maxDepth: 4000, size: 2.5, color: 0x4B0082, speed: 3.5, name: '바이퍼피쉬', scary: true },
    giantisopod: { minDepth: 4000, maxDepth: 7000, size: 4, color: 0x696969, speed: 0.8, name: '대왕심해등각류', scary: true },
    vampiresquid: { minDepth: 4000, maxDepth: 6500, size: 5, color: 0x8B0000, speed: 2, name: '뱀파이어오징어', scary: true },
    serpent: { minDepth: 6000, maxDepth: 10000, size: 10, color: 0x000000, speed: 1.5, name: '심연의 뱀', scary: true },
    leviathan: { minDepth: 7000, maxDepth: 12000, size: 20, color: 0x0F0F0F, speed: 1, name: '리바이어던', scary: true },
    elderthing: { minDepth: 8000, maxDepth: 15000, size: 25, color: 0x1C1C1C, speed: 0.5, name: '고대의 존재', scary: true }
};

// ============================================
// 초기화
// ============================================

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(ZONES[0].color, ZONES[0].fogNear, ZONES[0].fogFar);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.copy(player.position);

    // Renderer
    const canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(ZONES[0].color);

    // Clock
    clock = new THREE.Clock();

    // 조명
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // 플레이어 조명 (손전등)
    player.spotlight = new THREE.SpotLight(0xffffee, 2, 50, Math.PI / 6, 0.5, 2);
    player.spotlight.position.copy(player.position);
    player.spotlight.target.position.set(0, -100, 0);
    scene.add(player.spotlight);
    scene.add(player.spotlight.target);

    // 해저면 (아주 깊은 곳)
    createSeaFloor();

    // 파티클 시스템 (해양 눈)
    createMarineSnow();

    // 이벤트 리스너
    window.addEventListener('resize', onWindowResize);

    console.log('3D 심해 탐험 게임 초기화 완료!');
}

// 해저면 생성
function createSeaFloor() {
    const geometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    const material = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9,
        metalness: 0.1
    });

    // 지형 높낮이 추가
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = Math.random() * 20 - 10; // Z축 (높이)
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -10000; // 매우 깊은 곳
    scene.add(floor);
}

// 해양 눈 파티클
function createMarineSnow() {
    const particleCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
        positions.push(
            (Math.random() - 0.5) * 200,
            Math.random() * 200 - 100,
            (Math.random() - 0.5) * 200
        );
        velocities.push(0, -0.02 - Math.random() * 0.02, 0);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        transparent: true,
        opacity: 0.6
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    game.marineSnow = particles;
}

// ============================================
// 생물 클래스
// ============================================

class Creature {
    constructor(type, depth) {
        this.type = type;
        this.data = CREATURE_TYPES[type];
        this.discovered = false;

        // 위치 및 이동
        this.position = new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            -depth + (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 100
        );
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * this.data.speed,
            (Math.random() - 0.5) * this.data.speed * 0.5,
            (Math.random() - 0.5) * this.data.speed
        );
        this.phase = Math.random() * Math.PI * 2;

        // 3D 모델 생성
        this.createModel();
    }

    createModel() {
        const group = new THREE.Group();

        if (this.data.name === '해파리') {
            // 해파리
            const bodyGeo = new THREE.SphereGeometry(this.data.size, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const bodyMat = new THREE.MeshPhongMaterial({
                color: this.data.color,
                transparent: true,
                opacity: 0.6,
                emissive: this.data.color,
                emissiveIntensity: 0.3
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            group.add(body);

            // 촉수들
            for (let i = 0; i < 8; i++) {
                const tentacleGeo = new THREE.CylinderGeometry(0.05, 0.02, this.data.size * 2, 4);
                const tentacle = new THREE.Mesh(tentacleGeo, bodyMat);
                const angle = (i / 8) * Math.PI * 2;
                tentacle.position.x = Math.cos(angle) * this.data.size * 0.5;
                tentacle.position.y = -this.data.size;
                tentacle.position.z = Math.sin(angle) * this.data.size * 0.5;
                group.add(tentacle);
            }
        } else if (this.data.scary && this.data.size > 8) {
            // 거대 생물 (리바이어던, 고대의 존재)
            const bodyGeo = new THREE.SphereGeometry(this.data.size, 32, 32);
            const bodyMat = new THREE.MeshPhongMaterial({
                color: this.data.color,
                emissive: 0x330000,
                emissiveIntensity: 0.5,
                shininess: 30
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            group.add(body);

            // 무시무시한 눈들
            const eyeGeo = new THREE.SphereGeometry(this.data.size * 0.1, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

            for (let i = 0; i < 6; i++) {
                const eye = new THREE.Mesh(eyeGeo, eyeMat);
                const angle = (i / 6) * Math.PI * 2;
                eye.position.x = Math.cos(angle) * this.data.size * 0.8;
                eye.position.y = Math.sin(angle) * this.data.size * 0.8;
                eye.position.z = this.data.size * 0.6;

                const light = new THREE.PointLight(0xff0000, 1, this.data.size * 2);
                light.position.copy(eye.position);
                group.add(light);
                group.add(eye);
            }

            // 촉수들
            for (let i = 0; i < 12; i++) {
                const tentacleGeo = new THREE.CylinderGeometry(this.data.size * 0.1, 0.05, this.data.size * 3, 8);
                const tentacleMat = new THREE.MeshPhongMaterial({ color: this.data.color });
                const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
                const angle = (i / 12) * Math.PI * 2;
                tentacle.position.x = Math.cos(angle) * this.data.size * 1.2;
                tentacle.position.z = Math.sin(angle) * this.data.size * 1.2;
                tentacle.position.y = -this.data.size * 1.5;
                group.add(tentacle);
            }
        } else if (this.data.name.includes('아귀') || this.data.name.includes('바이퍼')) {
            // 포식자
            const bodyGeo = new THREE.ConeGeometry(this.data.size, this.data.size * 2, 8);
            const bodyMat = new THREE.MeshPhongMaterial({ color: this.data.color });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.z = Math.PI / 2;
            group.add(body);

            // 발광 미끼
            if (this.data.name.includes('아귀')) {
                const lightGeo = new THREE.SphereGeometry(0.3, 8, 8);
                const lightMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                const lightBall = new THREE.Mesh(lightGeo, lightMat);
                lightBall.position.x = this.data.size * 1.5;
                lightBall.position.y = this.data.size * 0.5;

                const pointLight = new THREE.PointLight(0xffff00, 2, 10);
                pointLight.position.copy(lightBall.position);

                group.add(lightBall);
                group.add(pointLight);
            }

            // 날카로운 이빨
            const teethGeo = new THREE.ConeGeometry(0.1, 0.5, 4);
            const teethMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
            for (let i = 0; i < 20; i++) {
                const tooth = new THREE.Mesh(teethGeo, teethMat);
                tooth.position.x = this.data.size;
                tooth.position.y = (Math.random() - 0.5) * this.data.size;
                tooth.position.z = (Math.random() - 0.5) * this.data.size * 0.5;
                tooth.rotation.z = Math.PI / 2;
                group.add(tooth);
            }
        } else {
            // 일반 물고기
            const bodyGeo = new THREE.SphereGeometry(this.data.size, 8, 8);
            const bodyMat = new THREE.MeshPhongMaterial({
                color: this.data.color,
                emissive: this.data.color,
                emissiveIntensity: 0.2
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.scale.z = 1.5;
            group.add(body);

            // 꼬리
            const tailGeo = new THREE.ConeGeometry(this.data.size * 0.6, this.data.size, 4);
            const tail = new THREE.Mesh(tailGeo, bodyMat);
            tail.rotation.z = -Math.PI / 2;
            tail.position.x = -this.data.size * 1.2;
            group.add(tail);
        }

        group.position.copy(this.position);
        this.mesh = group;
        scene.add(this.mesh);
    }

    update(deltaTime) {
        this.phase += deltaTime;

        // 유영 움직임
        this.velocity.y += Math.sin(this.phase * 2) * 0.01;

        // 위치 업데이트
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        // 경계 체크 (플레이어 주변 순환)
        const dist = this.position.distanceTo(player.position);
        if (dist > 150) {
            // 플레이어 주변으로 재배치
            const angle = Math.random() * Math.PI * 2;
            const radius = 50 + Math.random() * 50;
            this.position.x = player.position.x + Math.cos(angle) * radius;
            this.position.z = player.position.z + Math.sin(angle) * radius;
            this.position.y = player.position.y + (Math.random() - 0.5) * 30;
        }

        // 거대 생물은 플레이어를 따라옴
        if (this.data.size > 8 && dist < 100) {
            const direction = player.position.clone().sub(this.position).normalize();
            this.velocity.add(direction.multiplyScalar(0.01));
        }

        // 속도 제한
        const speed = this.velocity.length();
        if (speed > this.data.speed) {
            this.velocity.normalize().multiplyScalar(this.data.speed);
        }

        // 메시 업데이트
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // 이동 방향을 바라봄
            this.mesh.lookAt(this.position.clone().add(this.velocity));

            // 약간의 흔들림
            this.mesh.rotation.z = Math.sin(this.phase * 3) * 0.1;
        }

        // 발견 체크
        if (!this.discovered && dist < 20) {
            this.discovered = true;
            game.discovered.add(this.type);
        }

        return dist < 200; // 너무 멀면 제거
    }

    destroy() {
        if (this.mesh) {
            scene.remove(this.mesh);
        }
    }
}

// ============================================
// 유적 클래스
// ============================================

class Ruin {
    constructor(depth) {
        this.position = new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            -depth + 10,
            (Math.random() - 0.5) * 100
        );

        this.createModel();
    }

    createModel() {
        const group = new THREE.Group();

        if (Math.random() < 0.5) {
            // 기둥
            const pillarGeo = new THREE.CylinderGeometry(2, 2.5, 20, 8);
            const pillarMat = new THREE.MeshPhongMaterial({
                color: 0x4a4a4a,
                emissive: 0x00ffff,
                emissiveIntensity: 0.2
            });
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            group.add(pillar);

            // 상단 장식
            const topGeo = new THREE.BoxGeometry(4, 2, 4);
            const top = new THREE.Mesh(topGeo, pillarMat);
            top.position.y = 11;
            group.add(top);
        } else {
            // 석상
            const baseGeo = new THREE.BoxGeometry(5, 3, 5);
            const headGeo = new THREE.SphereGeometry(2, 8, 8);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x4a4a4a,
                emissive: 0x00ffff,
                emissiveIntensity: 0.2
            });

            const base = new THREE.Mesh(baseGeo, mat);
            const head = new THREE.Mesh(headGeo, mat);
            head.position.y = 4;

            group.add(base);
            group.add(head);

            // 빛나는 눈
            const eyeGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
            const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
            const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
            eye1.position.set(-0.7, 4.5, 1.5);
            eye2.position.set(0.7, 4.5, 1.5);
            group.add(eye1);
            group.add(eye2);

            // 빛
            const light = new THREE.PointLight(0x00ffff, 2, 20);
            light.position.set(0, 5, 0);
            group.add(light);
        }

        group.position.copy(this.position);
        this.mesh = group;
        scene.add(this.mesh);
    }

    destroy() {
        if (this.mesh) {
            scene.remove(this.mesh);
        }
    }
}

// ============================================
// 생성 함수들
// ============================================

function spawnCreatures() {
    const depth = player.depth;

    for (const [type, data] of Object.entries(CREATURE_TYPES)) {
        if (depth >= data.minDepth - 50 && depth <= data.maxDepth + 50) {
            const count = game.creatures.filter(c => c.type === type).length;
            if (count < 2 && Math.random() < 0.01) {
                game.creatures.push(new Creature(type, depth));
            }
        }
    }
}

function spawnRuins() {
    if (player.depth > 5000 && game.ruins.length < 5 && Math.random() < 0.005) {
        game.ruins.push(new Ruin(player.depth));
    }
}

// ============================================
// 게임 업데이트
// ============================================

function updatePlayer(deltaTime) {
    const moveSpeed = player.maxSpeed;
    const moveVector = new THREE.Vector3();

    // WASD 이동
    if (game.keys['w'] || game.keys['W']) {
        moveVector.z -= moveSpeed;
    }
    if (game.keys['s'] || game.keys['S']) {
        moveVector.z += moveSpeed;
    }
    if (game.keys['a'] || game.keys['A']) {
        moveVector.x -= moveSpeed;
    }
    if (game.keys['d'] || game.keys['D']) {
        moveVector.x += moveSpeed;
    }

    // 상승/하강
    if (game.keys[' ']) { // Space
        moveVector.y += moveSpeed;
    }
    if (game.keys['Shift']) {
        moveVector.y -= moveSpeed;
    }

    // 카메라 방향으로 변환
    moveVector.applyEuler(camera.rotation);
    player.velocity.lerp(moveVector, 0.1);
    player.position.add(player.velocity.clone().multiplyScalar(deltaTime * 60));

    // 깊이 계산
    player.depth = Math.max(0, -player.position.y);
    game.maxDepth = Math.max(game.maxDepth, player.depth);

    // 수면으로 귀환 (ESC)
    if (game.keys['Escape']) {
        player.position.y = Math.min(-10, player.position.y + 1);
    }

    // 자원 소모
    if (player.depth > 0) {
        player.oxygen -= 0.01;
        if (game.lightOn) {
            player.light -= 0.05;
        }
    }

    // 수면에서 회복
    if (player.depth < 50) {
        player.oxygen = Math.min(100, player.oxygen + 0.5);
        player.light = Math.min(100, player.light + 0.3);
    }

    // 게임 오버
    if (player.oxygen <= 0) {
        gameOver('산소 부족!');
    }

    // 카메라 위치 업데이트
    camera.position.copy(player.position);

    // 조명 업데이트
    if (player.spotlight) {
        player.spotlight.position.copy(player.position);
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(camera.quaternion);
        player.spotlight.target.position.copy(player.position).add(direction.multiplyScalar(10));
        player.spotlight.intensity = game.lightOn && player.light > 0 ? 2 : 0;
    }
}

function updateEnvironment() {
    // 현재 존 찾기
    let currentZone = ZONES[0];
    for (const zone of ZONES) {
        if (player.depth >= zone.depth) currentZone = zone;
    }

    // 안개 및 배경색 업데이트
    scene.fog.color.setHex(currentZone.color);
    scene.fog.near = currentZone.fogNear;
    scene.fog.far = currentZone.fogFar;
    renderer.setClearColor(currentZone.color);

    // 주변광 조정 (깊을수록 어두워짐)
    const ambientIntensity = Math.max(0.1, 1 - player.depth / 5000);
    scene.children.forEach(child => {
        if (child instanceof THREE.AmbientLight) {
            child.intensity = ambientIntensity;
        }
    });
}

function updateMarineSnow(deltaTime) {
    if (!game.marineSnow) return;

    const positions = game.marineSnow.geometry.attributes.position.array;
    const velocities = game.marineSnow.geometry.attributes.velocity.array;

    for (let i = 0; i < positions.length; i += 3) {
        // 파티클을 플레이어 주변으로 유지
        positions[i] = (positions[i] - player.position.x) * 0.99 + player.position.x;
        positions[i + 1] += velocities[i + 1];
        positions[i + 2] = (positions[i + 2] - player.position.z) * 0.99 + player.position.z;

        // 아래로 떨어지면 위로 재생성
        if (positions[i + 1] < player.position.y - 100) {
            positions[i + 1] = player.position.y + 100;
        }
    }

    game.marineSnow.geometry.attributes.position.needsUpdate = true;

    // 깊이에 따라 파티클 보이기/숨기기
    game.marineSnow.visible = player.depth > 200;
}

function updateHUD() {
    document.getElementById('depth').textContent = Math.floor(player.depth) + 'm';
    document.getElementById('pressure').textContent = (1 + player.depth / 1000).toFixed(1) + ' atm';
    document.getElementById('oxygen-bar').style.width = player.oxygen + '%';
    document.getElementById('light-bar').style.width = player.light + '%';

    let currentZone = ZONES[0];
    for (const zone of ZONES) {
        if (player.depth >= zone.depth) currentZone = zone;
    }
    document.getElementById('zone-indicator').textContent = currentZone.name;
    document.getElementById('creature-count').textContent = game.discovered.size;
}

// ============================================
// 메인 게임 루프
// ============================================

function gameLoop() {
    if (!game.running) return;

    const deltaTime = clock.getDelta();

    // 업데이트
    updatePlayer(deltaTime);
    updateEnvironment();
    updateMarineSnow(deltaTime);

    // 생물 업데이트
    game.creatures = game.creatures.filter(creature => creature.update(deltaTime));

    // 생성
    spawnCreatures();
    spawnRuins();

    // HUD 업데이트
    updateHUD();

    // 렌더링
    renderer.render(scene, camera);

    requestAnimationFrame(gameLoop);
}

// ============================================
// 이벤트 핸들러
// ============================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    if (!game.running) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    camera.rotation.y -= movementX * mouseSensitivity;
    camera.rotation.x -= movementY * mouseSensitivity;

    // 상하 회전 제한
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    camera.rotation.z = 0; // 기울기 방지
}

function onKeyDown(event) {
    game.keys[event.key] = true;

    // 조명 토글
    if (event.key === 'l' || event.key === 'L') {
        game.lightOn = !game.lightOn;
    }
}

function onKeyUp(event) {
    game.keys[event.key] = false;
}

function onPointerLockChange() {
    if (document.pointerLockElement === renderer.domElement) {
        document.addEventListener('mousemove', onMouseMove);
    } else {
        document.removeEventListener('mousemove', onMouseMove);
    }
}

// ============================================
// 게임 시작/종료
// ============================================

function startGame() {
    document.getElementById('start-screen').classList.add('hidden');

    // Pointer Lock 요청
    renderer.domElement.requestPointerLock();

    game.running = true;
    player.position.set(0, -10, 0);
    player.velocity.set(0, 0, 0);
    player.oxygen = 100;
    player.light = 100;
    player.depth = 0;
    game.maxDepth = 0;
    game.discovered.clear();

    // 기존 생물/유적 제거
    game.creatures.forEach(c => c.destroy());
    game.ruins.forEach(r => r.destroy());
    game.creatures = [];
    game.ruins = [];

    camera.rotation.set(0, 0, 0);

    gameLoop();
}

function gameOver(reason) {
    game.running = false;
    document.exitPointerLock();
    document.getElementById('gameover-title').textContent = reason;
    document.getElementById('max-depth').textContent = Math.floor(game.maxDepth);
    document.getElementById('final-creature-count').textContent = game.discovered.size;
    document.getElementById('gameover-screen').classList.remove('hidden');
}

// ============================================
// 초기 설정
// ============================================

init();

// 이벤트 리스너 등록
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
document.addEventListener('pointerlockchange', onPointerLockChange);

document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('restart-button').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    startGame();
});

console.log('게임 준비 완료! 시작 버튼을 눌러주세요.');
