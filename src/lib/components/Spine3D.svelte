<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

  let canvasContainer: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let animationFrameId: number;

  const vertebraeGroup = new THREE.Group();
  const interactableObjects: THREE.Mesh[] = [];

  // Hover state UI
  let hoveredInfo: { title: string; description: string; surgeries: string; x: number; y: number } | null = $state(null);
  
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredMesh: THREE.Mesh | null = null;
  
  // Premium Colors
  const boneColor = 0xeae6df; // off-white bone
  const discColor = 0x8ab4f8; // soft blue, gel-like
  const highlightColor = 0x3b82f6; // vibrant blue

  // Spine Anatomy Data
  const spineRegions = [
    { name: 'Cervical (Neck)', count: 7, prefix: 'C', radius: 0.6, height: 0.5, desc: 'Supports the head and allows for a wide range of motion.', surgeries: 'ACDF (Anterior Cervical Discectomy and Fusion), Cervical Disc Replacement' },
    { name: 'Thoracic (Mid Back)', count: 12, prefix: 'T', radius: 0.8, height: 0.6, desc: 'Connects to the rib cage, providing stability and protecting vital organs.', surgeries: 'Kyphoplasty, Spinal Deformity Correction (Scoliosis)' },
    { name: 'Lumbar (Lower Back)', count: 5, prefix: 'L', radius: 1.1, height: 0.8, desc: 'Bears the weight of the body. Most susceptible to strain and injury.', surgeries: 'Microdiscectomy, Lumbar Fusion, Laminectomy' },
    { name: 'Sacrum & Coccyx', count: 1, prefix: 'Sacrum', radius: 1.2, height: 1.5, desc: 'Forms the base of the spine and connects to the pelvis.', surgeries: 'Sacroiliac Joint Fusion' }
  ];

  onMount(() => {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.015); // light theme fog

    camera = new THREE.PerspectiveCamera(40, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    camera.position.set(15, 5, 45); // Moved back and slightly up to fit the whole spine & skull
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);

    // OrbitControls for manual interaction
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true; // Slowly rotate when idle
    controls.autoRotateSpeed = 0.5;
    controls.enablePan = false; // Disable panning so the spine stays centered
    controls.minDistance = 20;
    controls.maxDistance = 80;

    // Premium Lighting for Light Theme
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(10, 20, 15);
    mainLight.castShadow = true;
    // optimize shadow map
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0xa5b4fc, 0.6);
    rimLight.position.set(-15, 0, -15);
    scene.add(rimLight);

    // Build Highly Detailed Procedural Spine
    let currentY = 12; // Start from top
    let totalBones = 0;

    // Materials
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: boneColor,
      roughness: 0.4,
      metalness: 0.1,
    });
    
    // Create an optimized, stylized procedural skull
    const skullGroup = new THREE.Group();
    skullGroup.position.set(0, currentY + 3.0, Math.sin((currentY + 2) * 0.3) * 1.5);
    vertebraeGroup.add(skullGroup);

    // Apply a premium, stylized material matching the image aesthetic
    const premiumSkullMat = new THREE.MeshStandardMaterial({
        color: 0xbcbcbc, // darker stone grey matching image
        roughness: 0.65,
        metalness: 0.1,
    });
    
    // Dark void material for eye & nose sockets to create depth
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // 1. Cranium (Main Dome)
    const craniumGeo = new THREE.SphereGeometry(3.6, 32, 32);
    craniumGeo.scale(1, 1.15, 1.25);
    const cranium = new THREE.Mesh(craniumGeo, premiumSkullMat);
    cranium.position.set(0, 1.5, -0.5);
    cranium.castShadow = true;
    cranium.receiveShadow = true;
    skullGroup.add(cranium);

    // 2. Jaw/Lower Face (Angular)
    const jawGeo = new THREE.BoxGeometry(4.2, 3.5, 4);
    jawGeo.translate(0, -1.5, 1.2); 
    const jaw = new THREE.Mesh(jawGeo, premiumSkullMat);
    jaw.castShadow = true;
    jaw.receiveShadow = true;
    skullGroup.add(jaw);

    // 3. Eye Sockets (Dark indentations)
    const eyeGeo = new THREE.SphereGeometry(1.0, 16, 16);
    
    const leftEye = new THREE.Mesh(eyeGeo, voidMat);
    leftEye.position.set(1.4, 0.8, 2.9);
    leftEye.scale.set(1, 0.8, 0.5);
    skullGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeo, voidMat);
    rightEye.position.set(-1.4, 0.8, 2.9);
    rightEye.scale.set(1, 0.8, 0.5);
    skullGroup.add(rightEye);

    // 4. Nasal Cavity
    const noseGeo = new THREE.ConeGeometry(0.6, 1.8, 3);
    const nose = new THREE.Mesh(noseGeo, voidMat);
    nose.position.set(0, -0.5, 3.2);
    nose.rotation.x = -Math.PI / 6;
    skullGroup.add(nose);
    
    // 5. Stylized Cheekbones
    const cheekGeo = new THREE.CapsuleGeometry(0.5, 1.5, 8, 16);
    const leftCheek = new THREE.Mesh(cheekGeo, premiumSkullMat);
    leftCheek.position.set(2.2, -0.2, 2.5);
    leftCheek.rotation.z = Math.PI / 4;
    skullGroup.add(leftCheek);
    
    const rightCheek = new THREE.Mesh(cheekGeo, premiumSkullMat);
    rightCheek.position.set(-2.2, -0.2, 2.5);
    rightCheek.rotation.z = -Math.PI / 4;
    skullGroup.add(rightCheek);

    const skullData = {
        label: 'Skull',
        regionName: 'Cranium & Jaw',
        desc: 'Protects the brain and forms the structure of the face. Highly optimized stylized variant.',
        surgeries: 'Craniectomy, Craniotomy, Maxillofacial Surgery',
        originalColor: 0xbcbcbc
    };

    cranium.userData = skullData;
    jaw.userData = skullData;
    interactableObjects.push(cranium, jaw);
    
    const discMaterial = new THREE.MeshStandardMaterial({
      color: discColor,
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.8,
    });

    spineRegions.forEach((region, regionIndex) => {
      for (let i = 0; i < region.count; i++) {
        const index = i + 1;
        totalBones++;

        // Calculate Anatomical S-Curve
        // 0 to 1 along the spine
        const t = currentY / 24; 
        
        // Complex curve: Lordosis (C), Kyphosis (T), Lordosis (L)
        const curveZ = Math.sin(currentY * 0.3) * 1.5; 
        const curveX = 0;

        // Vertebra Body
        // slightly oval cylinder
        const geometry = new THREE.CylinderGeometry(region.radius, region.radius * 1.05, region.height, 32);
        const mesh = new THREE.Mesh(geometry, boneMaterial.clone());
        
        mesh.position.set(curveX, currentY, curveZ);
        
        // Rotate to match curve tangent
        const nextCurveZ = Math.sin((currentY - 0.5) * 0.3) * 1.5;
        mesh.rotation.x = Math.atan2(currentY - (currentY - 0.5), curveZ - nextCurveZ) - Math.PI/2;

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add metadata for interaction
        const label = region.count === 1 ? region.prefix : `${region.prefix}${index}`;
        mesh.userData = { 
          label,
          regionName: region.name,
          desc: region.desc,
          surgeries: region.surgeries,
          originalColor: boneColor
        };
        
        interactableObjects.push(mesh);
        vertebraeGroup.add(mesh);

        // Add Intervertebral Disc (unless it's the very last bone)
        if (!(regionIndex === spineRegions.length - 1 && i === region.count - 1)) {
          const discHeight = region.height * 0.25;
          currentY -= (region.height / 2 + discHeight / 2);
          
          const discGeo = new THREE.CylinderGeometry(region.radius * 0.95, region.radius * 0.95, discHeight, 32);
          const disc = new THREE.Mesh(discGeo, discMaterial);
          
          const dCurveZ = Math.sin(currentY * 0.3) * 1.5;
          disc.position.set(curveX, currentY, dCurveZ);
          disc.rotation.x = mesh.rotation.x; // approximate
          disc.castShadow = true;
          
          vertebraeGroup.add(disc);
          currentY -= (discHeight / 2 + region.height / 2);
        } else {
            currentY -= region.height;
        }
      }
    });

    scene.add(vertebraeGroup);

    // Perfectly Center the Camera on the Spine's Bounding Box
    const box = new THREE.Box3().setFromObject(vertebraeGroup);
    const center = box.getCenter(new THREE.Vector3());
    
    // Position camera dynamically based on model height
    controls.target.copy(center);
    camera.position.set(20, center.y + 5, 55); 
    camera.lookAt(center);
    controls.update();

    // Animation Loop
    let time = 0;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      time += 0.005;
      
      // Removed group position.y math so the centered bounding box doesn't drift
      
      controls.update(); // smoothly process damping & autoRotate

      // Update hovered info position if active
      if (hoveredMesh) {
          updateHoverPosition(hoveredMesh);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!canvasContainer) return;
      camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (controls) controls.dispose();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (renderer) {
        renderer.dispose();
        if (canvasContainer.contains(renderer.domElement)) {
            canvasContainer.removeChild(renderer.domElement);
        }
      }
    };
  });

  function updateHoverPosition(mesh: THREE.Mesh) {
      // Project 3D position to 2D screen coordinates
      const vector = new THREE.Vector3();
      mesh.getWorldPosition(vector);
      vector.project(camera);

      const rect = canvasContainer.getBoundingClientRect();
      const x = (vector.x * .5 + .5) * rect.width;
      const y = (vector.y * -.5 + .5) * rect.height;

      if (hoveredInfo) {
          hoveredInfo.x = x;
          hoveredInfo.y = y;
      }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!renderer) return;

    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects);

    if (hoveredMesh && (intersects.length === 0 || intersects[0].object !== hoveredMesh)) {
        // Unhover
        const mat = hoveredMesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(hoveredMesh.userData.originalColor);
        mat.emissive.setHex(0x000000);
        hoveredMesh.scale.set(1, 1, 1);
        hoveredMesh = null;
        hoveredInfo = null;
        canvasContainer.style.cursor = 'default';
    }

    if (intersects.length > 0 && intersects[0].object !== hoveredMesh) {
      // Hover new
      hoveredMesh = intersects[0].object as THREE.Mesh;
      
      const mat = hoveredMesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(highlightColor);
      mat.emissive.setHex(highlightColor);
      mat.emissiveIntensity = 0.4;
      hoveredMesh.scale.set(1.05, 1.05, 1.05); // slight bulge
      
      canvasContainer.style.cursor = 'pointer';

      // Show UI
      hoveredInfo = {
          title: `${hoveredMesh.userData.label} - ${hoveredMesh.userData.regionName}`,
          description: hoveredMesh.userData.desc,
          surgeries: hoveredMesh.userData.surgeries,
          x: 0,
          y: 0
      };
      updateHoverPosition(hoveredMesh);
    }
  }

  function handlePointerLeave() {
    if (hoveredMesh) {
      const mat = hoveredMesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(hoveredMesh.userData.originalColor);
      mat.emissive.setHex(0x000000);
      hoveredMesh.scale.set(1, 1, 1);
      hoveredMesh = null;
      hoveredInfo = null;
      canvasContainer.style.cursor = 'default';
    }
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
        canvasContainer.parentElement?.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  }

  function zoomIn() {
      if (!camera) return;
      const fov = camera.fov;
      camera.fov = Math.max(10, fov - 5);
      camera.updateProjectionMatrix();
  }

  function zoomOut() {
      if (!camera) return;
      const fov = camera.fov;
      camera.fov = Math.min(100, fov + 5);
      camera.updateProjectionMatrix();
  }

</script>

<div class="group relative w-full h-full bg-transparent overflow-hidden outline-none data-[fullscreen]:bg-slate-50">
    <!-- Overlay Grid pattern for professional look -->
    <div class="absolute inset-0 pointer-events-none opacity-20" style="background-image: radial-gradient(#64748b 1px, transparent 1px); background-size: 24px 24px;"></div>
    
    <!-- Fullscreen Toggle Button -->
    <button 
        onclick={toggleFullscreen}
        class="absolute top-6 right-6 z-30 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 backdrop-blur border border-slate-200 shadow-lg text-slate-800 hover:bg-slate-50 transition-all focus:outline-none"
        aria-label="Toggle Fullscreen"
        title="Toggle Fullscreen"
    >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        <span class="text-sm font-semibold tracking-wide">Fullscreen</span>
    </button>
    
    <!-- On-screen Zoom Controls -->
    <div class="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-30 bg-white/80 backdrop-blur-md border border-slate-200 p-1.5 rounded-xl shadow-lg">
        <button onclick={zoomIn} class="w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-slate-100 text-slate-700 transition" aria-label="Zoom In" title="Zoom In">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <div class="w-full h-[1px] bg-slate-200"></div>
        <button onclick={zoomOut} class="w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-slate-100 text-slate-700 transition" aria-label="Zoom Out" title="Zoom Out">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    </div>

    <div 
        bind:this={canvasContainer} 
        class="w-full h-full min-h-[600px] outline-none touch-none"
        role="img"
        aria-label="Interactive 3D model of the human spine"
        onpointermove={handlePointerMove}
        onpointerleave={handlePointerLeave}
    >
        <!-- Canvas injected here -->
    </div>

    <!-- Floating Info Card -->
    {#if hoveredInfo}
        <div 
            class="absolute pointer-events-none z-20 w-72 p-4 bg-white/90 backdrop-blur-md border border-white/40 shadow-2xl rounded-2xl transform -translate-y-1/2 transition-opacity duration-200"
            style="left: {hoveredInfo.x + 40}px; top: {hoveredInfo.y}px;"
        >
            <div class="flex items-center gap-2 mb-2">
                <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <h3 class="font-bold text-slate-800 text-sm tracking-wide">{hoveredInfo.title}</h3>
            </div>
            
            <p class="text-xs text-slate-600 mb-3 leading-relaxed">
                {hoveredInfo.description}
            </p>
            
            <div class="bg-primary/5 rounded-lg p-2.5 border border-primary/10">
                <p class="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Common Procedures</p>
                <p class="text-xs text-slate-700 font-medium">{hoveredInfo.surgeries}</p>
            </div>
        </div>
    {/if}
</div>
