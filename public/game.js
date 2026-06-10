let socket;
let scene, camera, renderer;
let localPlayer = { id: null, mesh: null, data: { x:0, y:1, z:0, ry:0, skin:'maguro' } };
let remotePlayers = {};
let input = { forward: false, backward: false, left: false, right: false };
let ammo = 30;
let maxAmmo = 30;
let isReloading = false;
let currentSkin = 'maguro';
let selectedMapName = 'Kyoto_Courtyard';
let bullets = [];

// DOM Bindings
document.getElementById('btn-play').addEventListener('click', initNetworkGame);
document.getElementById('btn-shop').addEventListener('click', () => toggleScreen('shop-menu', true));
document.getElementById('btn-shop-close').addEventListener('click', () => toggleScreen('shop-menu', false));

// Configure Skin Chooser
document.querySelectorAll('.shop-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.shop-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentSkin = item.getAttribute('data-skin');
    });
});

function toggleScreen(id, open) {
    document.getElementById(id).classList.toggle('hidden', !open);
}

// 1. Core Network Connections Initialization
function initNetworkGame() {
    const name = document.getElementById('username-input').value;
    selectedMapName = document.getElementById('map-select').value;
    
    toggleScreen('main-menu', false);
    document.getElementById('hud').classList.remove('hidden');

    // Self-hosting friendly dynamic connection address assignment
    socket = io();

    init3D();

    socket.emit('joinGame', { name: name, skin: currentSkin });

    socket.on('initGame', (data) => {
        localPlayer.id = data.id;
        buildMap(selectedMapName);
        
        // Spawn local player visual proxy asset
        localPlayer.mesh = createSushiMesh(currentSkin);
        scene.add(localPlayer.mesh);

        // Sync environmental status maps
        Object.keys(data.players).forEach(id => {
            if (id !== localPlayer.id) {
                spawnRemotePlayer(data.players[id]);
            }
        });
    });

    socket.on('playerJoined', (playerData) => { spawnRemotePlayer(playerData); });
    socket.on('playerMoved', (playerData) => { updateRemotePlayer(playerData); });
    socket.on('playerHit', (data) => { if(data.id === localPlayer.id) updateHealthHUD(data.hp); });
    socket.on('playerRespawn', (playerData) => {
        if(playerData.id === localPlayer.id) {
            localPlayer.mesh.position.set(playerData.x, playerData.y, playerData.z);
            updateHealthHUD(100);
        } else if(remotePlayers[playerData.id]) {
            remotePlayers[playerData.id].position.set(playerData.x, playerData.y, playerData.z);
        }
    });
    socket.on('bulletFired', (data) => { renderBulletEffect(data.origin, data.target); });
    socket.on('playerLeft', (id) => {
        if(remotePlayers[id]) {
            scene.remove(remotePlayers[id]);
            delete remotePlayers[id];
        }
    });

    window.addEventListener('keydown', (e) => handleInput(e, true));
    window.addEventListener('keyup', (e) => handleInput(e, false));
    window.addEventListener('mousemove', handleMouseLook);
    window.addEventListener('mousedown', (e) => { if(e.button === 0) fireWeapon(); });
}

// 2. Three.js Render Pipeline & Cartoon Procedural Geometry
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5dc); // Soft paper theme
    scene.fog = new THREE.FogExp2(0xf5f5dc, 0.015);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Dynamic Environment Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfffaed, 0.8);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    // Start Clock Tick Animation Loop
    animate();
}

// Cell-shaded stylized Cartoon Sushi Construction Pipeline
function createSushiMesh(type) {
    const sushiGroup = new THREE.Group();

    // 1. Shari (Rice Base Layer Mesh block)
    const riceGeo = new THREE.BoxGeometry(1.4, 0.7, 2.2);
    const riceMat = new THREE.MeshToonMaterial({ color: 0xfffffff });
    const rice = new THREE.Mesh(riceGeo, riceMat);
    rice.position.y = 0.35;
    sushiGroup.add(rice);

    // 2. Neta (Fish Topping Configurator parameters)
    let toppingColor = 0xe63946; // default tuna red
    if (type === 'sake') toppingColor = 0xf77f00;
    if (type === 'tamago') toppingColor = 0xfcbf49;

    const toppingGeo = new THREE.BoxGeometry(1.5, 0.3, 2.4);
    const toppingMat = new THREE.MeshToonMaterial({ color: toppingColor });
    const topping = new THREE.Mesh(toppingGeo, toppingMat);
    topping.position.y = 0.85;
    sushiGroup.add(topping);

    // 3. Nori Seaweed Belt structural binding layer wrap (For egg style variance)
    if(type === 'tamago') {
        const noriGeo = new THREE.BoxGeometry(1.6, 0.9, 0.5);
        const noriMat = new THREE.MeshToonMaterial({ color: 0x111111 });
        const nori = new THREE.Mesh(noriGeo, noriMat);
        nori.position.y = 0.45;
        sushiGroup.add(nori);
    }

    // Add visual outline container bounds mesh
    sushiGroup.castShadow = true;
    return sushiGroup;
}

// 3. Level Mapping Loading & Construction Engineering
function buildMap(mapName) {
    // Generate Floor Mat Base Grid
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshToonMaterial({ color: 0xd4a373 }); // Tatami base color tint
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Japanese Themed Geometry Obstacles Generation
    if(mapName === 'Kyoto_Courtyard') {
        // Build Procedural Torii Gates
        createPillar(0, 0, -15, 8, 2, 0xff4d4d); // Classic vermilion structural arches
        createPillar(-12, 0, 5, 4, 4, 0x4f5d75);
        createPillar(12, 0, 5, 4, 4, 0x4f5d75);
    } else {
        // Tokyo Neon Environment
        createPillar(-20, 0, -20, 15, 5, 0x00ffcc);
        createPillar(20, 0, 20, 15, 5, 0xff00ff);
    }
}

function createPillar(x, y, z, height, width, color) {
    const geo = new THREE.BoxGeometry(width, height, width);
    const mat = new THREE.MeshToonMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + height/2, z);
    scene.add(mesh);
}

// 4. Remote Multi-User Character Instantiations
function spawnRemotePlayer(data) {
    const mesh = createSushiMesh(data.skin);
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
    remotePlayers[data.id] = mesh;
}

function updateRemotePlayer(data) {
    if(remotePlayers[data.id]) {
        remotePlayers[data.id].position.set(data.x, data.y, data.z);
        remotePlayers[data.id].rotation.y = data.ry;
    }
}

// 5. Input Management Processing & Camera Mechanics Engine
function handleInput(event, isDown) {
    if (event.code === 'KeyW' || event.code === 'ArrowUp') input.forward = isDown;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') input.backward = isDown;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') input.left = isDown;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') input.right = isDown;
    if (event.code === 'KeyR' && isDown && !isReloading) reloadWeapon();
}

let rotationY = 0;
function handleMouseLook(e) {
    if (document.pointerLockElement === document.body) {
        rotationY -= e.movementX * 0.0025;
    }
}

// Request Pointer Lock for authentic controls scheme interface feel
document.body.addEventListener('click', () => {
    if(localPlayer.mesh && document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
    }
});

// 6. Projectile Weapon System and Reload Mechanics
function fireWeapon() {
    if (ammo <= 0 || isReloading || !localPlayer.mesh) return;

    ammo--;
    document.getElementById('ammo-current').innerText = ammo;

    // Direct Raycaster Calculation Vector setup
    const raycaster = new THREE.Raycaster();
    const centerPoint = new THREE.Vector2(0, 0); // Precise screen coordinate map point mid-point
    raycaster.setFromCamera(centerPoint, camera);

    // Convert Object values array into linear processing sequence
    const targets = Object.values(remotePlayers);
    const intersects = raycaster.intersectObjects(targets, true);

    let originPos = localPlayer.mesh.position.clone().add(new THREE.Vector3(0,0.8,0));
    let targetPos = raycaster.ray.direction.clone().multiplyScalar(50).add(originPos);

    if (intersects.length > 0) {
        targetPos = intersects[0].point;
        
        // Find which remote player was struck inside nested logic block container loop
        let hitId = null;
        for (let id in remotePlayers) {
            if (remotePlayers[id] === intersects[0].object || remotePlayers[id].getObjectById(intersects[0].object.id) || intersects[0].object.parent === remotePlayers[id]) {
                hitId = id;
                break;
            }
        }

        if(hitId) {
            socket.emit('hitPlayer', { targetId: hitId, damage: 25 });
        }
    }

    // Broadcast local shooting action
    socket.emit('playerShoot', { origin: originPos, target: targetPos });
    renderBulletEffect(originPos, targetPos);
}

function reloadWeapon() {
    isReloading = true;
    document.getElementById('reload-indicator').classList.remove('hidden');
    
    setTimeout(() => {
        ammo = maxAmmo;
        document.getElementById('ammo-current').innerText = ammo;
        document.getElementById('reload-indicator').classList.add('hidden');
        isReloading = false;
}, 1500); // 1.5 Second reload timing sequence speed window
}

function renderBulletEffect(start, end) {
    const material = new THREE.LineBasicMaterial({ color: 0xffcc00 });
    const points = [
        new THREE.Vector3(start.x, start.y, start.z), 
        new THREE.Vector3(end.x, end.y, end.z)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    
    scene.add(line);
    setTimeout(() => scene.remove(line), 60);
}

function updateHealthHUD(value) {
    // Wrapped in backticks to fix the template literal string syntax error
    document.getElementById('hp-fill').style.width = `${value}%`; 
}

// 7. Engine Main Render Dynamic Tick Frame Update
function animate() {
    requestAnimationFrame(animate);

    if (localPlayer.mesh) {
        const speed = 0.15;

        // Translate spatial transformations based on rotation values matrices math
        if (input.forward) {
            localPlayer.mesh.position.x -= Math.sin(rotationY) * speed;
            localPlayer.mesh.position.z -= Math.cos(rotationY) * speed;
        }
        if (input.backward) {
            localPlayer.mesh.position.x += Math.sin(rotationY) * speed;
            localPlayer.mesh.position.z += Math.cos(rotationY) * speed;
        }
        if (input.left) {
            localPlayer.mesh.position.x -= Math.cos(rotationY) * speed;
            localPlayer.mesh.position.z += Math.sin(rotationY) * speed;
        }
        if (input.right) {
            localPlayer.mesh.position.x += Math.cos(rotationY) * speed;
            localPlayer.mesh.position.z -= Math.cos(rotationY) * speed;
        }

        localPlayer.mesh.rotation.y = rotationY;

        // Smooth Camera follow rig system implementation configuration (Third-Person Offset Alignment)
        camera.position.x = localPlayer.mesh.position.x + Math.sin(rotationY) * 6;
        camera.position.z = localPlayer.mesh.position.z + Math.cos(rotationY) * 6;
        camera.position.y = localPlayer.mesh.position.y + 3.5;
        camera.lookAt(localPlayer.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));

        // Network Server Frame Position Synchronization Dispatcher
        socket.emit('playerMove', {
            x: localPlayer.mesh.position.x,
            y: localPlayer.mesh.position.y,
            z: localPlayer.mesh.position.z,
            ry: localPlayer.mesh.rotation.y
        });
    }

    renderer.render(scene, camera);
}
