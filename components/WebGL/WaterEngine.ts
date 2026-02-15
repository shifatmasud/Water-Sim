/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { GPGPUWater } from './GPGPUWater.ts';
import { CausticsGenerator } from './CausticsGenerator.ts';
import { createTileTexture, createBubbleTexture, SKY_PRESETS } from './assets.ts';
import { waterVertexShader, waterFragmentShader } from './shaders.ts';

export class WaterEngine {
    container: HTMLElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    clock: THREE.Clock;
    
    // Components
    waterSim: GPGPUWater;
    caustics: CausticsGenerator;
    sky: Sky;
    sunLight: THREE.DirectionalLight;
    cubeCamera: THREE.CubeCamera;
    skyScene: THREE.Scene;
    
    // Objects
    sphere: THREE.Mesh;
    waterObj: THREE.Mesh;
    poolMesh: THREE.Mesh;
    bubbleParticles: THREE.Points;
    
    // Materials that need updates
    waterMaterial: THREE.ShaderMaterial;
    waterVolumeMaterial: THREE.MeshPhysicalMaterial;
    poolMaterial: THREE.MeshStandardMaterial;
    sphereMaterial: THREE.MeshStandardMaterial;
    
    // Shader Refs (injected via onBeforeCompile)
    poolShader: THREE.Shader | null = null;
    sphereShader: THREE.Shader | null = null;
    waterVolumeShader: THREE.Shader | null = null;

    // Interaction State
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    isDraggingSphere = false;
    dragPlane = new THREE.Plane();
    waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    lastWaterInteractionPoint: THREE.Vector2 | null = null;
    oldSpherePos = new THREE.Vector3();
    
    // Logic State
    isPaused = false;
    gravityEnabled = true;
    sphereRadius = 0.25;
    sphereVelocity = new THREE.Vector3();
    poolSize = 2.0;
    poolHeight = 1.0;
    bubblesData: Array<{ position: THREE.Vector3, velocity: number, wobbleSpeed: number, wobbleOffset: number }> = [];
    windStrength = 0.0005;
    interactionStrength = 0.03;
    waveSpeed = 1.0;
    accumulatedWaveTime = 0;
    
    animFrameId = 0;
    resizeObserver: ResizeObserver;

    constructor(container: HTMLElement) {
        this.container = container;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(1);
        this.renderer.localClippingEnabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(this.renderer.domElement);

        // Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x001122, 1, 15);
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
        this.camera.position.set(2.5, 2.5, 3.5);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0, 0);

        // Simulation
        this.waterSim = new GPGPUWater(this.renderer, 128);

        // Skybox
        this.sky = new Sky();
        this.sky.scale.setScalar(100.0);
        const cubeTarget = new THREE.WebGLCubeRenderTarget(256);
        this.cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeTarget);
        this.skyScene = new THREE.Scene();
        this.skyScene.add(this.sky);
        this.scene.background = cubeTarget.texture;

        // Light
        this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.scene.add(this.sunLight);

        // Geometry & Materials
        const tilesTexture = createTileTexture();
        const waterGeo = new THREE.PlaneGeometry(2, 2, 256, 256);
        this.caustics = new CausticsGenerator(waterGeo);
        
        const surfaceGeo = waterGeo.clone();
        surfaceGeo.rotateX(-Math.PI / 2);
        
        // --- Water Volume Geometry ---
        const volumeGeo = new THREE.BoxGeometry(this.poolSize - 0.004, this.poolHeight - 0.002, this.poolSize - 0.004);
        volumeGeo.translate(0, -this.poolHeight / 2, 0);
        
        const vIndices = volumeGeo.getIndex();
        if (vIndices) {
            const indices = vIndices.array;
            const pos = volumeGeo.attributes.position;
            const newIndices = [];
            for (let i = 0; i < indices.length; i += 3) {
                if (pos.getY(indices[i]) < -0.01 || pos.getY(indices[i+1]) < -0.01 || pos.getY(indices[i+2]) < -0.01) {
                    newIndices.push(indices[i], indices[i+1], indices[i+2]);
                }
            }
            volumeGeo.setIndex(newIndices);
        }
        
        const mergedGeo = mergeGeometries([surfaceGeo, volumeGeo]);
        mergedGeo.clearGroups();
        const idxCount = surfaceGeo.getIndex()!.count;
        mergedGeo.addGroup(0, idxCount, 0);
        mergedGeo.addGroup(idxCount, Infinity, 1);

        this.waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_waterTexture: { value: null },
                u_tiles: { value: tilesTexture },
                u_skybox: { value: cubeTarget.texture },
                u_lightDir: { value: new THREE.Vector3() },
                u_lightColor: { value: new THREE.Color(0xffffff) },
                u_specularIntensity: { value: 0.5 },
                u_sunShininess: { value: 30.0 },
                u_cameraPos: { value: this.camera.position },
                u_sphereCenter: { value: new THREE.Vector3() },
                u_sphereRadius: { value: this.sphereRadius },
                u_useCustomColor: { value: false },
                u_shallowColor: { value: new THREE.Color('#aaddff') },
                u_deepColor: { value: new THREE.Color('#005577') },
                u_waterIor: { value: 1.333 },
            },
            vertexShader: waterVertexShader,
            fragmentShader: waterFragmentShader,
            side: THREE.DoubleSide
        });

        this.waterVolumeMaterial = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color('#005577'),
            metalness: 0.0, roughness: 0.1, transmission: 1.0, thickness: 0.8, ior: 1.333,
            emissive: new THREE.Color('#005577').multiplyScalar(0.05), depthWrite: false
        });
        
        this.waterVolumeMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.u_lightDir = { value: this.sunLight.position };
            shader.uniforms.u_cameraPos = { value: this.camera.position };
            shader.uniforms.u_fogColor = { value: this.scene.fog!.color };
            
            shader.vertexShader = 'varying vec3 v_worldPos;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                '#include <project_vertex>\nv_worldPos = (modelMatrix * vec4(position, 1.0)).xyz;'
            );

            shader.fragmentShader = 'varying vec3 v_worldPos;\nuniform vec3 u_lightDir;\nuniform vec3 u_cameraPos;\nuniform vec3 u_fogColor;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                 vec3 viewDir = normalize(v_worldPos - u_cameraPos);
                 float scatter = pow(max(0.0, dot(viewDir, u_lightDir)), 5.0);
                 vec3 volumetricColor = u_fogColor * scatter * 0.3;
                 gl_FragColor.rgb += volumetricColor;
                `
            );
            this.waterVolumeShader = shader;
        };


        this.waterObj = new THREE.Mesh(mergedGeo, [this.waterMaterial, this.waterVolumeMaterial]);
        this.scene.add(this.waterObj);

        // --- Pool Geometry ---
        const poolGeo = new THREE.BoxGeometry(this.poolSize, this.poolHeight, this.poolSize);
        const pIndices = poolGeo.getIndex();
        if (pIndices) {
            const indices = pIndices.array;
            const pos = poolGeo.attributes.position;
            const newIndices = [];
            const topYThreshold = this.poolHeight / 2 - 0.01;
            for (let i = 0; i < indices.length; i += 3) {
                if (pos.getY(indices[i]) < topYThreshold || pos.getY(indices[i+1]) < topYThreshold || pos.getY(indices[i+2]) < topYThreshold) {
                    newIndices.push(indices[i], indices[i+1], indices[i+2]);
                }
            }
            poolGeo.setIndex(newIndices);
        }

        this.poolMaterial = new THREE.MeshStandardMaterial({
            map: tilesTexture, envMap: cubeTarget.texture, roughness: 0.1, metalness: 0.1, side: THREE.BackSide
        });
        this.setupPoolShader();
        this.poolMesh = new THREE.Mesh(poolGeo, this.poolMaterial);
        this.poolMesh.position.y = -this.poolHeight / 2;
        this.scene.add(this.poolMesh);

        // Sphere
        this.sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, envMap: cubeTarget.texture, roughness: 0.05, metalness: 0.95 });
        this.setupSphereShader();
        this.sphere = new THREE.Mesh(new THREE.SphereGeometry(this.sphereRadius, 32, 32), this.sphereMaterial);
        this.sphere.position.set(-0.3, -0.1, 0.3);
        this.oldSpherePos.copy(this.sphere.position);
        this.scene.add(this.sphere);

        // Bubbles
        const bubbleGeo = new THREE.BufferGeometry();
        const bubblePos = new Float32Array(200 * 3);
        for(let i=0; i<200; i++) {
            const x = (Math.random()-0.5)*(this.poolSize-0.1);
            const y = -this.poolHeight + Math.random()*this.poolHeight;
            const z = (Math.random()-0.5)*(this.poolSize-0.1);
            this.bubblesData.push({ position: new THREE.Vector3(x,y,z), velocity: 0.002+Math.random()*0.003, wobbleSpeed: Math.random()*0.5+0.5, wobbleOffset: Math.random()*Math.PI*2 });
            bubblePos[i*3] = x; bubblePos[i*3+1] = y; bubblePos[i*3+2] = z;
        }
        bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
        const bubbleMat = new THREE.PointsMaterial({ map: createBubbleTexture(), size: 0.04, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.8 });
        this.bubbleParticles = new THREE.Points(bubbleGeo, bubbleMat);
        this.scene.add(this.bubbleParticles);

        // Events
        this.container.addEventListener('pointerdown', this.onPointerDown);
        this.container.addEventListener('pointermove', this.onPointerMove);
        this.container.addEventListener('pointerleave', this.onPointerLeave);
        window.addEventListener('pointerup', this.onPointerUp);

        // Resize
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        // Start Loop
        this.clock = new THREE.Clock();
        this.animate();
    }

    private setupPoolShader() {
        this.poolMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.u_causticsTexture = { value: this.caustics.getTexture() };
            shader.uniforms.u_waterTexture = { value: this.waterSim.getTexture() };
            shader.uniforms.u_lightDir = { value: this.sunLight.position };
            shader.uniforms.u_sphereCenter = { value: new THREE.Vector3() };
            shader.uniforms.u_sphereRadius = { value: this.sphereRadius };
            shader.uniforms.u_waterIor = { value: 1.333 };
            shader.vertexShader = `varying vec3 v_worldPos;\n` + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\nv_worldPos = (modelMatrix * vec4(position, 1.0)).xyz;`);
            shader.fragmentShader = `uniform sampler2D u_causticsTexture; uniform sampler2D u_waterTexture; uniform vec3 u_lightDir; uniform vec3 u_sphereCenter; uniform float u_sphereRadius; uniform float u_waterIor; varying vec3 v_worldPos; const float IOR_AIR = 1.0;\n` + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\nvec3 toSphere = u_sphereCenter - v_worldPos; float t = dot(toSphere, u_lightDir); float shadow = 0.0; if (t > 0.0) { float distSq = dot(toSphere, toSphere) - t * t; float dist = sqrt(max(0.0, distSq)); shadow = smoothstep(u_sphereRadius * 1.5, u_sphereRadius * 0.5, dist); } vec2 waterUv = v_worldPos.xz * 0.5 + 0.5; waterUv.y = 1.0 - waterUv.y; float waterHeight = texture2D(u_waterTexture, waterUv).r; vec3 causticColor = vec3(0.0); if (v_worldPos.y < waterHeight) { vec3 refractedLight = refract(-u_lightDir, vec3(0.0, 1.0, 0.0), IOR_AIR / u_waterIor); vec2 causticsUv = v_worldPos.xz - v_worldPos.y * refractedLight.xz / refractedLight.y; causticsUv = causticsUv * 0.5 + 0.5; float caustics = texture2D(u_causticsTexture, causticsUv).r; causticColor = vec3(1.0) * caustics * 0.5; } gl_FragColor.rgb *= (1.0 - shadow * 0.5); gl_FragColor.rgb += causticColor * (1.0 - shadow);`);
            this.poolShader = shader;
        };
    }

    private setupSphereShader() {
        this.sphereMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.u_causticsTexture = { value: this.caustics.getTexture() };
            shader.uniforms.u_waterTexture = { value: this.waterSim.getTexture() };
            shader.uniforms.u_lightDir = { value: this.sunLight.position };
            shader.uniforms.u_waterIor = { value: 1.333 };
            shader.vertexShader = `varying vec3 v_worldPos;\n` + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\nv_worldPos = (modelMatrix * vec4(position, 1.0)).xyz;`);
            shader.fragmentShader = `uniform sampler2D u_causticsTexture; uniform sampler2D u_waterTexture; uniform vec3 u_lightDir; uniform float u_waterIor; varying vec3 v_worldPos; const float IOR_AIR = 1.0;\n` + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\nvec2 waterUv = v_worldPos.xz * 0.5 + 0.5; waterUv.y = 1.0 - waterUv.y; float waterHeight = texture2D(u_waterTexture, waterUv).r; if (v_worldPos.y < waterHeight) { vec3 refractedLight = refract(-u_lightDir, vec3(0.0, 1.0, 0.0), IOR_AIR / u_waterIor); vec2 causticsUv = v_worldPos.xz - v_worldPos.y * refractedLight.xz / refractedLight.y; causticsUv = causticsUv * 0.5 + 0.5; float caustics = texture2D(u_causticsTexture, causticsUv).r; gl_FragColor.rgb += vec3(1.0) * caustics * 0.5; }`);
            this.sphereShader = shader;
        };
    }

    private onPointerDown = (e: PointerEvent) => {
        this.updatePointer(e);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersects = this.raycaster.intersectObject(this.sphere);
        if (intersects.length > 0) {
            this.isDraggingSphere = true;
            this.controls.enabled = false;
            this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()).negate(), intersects[0].point);
        } else {
            const point = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.waterPlane, point);
            const uv = new THREE.Vector2(point.x/this.poolSize + 0.5, 0.5 - point.z/this.poolSize);
            if(uv.x>=0 && uv.x<=1 && uv.y>=0 && uv.y<=1) {
                this.controls.enabled = false;
                this.waterSim.addDrop(uv.x, uv.y, 0.03, this.interactionStrength);
            }
        }
    }

    private onPointerMove = (e: PointerEvent) => {
        this.updatePointer(e);
        this.raycaster.setFromCamera(this.pointer, this.camera);

        if (this.isDraggingSphere) {
            const point = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.dragPlane, point);
            this.sphere.position.copy(point);
            const limit = this.poolSize/2 - this.sphereRadius;
            this.sphere.position.clamp(new THREE.Vector3(-limit, -this.poolHeight+this.sphereRadius, -limit), new THREE.Vector3(limit, 0.5, limit));
            return;
        }

        if (this.raycaster.intersectObject(this.sphere).length > 0) {
            this.lastWaterInteractionPoint = null;
            return;
        }

        const point = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.waterPlane, point);
        const currentUv = new THREE.Vector2(point.x/this.poolSize + 0.5, 0.5 - point.z/this.poolSize);

        if (currentUv.x<0 || currentUv.x>1 || currentUv.y<0 || currentUv.y>1) {
            this.lastWaterInteractionPoint = null;
            return;
        }

        if (this.lastWaterInteractionPoint) {
            const dist = currentUv.distanceTo(this.lastWaterInteractionPoint);
            const strength = Math.min(this.interactionStrength, 0.01 + dist * this.interactionStrength * 8.0);
            const segments = Math.max(1, Math.ceil(dist / 0.015));
            for(let i=0; i<segments; i++) {
                const t = i/segments;
                const uv = this.lastWaterInteractionPoint.clone().lerp(currentUv, t);
                this.waterSim.addDrop(uv.x, uv.y, 0.02, strength);
            }
        }
        this.lastWaterInteractionPoint = currentUv;
    }

    private onPointerUp = () => { 
        this.isDraggingSphere = false; 
        this.controls.enabled = true;
        this.lastWaterInteractionPoint = null; 
    }
    
    private onPointerLeave = () => { 
        this.lastWaterInteractionPoint = null; 
        this.controls.enabled = true;
    }

    private updatePointer(e: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    setPaused(paused: boolean) { this.isPaused = paused; }
    setGravity(enabled: boolean) { this.gravityEnabled = enabled; }
    setLightPosition(pos: { x: number, y: number, z: number }) {
        this.sunLight.position.set(pos.x, pos.y, pos.z).normalize();
        this.sky.material.uniforms['sunPosition'].value.copy(this.sunLight.position);
        this.waterMaterial.uniforms.u_lightDir.value.copy(this.sunLight.position);
    }
    setSkyPreset(presetKey: string) {
        const p = SKY_PRESETS[presetKey as keyof typeof SKY_PRESETS] || SKY_PRESETS.default;
        this.sky.material.uniforms['turbidity'].value = p.turbidity;
        this.sky.material.uniforms['rayleigh'].value = p.rayleigh;
        this.sky.material.uniforms['mieCoefficient'].value = p.mieCoefficient;
        this.sky.material.uniforms['mieDirectionalG'].value = p.mieDirectionalG;
        if(presetKey === 'night') this.sunLight.color.set(0x88aaff);
        else this.sunLight.color.set(0xffffff);
        this.cubeCamera.update(this.renderer, this.skyScene);
        this.waterMaterial.uniforms.u_lightColor.value.copy(this.sunLight.color);
    }
    setLightIntensity(v: number) { this.sunLight.intensity = v; }
    setSpecularIntensity(v: number) { this.waterMaterial.uniforms.u_specularIntensity.value = v; }
    setDamping(v: number) { this.waterSim.setDamping(v); }
    setWindStrength(v: number) { this.windStrength = v; }
    setPhysicalConfig(roughness: number, metalness: number, ior: number) {
        this.waterVolumeMaterial.roughness = roughness;
        this.waterVolumeMaterial.metalness = metalness;
        this.waterVolumeMaterial.ior = ior;
        this.waterMaterial.uniforms.u_waterIor.value = ior;
        if(this.poolShader) this.poolShader.uniforms.u_waterIor.value = ior;
        if(this.sphereShader) this.sphereShader.uniforms.u_waterIor.value = ior;
    }
    setSunShininess(v: number) { this.waterMaterial.uniforms.u_sunShininess.value = v; }
    setInteractionStrength(v: number) { this.interactionStrength = v; }
    setWaveSpeed(v: number) { this.waveSpeed = v; }
    setBubbleConfig(size: number, opacity: number) {
        const mat = this.bubbleParticles.material as THREE.PointsMaterial;
        mat.size = size;
        mat.opacity = opacity;
        mat.needsUpdate = true;
    }
    setWaterConfig(useCustom: boolean, shallow: string, deep: string) {
        const deepColor = new THREE.Color(deep);
        const shallowColor = new THREE.Color(shallow);
        this.waterMaterial.uniforms.u_useCustomColor.value = useCustom;
        this.waterMaterial.uniforms.u_shallowColor.value.copy(shallowColor);
        this.waterMaterial.uniforms.u_deepColor.value.copy(deepColor);
        const volColor = deepColor.clone().lerp(shallowColor, 0.2);
        this.waterVolumeMaterial.color.copy(volColor);
        this.waterVolumeMaterial.emissive.copy(volColor).multiplyScalar(0.05);
        if(this.scene.fog) this.scene.fog.color.copy(volColor);
    }

    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate = () => {
        this.animFrameId = requestAnimationFrame(this.animate);
        this.controls.update();

        if (this.isPaused) return;

        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();
        this.accumulatedWaveTime += delta * this.waveSpeed;
        
        // Sphere physics
        if (!this.isDraggingSphere && this.gravityEnabled) {
            // Constants adjusted for "Intense fall, gentle float"
            const GRAVITY = -0.012; 
            const BUOYANCY_MAX = 0.024;
            const DRAG_AIR = 0.995;
            const DRAG_WATER = 0.90;

            // Apply Gravity
            this.sphereVelocity.y += GRAVITY;

            // Calculate Submerged Ratio
            const r = this.sphereRadius;
            const y = this.sphere.position.y;
            let submergedRatio = 0;

            if (y > r) {
                submergedRatio = 0;
            } else if (y < -r) {
                submergedRatio = 1;
            } else {
                submergedRatio = (r - y) / (2 * r);
                submergedRatio = THREE.MathUtils.clamp(submergedRatio, 0, 1);
            }

            // Apply Buoyancy
            if (submergedRatio > 0) {
                this.sphereVelocity.y += BUOYANCY_MAX * submergedRatio;
            }

            // Apply Drag
            const drag = THREE.MathUtils.lerp(DRAG_AIR, DRAG_WATER, submergedRatio);
            this.sphereVelocity.multiplyScalar(drag);

            // Integrate
            this.sphere.position.add(this.sphereVelocity);

            // Floor Collision
            const floorY = -this.poolHeight + this.sphereRadius;
            if (this.sphere.position.y < floorY) {
                this.sphere.position.y = floorY;
                if (this.sphereVelocity.y < 0) {
                    this.sphereVelocity.y *= -0.3; // Dampened floor bounce
                }
            }
        } else if (this.isDraggingSphere) {
            this.sphereVelocity.set(0, 0, 0); // Reset velocity when grabbed
        }

        // Wind & Simulation
        this.waterSim.addDrop( Math.sin(this.accumulatedWaveTime * 0.3 + 2) * 0.5 + 0.5, Math.cos(this.accumulatedWaveTime * 0.5 + 1) * 0.5 + 0.5, 0.05, this.windStrength);
        this.waterSim.addDrop( Math.sin(this.accumulatedWaveTime * 0.2 - 1) * 0.5 + 0.5, Math.cos(this.accumulatedWaveTime * 0.4 - 3) * 0.5 + 0.5, 0.08, -this.windStrength * 0.7);

        // Sphere Interaction
        if(this.oldSpherePos.distanceTo(this.sphere.position) > 0.001) {
            this.waterSim.moveSphere(
                new THREE.Vector3(this.oldSpherePos.x, this.oldSpherePos.y, -this.oldSpherePos.z),
                new THREE.Vector3(this.sphere.position.x, this.sphere.position.y, -this.sphere.position.z),
                this.sphereRadius
            );
            this.oldSpherePos.copy(this.sphere.position);
        }

        this.waterSim.step();
        this.waterSim.updateNormals();
        const texture = this.waterSim.getTexture();

        // Update Uniforms
        this.caustics.update(this.renderer, texture, this.sunLight.position);
        if(this.poolShader) {
            this.poolShader.uniforms.u_lightDir.value.copy(this.sunLight.position);
            this.poolShader.uniforms.u_waterTexture.value = texture;
            this.poolShader.uniforms.u_sphereCenter.value.copy(this.sphere.position);
        }
        if(this.sphereShader) {
            this.sphereShader.uniforms.u_lightDir.value.copy(this.sunLight.position);
            this.sphereShader.uniforms.u_waterTexture.value = texture;
        }
        if(this.waterVolumeShader) {
            this.waterVolumeShader.uniforms.u_cameraPos.value.copy(this.camera.position);
            this.waterVolumeShader.uniforms.u_lightDir.value.copy(this.sunLight.position);
        }

        // Bubbles
        const posAttr = this.bubbleParticles.geometry.attributes.position as THREE.BufferAttribute;
        this.bubblesData.forEach((b, i) => {
            b.position.y += b.velocity;
            b.position.x += Math.sin(time * b.wobbleSpeed + b.wobbleOffset) * 0.001;
            if(b.position.y > 0) {
                b.position.y = -this.poolHeight;
                b.position.x = (Math.random()-0.5)*(this.poolSize-0.1);
                b.position.z = (Math.random()-0.5)*(this.poolSize-0.1);
            }
            posAttr.setXYZ(i, b.position.x, b.position.y, b.position.z);
        });
        posAttr.needsUpdate = true;

        // Final Render
        this.waterMaterial.uniforms.u_waterTexture.value = texture;
        this.waterMaterial.uniforms.u_cameraPos.value.copy(this.camera.position);
        this.waterMaterial.uniforms.u_sphereCenter.value.copy(this.sphere.position);
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        cancelAnimationFrame(this.animFrameId);
        this.resizeObserver.disconnect();
        this.container.removeEventListener('pointerdown', this.onPointerDown);
        this.container.removeEventListener('pointermove', this.onPointerMove);
        this.container.removeEventListener('pointerleave', this.onPointerLeave);
        window.removeEventListener('pointerup', this.onPointerUp);
        
        this.waterSim.dispose();
        this.caustics.dispose();
        this.renderer.dispose();
        this.container.innerHTML = '';
    }
}
