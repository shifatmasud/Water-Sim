

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useLayoutEffect, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CausticsGenerator } from './CausticsGenerator.tsx';

// --- Types ---

interface WebGLWaterProps {
  lightPosition: { x: number; y: number; z: number };
  skyPreset: string;
  lightIntensity: number;
  specularIntensity: number;
  useCustomWaterColor: boolean;
  waterColorShallow: string;
  waterColorDeep: string;
  // Granular controls
  simDamping: number;
  simWind: number;
  matRoughness: number;
  matMetalness: number;
  matIor: number;
  sunShininess: number;
  // FX controls
  interactionStrength: number;
  waveSpeed: number;
  bubbleSize: number;
  bubbleOpacity: number;
  sceneApiRef?: React.RefObject<any>;
}

// --- Shaders ---

const commonVertexShader = `
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const dropShaderFs = `
  const float PI = 3.141592653589793;
  uniform sampler2D u_texture;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_strength;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    float drop = max(0.0, 1.0 - length(u_center - v_uv) / u_radius);
    drop = 0.5 - cos(drop * PI) * 0.5;
    info.r += drop * u_strength;
    gl_FragColor = info;
  }
`;

const updateShaderFs = `
  uniform sampler2D u_texture;
  uniform vec2 u_delta;
  uniform float u_damping;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    vec2 dx = vec2(u_delta.x, 0.0);
    vec2 dy = vec2(0.0, u_delta.y);
    float average = (
      texture2D(u_texture, v_uv - dx).r +
      texture2D(u_texture, v_uv + dx).r +
      texture2D(u_texture, v_uv - dy).r +
      texture2D(u_texture, v_uv + dy).r
    ) * 0.25;
    info.g += (average - info.r) * 2.0;
    info.g *= u_damping;
    info.r += info.g;
    gl_FragColor = info;
  }
`;

const normalShaderFs = `
  uniform sampler2D u_texture;
  uniform vec2 u_delta;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    vec3 dx = vec3(u_delta.x, texture2D(u_texture, v_uv + vec2(u_delta.x, 0.0)).r - info.r, 0.0);
    vec3 dy = vec3(0.0, texture2D(u_texture, v_uv + vec2(0.0, u_delta.y)).r - info.r, u_delta.y);
    info.ba = normalize(cross(dy, dx)).xz;
    gl_FragColor = info;
  }
`;

const sphereShaderFs = `
  uniform sampler2D u_texture;
  uniform vec3 u_oldCenter;
  uniform vec3 u_newCenter;
  uniform float u_radius;
  varying vec2 v_uv;

  float volumeInSphere(vec3 center) {
    vec3 worldPos = vec3(v_uv.x * 2.0 - 1.0, 0.0, v_uv.y * 2.0 - 1.0);
    vec2 to_center_2d = worldPos.xz - center.xz;
    float t = length(to_center_2d) / u_radius;
    float dy = exp(-pow(t * 1.5, 6.0));
    float ymin = min(0.0, center.y - dy);
    float ymax = min(max(0.0, center.y + dy), ymin + 2.0 * dy);
    return (ymax - ymin) * 0.1;
  }

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    info.r += volumeInSphere(u_oldCenter);
    info.r -= volumeInSphere(u_newCenter);
    gl_FragColor = info;
  }
`;

const waterVertexShader = `
  uniform sampler2D u_waterTexture;
  uniform mat4 u_textureMatrix;
  varying vec2 v_uv;
  varying vec3 v_worldPos;
  varying vec4 v_reflectionUv;

  void main() {
    v_uv = uv;
    vec4 info = texture2D(u_waterTexture, uv);
    vec3 pos = position;
    float distToEdgeX = min(v_uv.x, 1.0 - v_uv.x);
    float distToEdgeY = min(v_uv.y, 1.0 - v_uv.y);
    float distToEdge = min(distToEdgeX, distToEdgeY);
    float falloff = smoothstep(0.0, 0.05, distToEdge);
    pos.y += info.r * falloff;
    v_worldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    v_reflectionUv = u_textureMatrix * vec4(v_worldPos, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(v_worldPos, 1.0);
  }
`;

const waterFragmentShader = `
  #include <packing>
  uniform sampler2D u_waterTexture;
  uniform sampler2D u_reflectionTexture;
  uniform sampler2D u_tiles;
  uniform samplerCube u_skybox;
  uniform vec3 u_lightDir;
  uniform vec3 u_lightColor;
  uniform float u_specularIntensity;
  uniform float u_sunShininess;
  uniform vec3 u_cameraPos;
  uniform vec3 u_sphereCenter;
  uniform float u_sphereRadius;
  uniform bool u_useCustomColor;
  uniform vec3 u_shallowColor;
  uniform vec3 u_deepColor;
  uniform float u_waterIor;

  varying vec2 v_uv;
  varying vec3 v_worldPos;
  varying vec4 v_reflectionUv;

  const float IOR_AIR = 1.0;
  const vec3 abovewaterColor = vec3(0.25, 1.0, 1.25);
  const float poolSize = 2.0;
  const float poolHeight = 1.0;

  vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {
    vec3 tMin = (cubeMin - origin) / ray;
    vec3 tMax = (cubeMax - origin) / ray;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
  }

  float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius) {
    vec3 toSphere = origin - sphereCenter;
    float a = dot(ray, ray);
    float b = 2.0 * dot(toSphere, ray);
    float c = dot(toSphere, toSphere) - sphereRadius * sphereRadius;
    float discriminant = b*b - 4.0*a*c;
    if (discriminant > 0.0) {
      float t = (-b - sqrt(discriminant)) / (2.0 * a);
      if (t > 0.0) return t;
    }
    return 1.0e6;
  }

  vec3 getSphereColor(vec3 point) {
    vec3 color = vec3(1.0);
    color *= 1.0 - 0.5 / pow((poolSize / 2.0 + u_sphereRadius - abs(point.x)) / u_sphereRadius, 3.0);
    color *= 1.0 - 0.5 / pow((poolSize / 2.0 + u_sphereRadius - abs(point.z)) / u_sphereRadius, 3.0);
    color *= 1.0 - 0.5 / pow((point.y + poolHeight + u_sphereRadius) / u_sphereRadius, 3.0);
    vec3 sphereNormal = normalize(point - u_sphereCenter);
    float diffuse = max(0.0, dot(u_lightDir, sphereNormal));
    color += u_lightColor * diffuse * 0.5;
    return color;
  }

  vec3 getWallColor(vec3 point) {
    vec3 wallColor;
    vec3 normal;
    if (point.y < -poolHeight + 0.001) {
        wallColor = texture2D(u_tiles, point.xz * 0.5 + 0.5).rgb;
        normal = vec3(0.0, 1.0, 0.0);
    } else if (abs(point.x) > (poolSize / 2.0) - 0.001) {
        wallColor = texture2D(u_tiles, point.yz * 0.5 + 0.5).rgb;
        normal = vec3(-sign(point.x), 0.0, 0.0);
    } else {
        wallColor = texture2D(u_tiles, point.zy * 0.5 + 0.5).rgb;
        normal = vec3(0.0, 0.0, -sign(point.z));
    }
    float diffuse = max(0.0, dot(u_lightDir, normal));
    float ambient = 0.4;
    return wallColor * (diffuse * 0.6 + ambient);
  }

  vec3 getRefractedColor(vec3 origin, vec3 ray, vec3 waterColor) {
    vec3 color;
    float sphere_t = intersectSphere(origin, ray, u_sphereCenter, u_sphereRadius);
    vec3 poolMin = vec3(-poolSize / 2.0, -poolHeight, -poolSize / 2.0);
    vec3 poolMax = vec3(poolSize / 2.0, 10.0, poolSize / 2.0);
    vec2 pool_ts = intersectCube(origin, ray, poolMin, poolMax);

    if (sphere_t < pool_ts.y) {
      color = getSphereColor(origin + ray * sphere_t);
    } else if (ray.y < 0.0) {
      color = getWallColor(origin + ray * pool_ts.y);
    } else {
      color = textureCube(u_skybox, ray).rgb;
    }
    if (ray.y < 0.0) color *= waterColor;
    return color;
  }

  void main() {
    vec2 coord = v_uv;
    vec4 info = texture2D(u_waterTexture, coord);
    for (int i = 0; i < 3; i++) {
        coord += info.ba * 0.003;
        info = texture2D(u_waterTexture, coord);
    }
    vec3 simNormal = normalize(vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a));
    vec3 worldNormal = normalize(vec3(simNormal.x, simNormal.y, -simNormal.z));
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    vec3 refractedRay = refract(-viewDir, worldNormal, IOR_AIR / u_waterIor);
    
    float F0 = pow((IOR_AIR - u_waterIor) / (IOR_AIR + u_waterIor), 2.0);
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(0.0, dot(worldNormal, viewDir)), 5.0);
    
    vec2 distortion = worldNormal.xz * 0.04;
    vec2 distortedUv = v_reflectionUv.xy / v_reflectionUv.w + distortion;
    vec3 reflectedColor = texture2D(u_reflectionTexture, distortedUv).rgb;
    
    vec3 waterTintColor = abovewaterColor;
    if (u_useCustomColor) {
      float mixFactor = smoothstep(-0.1, 0.1, v_worldPos.y);
      waterTintColor = mix(u_deepColor, u_shallowColor, mixFactor);
    }
    vec3 refractedColor = getRefractedColor(v_worldPos, refractedRay, waterTintColor);
    
    vec3 color = mix(refractedColor, reflectedColor, fresnel);

    // Specular Highlight (Blinn-Phong)
    vec3 halfVec = normalize(u_lightDir + viewDir);
    float specTerm = pow(max(0.0, dot(worldNormal, halfVec)), u_sunShininess);
    vec3 specular = u_lightColor * specTerm * u_specularIntensity;

    // Modulate specular by fresnel for a more realistic effect at grazing angles
    // and subtlety when viewed from above.
    color += specular * fresnel;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// --- Assets ---

const createTileTexture = () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const divisions = 4;
    const step = size / divisions;
    const grout = 2;
    ctx.fillStyle = '#b0c4de';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < divisions; y++) {
        for (let x = 0; x < divisions; x++) {
            ctx.fillStyle = '#d8e2f3'; 
            ctx.fillRect(x * step + grout, y * step + grout, step - grout * 2, step - grout * 2);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

const createBubbleTexture = () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
};

const SKY_PRESETS = {
  default: { turbidity: 10, rayleigh: 2, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  sunset: { turbidity: 20, rayleigh: 3, mieCoefficient: 0.002, mieDirectionalG: 0.95 },
  cloudy: { turbidity: 50, rayleigh: 10, mieCoefficient: 0.05, mieDirectionalG: 0.6 },
  night: { turbidity: 1, rayleigh: 0.1, mieCoefficient: 0.001, mieDirectionalG: 0.7 }
};

// --- GPGPU Water Simulation Class ---

class GPGPUWater {
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private mesh: THREE.Mesh;
    private targets: { read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget, swap: () => void };
    private renderer: THREE.WebGLRenderer;
    private dropMat: THREE.ShaderMaterial;
    private updateMat: THREE.ShaderMaterial;
    private normalMat: THREE.ShaderMaterial;
    private sphereMat: THREE.ShaderMaterial;

    constructor(renderer: THREE.WebGLRenderer, size = 128) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);
        
        this.targets = {
            read: new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType }),
            write: new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType }),
            swap: function() { const t = this.read; this.read = this.write; this.write = t; }
        };

        this.dropMat = new THREE.ShaderMaterial({
            uniforms: { u_texture: { value: null }, u_center: { value: new THREE.Vector2() }, u_radius: { value: 0.0 }, u_strength: { value: 0.0 } },
            vertexShader: commonVertexShader, fragmentShader: dropShaderFs
        });
        this.updateMat = new THREE.ShaderMaterial({
            uniforms: { 
                u_texture: { value: null }, 
                u_delta: { value: new THREE.Vector2(1/size, 1/size) },
                u_damping: { value: 0.995 }
            },
            vertexShader: commonVertexShader, fragmentShader: updateShaderFs
        });
        this.normalMat = new THREE.ShaderMaterial({
            uniforms: { u_texture: { value: null }, u_delta: { value: new THREE.Vector2(1/size, 1/size) } },
            vertexShader: commonVertexShader, fragmentShader: normalShaderFs
        });
        this.sphereMat = new THREE.ShaderMaterial({
            uniforms: { u_texture: { value: null }, u_oldCenter: { value: new THREE.Vector3() }, u_newCenter: { value: new THREE.Vector3() }, u_radius: { value: 0.0 } },
            vertexShader: commonVertexShader, fragmentShader: sphereShaderFs
        });

        this.mesh = new THREE.Mesh(geometry, this.updateMat);
        this.scene.add(this.mesh);
    }

    addDrop(x: number, y: number, radius: number, strength: number) {
        this.mesh.material = this.dropMat;
        this.dropMat.uniforms.u_center.value.set(x, y);
        this.dropMat.uniforms.u_radius.value = radius;
        this.dropMat.uniforms.u_strength.value = strength;
        this.dropMat.uniforms.u_texture.value = this.targets.read.texture;
        this.render();
    }

    moveSphere(oldCenter: THREE.Vector3, newCenter: THREE.Vector3, radius: number) {
        this.mesh.material = this.sphereMat;
        this.sphereMat.uniforms.u_oldCenter.value.copy(oldCenter);
        this.sphereMat.uniforms.u_newCenter.value.copy(newCenter);
        this.sphereMat.uniforms.u_radius.value = radius;
        this.sphereMat.uniforms.u_texture.value = this.targets.read.texture;
        this.render();
    }

    step() {
        this.mesh.material = this.updateMat;
        this.updateMat.uniforms.u_texture.value = this.targets.read.texture;
        this.render();
    }

    setDamping(damping: number) {
        this.updateMat.uniforms.u_damping.value = damping;
    }

    updateNormals() {
        this.mesh.material = this.normalMat;
        this.normalMat.uniforms.u_texture.value = this.targets.read.texture;
        this.render();
    }

    private render() {
        this.renderer.setRenderTarget(this.targets.write);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.targets.swap();
    }

    getTexture() { return this.targets.read.texture; }
    dispose() {
        this.targets.read.dispose();
        this.targets.write.dispose();
        this.mesh.geometry.dispose();
        this.dropMat.dispose();
        this.updateMat.dispose();
        this.normalMat.dispose();
        this.sphereMat.dispose();
    }
}

// --- Real-time Engine Class ---

class WaterEngine {
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

    // Interaction State
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    isDraggingSphere = false;
    dragPlane = new THREE.Plane();
    waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    lastWaterInteractionPoint: THREE.Vector2 | null = null;
    oldSpherePos = new THREE.Vector3();
    
    // Logic State
    sphereRadius = 0.25;
    poolSize = 2.0;
    poolHeight = 1.0;
    bubblesData: Array<{ position: THREE.Vector3, velocity: number, wobbleSpeed: number, wobbleOffset: number }> = [];
    windStrength = 0.0005;
    interactionStrength = 0.03;
    waveSpeed = 1.0;
    accumulatedWaveTime = 0;
    
    // Reflection
    reflector: THREE.PerspectiveCamera;
    reflectionTarget: THREE.WebGLRenderTarget;
    reflectorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    textureMatrix = new THREE.Matrix4();
    
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

        // Reflection
        this.reflectionTarget = new THREE.WebGLRenderTarget(256, 256, { format: THREE.RGBAFormat, type: THREE.HalfFloatType });
        this.reflector = new THREE.PerspectiveCamera();

        // Geometry & Materials
        const tilesTexture = createTileTexture();
        const waterGeo = new THREE.PlaneGeometry(2, 2, 256, 256);
        this.caustics = new CausticsGenerator(waterGeo);
        
        const surfaceGeo = waterGeo.clone();
        surfaceGeo.rotateX(-Math.PI / 2);
        
        // --- Water Volume Geometry ---
        // Create volume geometry with top face removed to prevent z-fighting with the water surface.
        const volumeGeo = new THREE.BoxGeometry(this.poolSize - 0.004, this.poolHeight - 0.002, this.poolSize - 0.004);
        volumeGeo.translate(0, -this.poolHeight / 2, 0);
        
        const vIndices = volumeGeo.getIndex();
        if (vIndices) {
            const indices = vIndices.array;
            const pos = volumeGeo.attributes.position;
            const newIndices = [];
            for (let i = 0; i < indices.length; i += 3) {
                // A horizontal top face has all its vertices at approx y = 0 after the translation.
                // We keep a face if at least one of its vertices is significantly below y=0.
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
        mergedGeo.addGroup(idxCount, Infinity, 1); // Remaining faces to volume material

        this.waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_waterTexture: { value: null },
                u_reflectionTexture: { value: this.reflectionTarget.texture },
                u_textureMatrix: { value: this.textureMatrix },
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

        this.waterObj = new THREE.Mesh(mergedGeo, [this.waterMaterial, this.waterVolumeMaterial]);
        this.scene.add(this.waterObj);

        // --- Pool Geometry ---
        // Create pool geometry with top face removed to eliminate z-fighting at y=0.
        const poolGeo = new THREE.BoxGeometry(this.poolSize, this.poolHeight, this.poolSize);
        const pIndices = poolGeo.getIndex();
        if (pIndices) {
            const indices = pIndices.array;
            const pos = poolGeo.attributes.position;
            const newIndices = [];
            const topYThreshold = this.poolHeight / 2 - 0.01;
            for (let i = 0; i < indices.length; i += 3) {
                // Remove horizontal face where all vertices are at top (y = height/2)
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
            // Inject uniform for dynamic IOR updates
            shader.uniforms.u_waterIor = { value: 1.333 };
            
            shader.vertexShader = `varying vec3 v_worldPos;\n` + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\nv_worldPos = (modelMatrix * vec4(position, 1.0)).xyz;`);
            
            // Replaced hardcoded IOR logic with u_waterIor uniform usage
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
            
            // Replaced hardcoded IOR logic with u_waterIor uniform usage
            shader.fragmentShader = `uniform sampler2D u_causticsTexture; uniform sampler2D u_waterTexture; uniform vec3 u_lightDir; uniform float u_waterIor; varying vec3 v_worldPos; const float IOR_AIR = 1.0;\n` + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\nvec2 waterUv = v_worldPos.xz * 0.5 + 0.5; waterUv.y = 1.0 - waterUv.y; float waterHeight = texture2D(u_waterTexture, waterUv).r; if (v_worldPos.y < waterHeight) { vec3 refractedLight = refract(-u_lightDir, vec3(0.0, 1.0, 0.0), IOR_AIR / u_waterIor); vec2 causticsUv = v_worldPos.xz - v_worldPos.y * refractedLight.xz / refractedLight.y; causticsUv = causticsUv * 0.5 + 0.5; float caustics = texture2D(u_causticsTexture, causticsUv).r; gl_FragColor.rgb += vec3(1.0) * caustics * 0.5; }`);
            this.sphereShader = shader;
        };
    }

    // --- Interaction Handlers ---
    private onPointerDown = (e: PointerEvent) => {
        this.updatePointer(e);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersects = this.raycaster.intersectObject(this.sphere);
        if (intersects.length > 0) {
            this.isDraggingSphere = true;
            this.controls.enabled = false;
            this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()).negate(), intersects[0].point);
        } else {
            // Check if we hit the water plane (roughly)
            const point = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.waterPlane, point);
            const uv = new THREE.Vector2(point.x/this.poolSize + 0.5, 0.5 - point.z/this.poolSize);
            
            // If interaction is within the pool bounds, start ripple and disable orbit
            if(uv.x>=0 && uv.x<=1 && uv.y>=0 && uv.y<=1) {
                this.controls.enabled = false; // Disable orbit controls to prevent camera movement
                // Use dynamic interaction strength
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

        // If hovering over sphere, don't trigger water ripples
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
            // Dynamic trail strength based on movement and interaction setting
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
        this.controls.enabled = true; // Re-enable orbit controls
        this.lastWaterInteractionPoint = null; 
    }
    
    private onPointerLeave = () => { 
        this.lastWaterInteractionPoint = null; 
        this.controls.enabled = true; // Ensure controls are re-enabled if cursor leaves window
    }

    private updatePointer(e: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    // --- API Methods ---
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
    
    // New granular setters
    setDamping(v: number) { this.waterSim.setDamping(v); }
    setWindStrength(v: number) { this.windStrength = v; }
    setPhysicalConfig(roughness: number, metalness: number, ior: number) {
        // Volume material updates
        this.waterVolumeMaterial.roughness = roughness;
        this.waterVolumeMaterial.metalness = metalness;
        this.waterVolumeMaterial.ior = ior;
        
        // Surface shader updates
        this.waterMaterial.uniforms.u_waterIor.value = ior;
        
        // Underwater shader updates (if compiled)
        if(this.poolShader) this.poolShader.uniforms.u_waterIor.value = ior;
        if(this.sphereShader) this.sphereShader.uniforms.u_waterIor.value = ior;
    }
    setSunShininess(v: number) {
        this.waterMaterial.uniforms.u_sunShininess.value = v;
    }

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

    // --- Core Logic ---
    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    updateReflector() {
        const camWorld = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
        const rotMat = new THREE.Matrix4().extractRotation(this.waterObj.matrixWorld);
        const normal = new THREE.Vector3(0,1,0).applyMatrix4(rotMat);
        const view = new THREE.Vector3().subVectors(new THREE.Vector3(), camWorld).reflect(normal).negate(); // Reflector pos at (0,0,0)
        
        this.reflector.position.copy(view);
        this.reflector.up.set(0,1,0).applyMatrix4(rotMat).reflect(normal);
        this.reflector.lookAt(new THREE.Vector3().subVectors(new THREE.Vector3(), new THREE.Vector3(0,0,-1).applyMatrix4(this.camera.matrixWorld).sub(camWorld)).reflect(normal));
        
        this.reflector.aspect = this.camera.aspect;
        this.reflector.fov = this.camera.fov;
        this.reflector.updateProjectionMatrix();

        this.textureMatrix.set(0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1);
        this.textureMatrix.multiply(this.reflector.projectionMatrix).multiply(this.reflector.matrixWorldInverse);
    }

    animate = () => {
        this.animFrameId = requestAnimationFrame(this.animate);
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime(); // Kept for consistent bubble wobble if needed, but we'll use accumulated for waves
        
        // Accumulate wave time scaled by speed
        this.accumulatedWaveTime += delta * this.waveSpeed;
        
        this.controls.update();

        // 1. Wind & Simulation (Dynamic wind strength)
        // Use accumulated time for variable wave speed
        this.waterSim.addDrop(
            Math.sin(this.accumulatedWaveTime * 0.3 + 2) * 0.5 + 0.5, 
            Math.cos(this.accumulatedWaveTime * 0.5 + 1) * 0.5 + 0.5, 
            0.05, 
            this.windStrength
        );
        this.waterSim.addDrop(
            Math.sin(this.accumulatedWaveTime * 0.2 - 1) * 0.5 + 0.5, 
            Math.cos(this.accumulatedWaveTime * 0.4 - 3) * 0.5 + 0.5, 
            0.08, 
            -this.windStrength * 0.7
        );

        // 2. Sphere Interaction (Physics)
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

        // 3. Update Uniforms
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

        // 4. Bubbles
        const posAttr = this.bubbleParticles.geometry.attributes.position as THREE.BufferAttribute;
        this.bubblesData.forEach((b, i) => {
            b.position.y += b.velocity;
            // Also scale bubble wobble by waveSpeed for consistency? 
            // Let's keep bubble physics separate for now or scale it if desired. 
            // User asked for "waves" control, usually surface. Bubbles are independent.
            b.position.x += Math.sin(time * b.wobbleSpeed + b.wobbleOffset) * 0.001;
            if(b.position.y > 0) { // Reset
                b.position.y = -this.poolHeight;
                b.position.x = (Math.random()-0.5)*(this.poolSize-0.1);
                b.position.z = (Math.random()-0.5)*(this.poolSize-0.1);
            }
            posAttr.setXYZ(i, b.position.x, b.position.y, b.position.z);
        });
        posAttr.needsUpdate = true;

        // 5. Render Reflection
        this.waterObj.visible = false;
        this.bubbleParticles.visible = false;
        this.poolMaterial.side = THREE.FrontSide;
        this.updateReflector();
        this.renderer.clippingPlanes = [this.reflectorPlane];
        this.renderer.setRenderTarget(this.reflectionTarget);
        this.renderer.render(this.scene, this.reflector);
        this.renderer.setRenderTarget(null);
        this.renderer.clippingPlanes = [];
        this.poolMaterial.side = THREE.BackSide;
        this.waterObj.visible = true;
        this.bubbleParticles.visible = true;

        // 6. Final Render
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
        this.reflectionTarget.dispose();
        this.container.innerHTML = '';
    }
}

// --- React Wrapper Component ---

const WebGLWater = (props: WebGLWaterProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WaterEngine | null>(null);

  // Initialize Engine Once
  useLayoutEffect(() => {
    if (!mountRef.current) return;
    const engine = new WaterEngine(mountRef.current);
    engineRef.current = engine;

    // Expose imperative API for parent (control panel)
    if (props.sceneApiRef) {
        props.sceneApiRef.current = {
            setLightIntensity: (v: number) => engine.setLightIntensity(v),
            setSpecularIntensity: (v: number) => engine.setSpecularIntensity(v),
            // Expose new setters for direct API access if needed
            setDamping: (v: number) => engine.setDamping(v),
            setWindStrength: (v: number) => engine.setWindStrength(v),
            setPhysicalConfig: (r: number, m: number, ior: number) => engine.setPhysicalConfig(r, m, ior),
            setSunShininess: (v: number) => engine.setSunShininess(v),
            setInteractionStrength: (v: number) => engine.setInteractionStrength(v),
            setWaveSpeed: (v: number) => engine.setWaveSpeed(v),
            setBubbleConfig: (size: number, opacity: number) => engine.setBubbleConfig(size, opacity),
        };
    }

    return () => {
        engine.dispose();
        if (props.sceneApiRef) props.sceneApiRef.current = null;
    };
  }, []);

  // Sync Props to Engine (Declarative Updates)
  useEffect(() => { engineRef.current?.setLightPosition(props.lightPosition); }, [props.lightPosition]);
  useEffect(() => { engineRef.current?.setSkyPreset(props.skyPreset); }, [props.skyPreset]);
  useEffect(() => { engineRef.current?.setLightIntensity(props.lightIntensity); }, [props.lightIntensity]);
  useEffect(() => { engineRef.current?.setSpecularIntensity(props.specularIntensity); }, [props.specularIntensity]);
  useEffect(() => { 
      engineRef.current?.setWaterConfig(props.useCustomWaterColor, props.waterColorShallow, props.waterColorDeep); 
  }, [props.useCustomWaterColor, props.waterColorShallow, props.waterColorDeep]);
  
  // New Effect hooks for granular controls
  useEffect(() => { engineRef.current?.setDamping(props.simDamping); }, [props.simDamping]);
  useEffect(() => { engineRef.current?.setWindStrength(props.simWind); }, [props.simWind]);
  useEffect(() => { 
      engineRef.current?.setPhysicalConfig(props.matRoughness, props.matMetalness, props.matIor); 
  }, [props.matRoughness, props.matMetalness, props.matIor]);
  useEffect(() => { engineRef.current?.setSunShininess(props.sunShininess); }, [props.sunShininess]);

  // FX Hooks
  useEffect(() => { engineRef.current?.setInteractionStrength(props.interactionStrength); }, [props.interactionStrength]);
  useEffect(() => { engineRef.current?.setWaveSpeed(props.waveSpeed); }, [props.waveSpeed]);
  useEffect(() => { engineRef.current?.setBubbleConfig(props.bubbleSize, props.bubbleOpacity); }, [props.bubbleSize, props.bubbleOpacity]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
};

export default WebGLWater;