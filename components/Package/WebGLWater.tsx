
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useTheme } from '../../Theme.tsx';
import { CausticsGenerator } from './CausticsGenerator.tsx';

interface WebGLWaterProps {
  lightPosition: { x: number; y: number; z: number };
  skyPreset: string;
  lightIntensity: number;
  specularIntensity: number;
  useCustomWaterColor: boolean;
  waterColorShallow: string;
  waterColorDeep: string;
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
    info.g *= 0.995;
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

    // --- Edge Pinning Logic ---
    // Calculate distance to the nearest edge (0.0 at edge, 0.5 at center)
    float distToEdgeX = min(v_uv.x, 1.0 - v_uv.x);
    float distToEdgeY = min(v_uv.y, 1.0 - v_uv.y);
    float distToEdge = min(distToEdgeX, distToEdgeY);

    // Create a smooth falloff factor from 0.0 at the edge to 1.0 further in.
    // The falloff happens over the outer 5% of the surface.
    float falloff = smoothstep(0.0, 0.05, distToEdge);

    // Apply displacement modulated by the falloff factor.
    // This pins the edges (falloff=0) and allows full waves in the center (falloff=1).
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
  uniform vec3 u_cameraPos;
  uniform vec3 u_sphereCenter;
  uniform float u_sphereRadius;
  uniform bool u_useCustomColor;
  uniform vec3 u_shallowColor;
  uniform vec3 u_deepColor;

  varying vec2 v_uv;
  varying vec3 v_worldPos;
  varying vec4 v_reflectionUv;

  const float IOR_AIR = 1.0;
  const float IOR_WATER = 1.333;
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
    
    // Ambient occlusion with walls (softened)
    color *= 1.0 - 0.5 / pow((poolSize / 2.0 + u_sphereRadius - abs(point.x)) / u_sphereRadius, 3.0);
    color *= 1.0 - 0.5 / pow((poolSize / 2.0 + u_sphereRadius - abs(point.z)) / u_sphereRadius, 3.0);
    color *= 1.0 - 0.5 / pow((point.y + poolHeight + u_sphereRadius) / u_sphereRadius, 3.0);

    // Diffuse lighting
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
    float light_level = diffuse * 0.6 + ambient;
    
    return wallColor * light_level;
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
      color += u_lightColor * pow(max(0.0, dot(u_lightDir, ray)), 1000.0) * u_specularIntensity;
    }
    
    if (ray.y < 0.0) color *= waterColor;
    return color;
  }

  void main() {
    vec2 coord = v_uv;
    vec4 info = texture2D(u_waterTexture, coord);
    
    // make water look more "peaked" by disturbing texture coordinates with normals
    for (int i = 0; i < 3; i++) {
        coord += info.ba * 0.003;
        info = texture2D(u_waterTexture, coord);
    }

    // Normal from simulation texture (Y is up in Sim space)
    // info.b = slope X, info.a = slope Y (in texture space)
    vec3 simNormal = normalize(vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a));
    
    // Transform to World Space
    // Geometry is XZ. UVs map U->X, V->-Z.
    // SimNormal X maps to World X. SimNormal Z maps to World -Z. SimNormal Y (Up) maps to World Y.
    vec3 worldNormal = normalize(vec3(simNormal.x, simNormal.y, -simNormal.z));
    
    vec3 viewDir = normalize(v_worldPos - u_cameraPos);
    
    vec3 refractedRay = refract(viewDir, worldNormal, IOR_AIR / IOR_WATER);
    float fresnel = 0.3; // Lowered for more cinematic (less reflective) water
    
    // Reflection distortion
    float distortionStrength = 0.04;
    vec2 distortion = worldNormal.xz * distortionStrength;
    
    vec2 distortedUv = v_reflectionUv.xy / v_reflectionUv.w;
    distortedUv += distortion;

    vec3 reflectedColor = texture2D(u_reflectionTexture, distortedUv).rgb;
    
    vec3 waterTintColor = abovewaterColor;
    if (u_useCustomColor) {
      float mixFactor = smoothstep(-0.1, 0.1, v_worldPos.y);
      waterTintColor = mix(u_deepColor, u_shallowColor, mixFactor);
    }
    vec3 refractedColor = getRefractedColor(v_worldPos, refractedRay, waterTintColor);
    
    vec3 color = mix(refractedColor, reflectedColor, fresnel);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

const createTileTexture = () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
        console.error('Failed to get 2D context for procedural texture');
        return new THREE.Texture();
    }

    const divisions = 4;
    const step = size / divisions;
    const groutWidth = 2;
    
    context.fillStyle = '#b0c4de'; // LightSteelBlue
    context.fillRect(0, 0, size, size);

    for (let y = 0; y < divisions; y++) {
        for (let x = 0; x < divisions; x++) {
            context.fillStyle = '#d8e2f3'; 
            context.fillRect(
                x * step + groutWidth, 
                y * step + groutWidth, 
                step - groutWidth * 2, 
                step - groutWidth * 2
            );
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
    const context = canvas.getContext('2d');
    if (!context) return null;
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
};

const skyPresets = {
  default: { turbidity: 10, rayleigh: 2, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  sunset: { turbidity: 20, rayleigh: 3, mieCoefficient: 0.002, mieDirectionalG: 0.95 },
  cloudy: { turbidity: 50, rayleigh: 10, mieCoefficient: 0.05, mieDirectionalG: 0.6 },
  night: { turbidity: 1, rayleigh: 0.1, mieCoefficient: 0.001, mieDirectionalG: 0.7 }
};


const WebGLWater = ({ lightPosition, skyPreset, lightIntensity, specularIntensity, useCustomWaterColor, waterColorShallow, waterColorDeep, sceneApiRef }: WebGLWaterProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneObjects = useRef<any>({});
  const { theme } = useTheme();
  
  const waterSimulation = useMemo(() => {
    const SIZE = 128; // Performance: Reduced from 256
    let renderer: THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const plane = new THREE.PlaneGeometry(2, 2);
    const targets = {
      read: new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.FloatType }),
      write: new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.FloatType }),
      swap: function() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
      }
    };

    const dropMat = new THREE.ShaderMaterial({
      uniforms: { u_texture: { value: null }, u_center: { value: new THREE.Vector2() }, u_radius: { value: 0.0 }, u_strength: { value: 0.0 } },
      vertexShader: commonVertexShader, fragmentShader: dropShaderFs,
    });
    const updateMat = new THREE.ShaderMaterial({
      uniforms: { u_texture: { value: null }, u_delta: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) } },
      vertexShader: commonVertexShader, fragmentShader: updateShaderFs,
    });
    const normalMat = new THREE.ShaderMaterial({
      uniforms: { u_texture: { value: null }, u_delta: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) } },
      vertexShader: commonVertexShader, fragmentShader: normalShaderFs,
    });
    const sphereMat = new THREE.ShaderMaterial({
      uniforms: { u_texture: { value: null }, u_oldCenter: { value: new THREE.Vector3() }, u_newCenter: { value: new THREE.Vector3() }, u_radius: { value: 0.0 } },
      vertexShader: commonVertexShader, fragmentShader: sphereShaderFs,
    });

    const mesh = new THREE.Mesh(plane, updateMat);
    scene.add(mesh);

    return {
      init: (r: THREE.WebGLRenderer) => { renderer = r; },
      addDrop: (x: number, y: number, radius: number, strength: number) => {
        mesh.material = dropMat;
        dropMat.uniforms.u_center.value.set(x, y);
        dropMat.uniforms.u_radius.value = radius;
        dropMat.uniforms.u_strength.value = strength;
        dropMat.uniforms.u_texture.value = targets.read.texture;
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      moveSphere: (oldCenter: THREE.Vector3, newCenter: THREE.Vector3, radius: number) => {
        mesh.material = sphereMat;
        sphereMat.uniforms.u_oldCenter.value.copy(oldCenter);
        sphereMat.uniforms.u_newCenter.value.copy(newCenter);
        sphereMat.uniforms.u_radius.value = radius;
        sphereMat.uniforms.u_texture.value = targets.read.texture;
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      step: () => {
        mesh.material = updateMat;
        updateMat.uniforms.u_texture.value = targets.read.texture;
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      updateNormals: () => {
        mesh.material = normalMat;
        normalMat.uniforms.u_texture.value = targets.read.texture;
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      getTexture: () => targets.read.texture,
      dispose: () => {
        targets.read.dispose();
        targets.write.dispose();
        plane.dispose();
      }
    };
  }, []);
  
  const lastWaterInteractionPoint = useRef<THREE.Vector2 | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x001122, 1, 15); // Initial dark blue fog
    const camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.01, 100);
    camera.position.set(2.5, 2.5, 3.5);

    // OPTIMIZATION: Disable antialiasing for performance
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    // OPTIMIZATION: Reduced pixel ratio for performance
    renderer.setPixelRatio(1);
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    currentMount.appendChild(renderer.domElement);
    waterSimulation.init(renderer);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const reflectionRenderTarget = new THREE.WebGLRenderTarget(256, 256, { format: THREE.RGBAFormat, type: THREE.HalfFloatType }); // Performance: Reduced from 512
    const reflector = new THREE.PerspectiveCamera();
    const reflectorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const textureMatrix = new THREE.Matrix4();
    const reflectorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Quaternion();

    const sky = new Sky();
    sky.scale.setScalar(100.0);
    const skyUniforms = sky.material.uniforms;
    const sunPosition = new THREE.Vector3();
    skyUniforms['sunPosition'].value.copy(sunPosition);

    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256); // Performance: Reduced from 512
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
    const skyScene = new THREE.Scene();
    skyScene.add(sky);
    cubeCamera.update(renderer, skyScene);
    const textureCube = cubeRenderTarget.texture;
    scene.background = textureCube;

    const tilesTexture = createTileTexture();
    
    // --- MERGED WATER GEOMETRY ---
    
    // 1. Surface Geometry (Plane)
    // We keep the original unrotated plane for CausticsGenerator calculations
    const waterGeo = new THREE.PlaneGeometry(2, 2, 256, 256);
    const causticsGenerator = new CausticsGenerator(waterGeo);

    // Create the actual surface geometry for the mesh, rotated to lie flat
    const surfaceGeo = waterGeo.clone();
    surfaceGeo.rotateX(-Math.PI / 2);

    // 2. Volume Geometry (Box)
    const poolSize = 2;
    const poolHeight = 1;
    const inset = 0.002;
    const volumeGeo = new THREE.BoxGeometry(poolSize - inset * 2, poolHeight - inset, poolSize - inset * 2);
    // Translate box so its top face is at y=0 (matches surface) and body extends down
    volumeGeo.translate(0, -poolHeight / 2, 0);

    // 3. Merge and create groups manually
    const mergedGeo = mergeGeometries([surfaceGeo, volumeGeo]);
    mergedGeo.clearGroups();
    const surfaceIndexCount = surfaceGeo.getIndex()!.count;
    mergedGeo.addGroup(0, surfaceIndexCount, 0); // Material 0: Water Surface

    // Box face order: right, left, top, bottom, front, back. Each face has 6 indices.
    const boxFaceIndexStart = surfaceIndexCount;
    mergedGeo.addGroup(boxFaceIndexStart + 0, 6, 1);  // Right
    mergedGeo.addGroup(boxFaceIndexStart + 6, 6, 1);  // Left
    mergedGeo.addGroup(boxFaceIndexStart + 12, 6, 2); // Top (Invisible)
    mergedGeo.addGroup(boxFaceIndexStart + 18, 6, 1); // Bottom
    mergedGeo.addGroup(boxFaceIndexStart + 24, 6, 1); // Front
    mergedGeo.addGroup(boxFaceIndexStart + 30, 6, 1); // Back

    // 4. Materials
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: { 
            u_waterTexture: { value: null }, 
            u_reflectionTexture: { value: reflectionRenderTarget.texture },
            u_textureMatrix: { value: textureMatrix },
            u_tiles: { value: tilesTexture },
            u_skybox: { value: textureCube }, 
            u_lightDir: { value: sunPosition },
            u_lightColor: { value: new THREE.Color(0xffffff) },
            u_specularIntensity: { value: 2.0 },
            u_cameraPos: { value: camera.position },
            u_sphereCenter: { value: new THREE.Vector3() },
            u_sphereRadius: { value: 0.0 },
            u_useCustomColor: { value: useCustomWaterColor },
            u_shallowColor: { value: new THREE.Color(waterColorShallow) },
            u_deepColor: { value: new THREE.Color(waterColorDeep) },
        },
        vertexShader: waterVertexShader, 
        fragmentShader: waterFragmentShader,
        side: THREE.DoubleSide
    });

    const waterVolumeMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(waterColorDeep),
        metalness: 0.0,
        roughness: 0.1,
        transmission: 1.0, 
        thickness: 0.8,
        ior: 1.333,
        emissive: new THREE.Color(waterColorDeep).multiplyScalar(0.05),
        depthWrite: false, 
    });

    const invisibleTopMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.0, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    // Material Array for Merged Geometry
    const materials = [
        waterMaterial,        // Index 0
        waterVolumeMaterial,  // Index 1
        invisibleTopMat       // Index 2
    ];

    const waterObj = new THREE.Mesh(mergedGeo, materials);
    scene.add(waterObj);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.copy(sunPosition);
    scene.add(sunLight);

    const poolMaterial = new THREE.MeshStandardMaterial({
      map: tilesTexture, envMap: textureCube, roughness: 0.1, metalness: 0.1, side: THREE.BackSide
    });
    const poolGeo = new THREE.BoxGeometry(poolSize, poolHeight, poolSize);
    const poolMesh = new THREE.Mesh(poolGeo, [
      poolMaterial, poolMaterial, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide }),
      poolMaterial, poolMaterial, poolMaterial
    ]);
    poolMesh.position.y = -poolHeight / 2;
    scene.add(poolMesh);

    const sphereRadius = 0.25;

    poolMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.u_causticsTexture = { value: causticsGenerator.getTexture() };
        shader.uniforms.u_waterTexture = { value: waterSimulation.getTexture() };
        shader.uniforms.u_lightDir = { value: sunPosition };
        shader.uniforms.u_sphereCenter = { value: new THREE.Vector3() };
        shader.uniforms.u_sphereRadius = { value: sphereRadius };
        
        shader.vertexShader = `
            varying vec3 v_worldPos;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `
            #include <project_vertex>
            v_worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            `
        );
    
        shader.fragmentShader = `
            uniform sampler2D u_causticsTexture;
            uniform sampler2D u_waterTexture;
            uniform vec3 u_lightDir;
            uniform vec3 u_sphereCenter;
            uniform float u_sphereRadius;
            varying vec3 v_worldPos;
            const float IOR_AIR = 1.0;
            const float IOR_WATER = 1.333;
        ` + shader.fragmentShader;
    
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            
            // --- Shadow Logic ---
            // Calculate vector from point to sphere center
            vec3 toSphere = u_sphereCenter - v_worldPos;
            
            // Project onto light direction to find distance along light ray
            // u_lightDir points TO light source
            float t = dot(toSphere, u_lightDir);
            
            float shadow = 0.0;
            if (t > 0.0) {
                // Point is "behind" sphere relative to light source
                float distSq = dot(toSphere, toSphere) - t * t;
                float dist = sqrt(max(0.0, distSq));
                
                // Soft shadow with smooth edge
                shadow = smoothstep(u_sphereRadius * 1.5, u_sphereRadius * 0.5, dist);
            }
            
            // --- Caustics Logic ---
            vec2 waterUv = v_worldPos.xz * 0.5 + 0.5;
            waterUv.y = 1.0 - waterUv.y;
            float waterHeight = texture2D(u_waterTexture, waterUv).r;
            
            vec3 causticColor = vec3(0.0);
    
            if (v_worldPos.y < waterHeight) {
                vec3 refractedLight = refract(-u_lightDir, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
                vec2 causticsUv = v_worldPos.xz - v_worldPos.y * refractedLight.xz / refractedLight.y;
                causticsUv = causticsUv * 0.5 + 0.5;
                
                float caustics = texture2D(u_causticsTexture, causticsUv).r;
                causticColor = vec3(1.0) * caustics * 0.5;
            }
            
            // --- Combine ---
            // Shadow darkens the surface
            gl_FragColor.rgb *= (1.0 - shadow * 0.5);
            
            // Caustics are added, but masked by shadow (no light = no caustics)
            gl_FragColor.rgb += causticColor * (1.0 - shadow);
            `
        );
        sceneObjects.current.poolShader = shader;
    };
    
    // --- Bubble Particle System ---
    const bubbleCount = 200;
    const bubbleParticlesGeo = new THREE.BufferGeometry();
    const bubblePositions = new Float32Array(bubbleCount * 3);
    const bubbles = [];

    for (let i = 0; i < bubbleCount; i++) {
        const x = (Math.random() - 0.5) * (poolSize - 0.1);
        const y = -poolHeight + Math.random() * poolHeight;
        const z = (Math.random() - 0.5) * (poolSize - 0.1);
        
        bubbles.push({
            position: new THREE.Vector3(x, y, z),
            velocity: 0.002 + Math.random() * 0.003,
            wobbleSpeed: Math.random() * 0.5 + 0.5,
            wobbleOffset: Math.random() * Math.PI * 2,
        });

        bubblePositions[i * 3] = x;
        bubblePositions[i * 3 + 1] = y;
        bubblePositions[i * 3 + 2] = z;
    }
    
    bubbleParticlesGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
    
    const bubbleMaterial = new THREE.PointsMaterial({
        map: createBubbleTexture(),
        size: 0.04,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const bubbleParticles = new THREE.Points(bubbleParticlesGeo, bubbleMaterial);
    scene.add(bubbleParticles);

    const sphereMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, envMap: textureCube, roughness: 0.05, metalness: 0.95 
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 32, 32), sphereMaterial);
    sphere.position.set(-0.3, -0.1, 0.3);
    scene.add(sphere);

    sphereMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.u_causticsTexture = { value: causticsGenerator.getTexture() };
        shader.uniforms.u_waterTexture = { value: waterSimulation.getTexture() };
        shader.uniforms.u_lightDir = { value: sunPosition };
    
        shader.vertexShader = `
            varying vec3 v_worldPos;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `
            #include <project_vertex>
            v_worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            `
        );
    
        shader.fragmentShader = `
            uniform sampler2D u_causticsTexture;
            uniform sampler2D u_waterTexture;
            uniform vec3 u_lightDir;
            varying vec3 v_worldPos;
            const float IOR_AIR = 1.0;
            const float IOR_WATER = 1.333;
        ` + shader.fragmentShader;
    
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            
            vec2 waterUv = v_worldPos.xz * 0.5 + 0.5;
            waterUv.y = 1.0 - waterUv.y;
            float waterHeight = texture2D(u_waterTexture, waterUv).r;
    
            if (v_worldPos.y < waterHeight) {
                vec3 refractedLight = refract(-u_lightDir, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
                vec2 causticsUv = v_worldPos.xz - v_worldPos.y * refractedLight.xz / refractedLight.y;
                causticsUv = causticsUv * 0.5 + 0.5;
                
                float caustics = texture2D(u_causticsTexture, causticsUv).r;
                gl_FragColor.rgb += vec3(1.0) * caustics * 0.5;
            }
            `
        );
        sceneObjects.current.sphereShader = shader;
    };


    waterMaterial.uniforms.u_sphereRadius.value = sphereRadius;
    let oldSpherePos = sphere.position.clone();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isDraggingSphere = false;
    const dragPlane = new THREE.Plane();
    const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    const onPointerDownImpl = (e: PointerEvent) => {
      pointer.x = (e.clientX / currentMount.clientWidth) * 2 - 1;
      pointer.y = -(e.clientY / currentMount.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(sphere);
      if (intersects.length > 0) {
        isDraggingSphere = true;
        controls.enabled = false;
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), intersects[0].point);
      } else {
        // Create a single ripple on click
        const point = new THREE.Vector3();
        raycaster.ray.intersectPlane(waterPlane, point);
        const currentUv = new THREE.Vector2(
          point.x / poolSize + 0.5,
          0.5 - point.z / poolSize
        );
        if (currentUv.x >= 0 && currentUv.x <= 1 && currentUv.y >= 0 && currentUv.y <= 1) {
            waterSimulation.addDrop(currentUv.x, currentUv.y, 0.03, 0.02);
        }
      }
    };
    const onPointerMoveImpl = (e: PointerEvent) => {
      pointer.x = (e.clientX / currentMount.clientWidth) * 2 - 1;
      pointer.y = -(e.clientY / currentMount.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      
      if (isDraggingSphere) {
        const point = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, point);
        sphere.position.copy(point);
        const limit = poolSize / 2 - sphereRadius;
        sphere.position.x = Math.max(-limit, Math.min(limit, sphere.position.x));
        sphere.position.z = Math.max(-limit, Math.min(limit, sphere.position.z));
        sphere.position.y = Math.max(-poolHeight + sphereRadius, Math.min(0.5, sphere.position.y));
        return; // Don't interact with water while dragging sphere
      }

      // If hovering over sphere, do not create ripples.
      const sphereIntersects = raycaster.intersectObject(sphere);
      if (sphereIntersects.length > 0) {
        lastWaterInteractionPoint.current = null; // Reset last point to avoid jumping trail
        return;
      }

      const isPointerDown = e.buttons === 1;

      const point = new THREE.Vector3();
      raycaster.ray.intersectPlane(waterPlane, point);
      const currentUv = new THREE.Vector2(
        point.x / poolSize + 0.5,
        0.5 - point.z / poolSize
      );
      
      // Only interact if the cursor is over the water surface
      if (currentUv.x < 0 || currentUv.x > 1 || currentUv.y < 0 || currentUv.y > 1) {
        lastWaterInteractionPoint.current = null; // Reset when leaving water area
        return;
      }

      if (lastWaterInteractionPoint.current) {
        const lastUv = lastWaterInteractionPoint.current;
        const distance = currentUv.distanceTo(lastUv);
        
        // Make trail strength proportional to mouse speed. Drag is stronger than hover.
        const baseStrength = isPointerDown ? 0.02 : 0.01;
        const strengthMultiplier = isPointerDown ? 0.4 : 0.3;
        const maxStrength = isPointerDown ? 0.05 : 0.03;
        
        const strength = Math.min(maxStrength, baseStrength + distance * strengthMultiplier);
        const radius = 0.02;

        const segments = Math.max(1, Math.ceil(distance / 0.015));
        for (let i = 0; i < segments; i++) {
          const t = i / segments;
          const uv = lastUv.clone().lerp(currentUv, t);
          // This check is now redundant but harmless
          if (uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1) {
            waterSimulation.addDrop(uv.x, uv.y, radius, strength);
          }
        }
      }
      
      lastWaterInteractionPoint.current = currentUv;
    };
    const onPointerUpImpl = () => { 
      isDraggingSphere = false; 
      controls.enabled = true; 
      lastWaterInteractionPoint.current = null;
    };
    const onPointerLeaveImpl = () => {
      lastWaterInteractionPoint.current = null;
    };

    currentMount.addEventListener('pointerdown', onPointerDownImpl);
    currentMount.addEventListener('pointermove', onPointerMoveImpl);
    currentMount.addEventListener('pointerleave', onPointerLeaveImpl);
    window.addEventListener('pointerup', onPointerUpImpl);

    const updateReflector = () => {
        reflectorWorldPosition.setFromMatrixPosition(waterObj.matrixWorld);
        cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
        rotationMatrix.extractRotation(waterObj.matrixWorld);
        const normal = new THREE.Vector3(0, 1, 0);
        normal.applyMatrix4(rotationMatrix);
        view.subVectors(reflectorWorldPosition, cameraWorldPosition);
        view.reflect(normal).negate();
        view.add(reflectorWorldPosition);
        rotationMatrix.extractRotation(camera.matrixWorld);
        lookAtPosition.set(0, 0, -1);
        lookAtPosition.applyMatrix4(rotationMatrix);
        lookAtPosition.add(cameraWorldPosition);
        target.subVectors(reflectorWorldPosition, lookAtPosition);
        target.reflect(normal).negate();
        target.add(reflectorWorldPosition);
        reflector.position.copy(view);
        reflector.up.set(0, 1, 0);
        reflector.up.applyMatrix4(rotationMatrix);
        reflector.up.reflect(normal);
        reflector.lookAt(target);
        reflector.far = camera.far;
        reflector.near = camera.near;
        reflector.aspect = camera.aspect;
        reflector.fov = camera.fov;
        reflector.updateProjectionMatrix();
        textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
        textureMatrix.multiply(reflector.projectionMatrix);
        textureMatrix.multiply(reflector.matrixWorldInverse);
    };

    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      controls.update();
      
      const { poolShader, sphereShader } = sceneObjects.current;

      // --- Wind Simulation ---
      const windStrength = 0.0005;
      const windWave1_x = Math.sin(time * 0.3 + 2.0) * 0.5 + 0.5;
      const windWave1_y = Math.cos(time * 0.5 + 1.0) * 0.5 + 0.5;
      waterSimulation.addDrop(windWave1_x, windWave1_y, 0.05, windStrength);

      const windWave2_x = Math.sin(time * 0.2 - 1.0) * 0.5 + 0.5;
      const windWave2_y = Math.cos(time * 0.4 - 3.0) * 0.5 + 0.5;
      waterSimulation.addDrop(windWave2_x, windWave2_y, 0.08, -windStrength * 0.7);

      // Bubble animation
      const positionAttribute = bubbleParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bubbleCount; i++) {
        const bubble = bubbles[i];
        bubble.position.y += bubble.velocity;
        bubble.position.x += Math.sin(time * bubble.wobbleSpeed + bubble.wobbleOffset) * 0.001;

        if (bubble.position.y > 0) { // Reset when it reaches the surface
            bubble.position.y = -poolHeight;
            bubble.position.x = (Math.random() - 0.5) * (poolSize - 0.1);
            bubble.position.z = (Math.random() - 0.5) * (poolSize - 0.1);
        }

        positionAttribute.setXYZ(i, bubble.position.x, bubble.position.y, bubble.position.z);
      }
      positionAttribute.needsUpdate = true;

      if (oldSpherePos.distanceTo(sphere.position) > 0.001) {
        waterSimulation.moveSphere(
          new THREE.Vector3(oldSpherePos.x, oldSpherePos.y, -oldSpherePos.z),
          new THREE.Vector3(sphere.position.x, sphere.position.y, -sphere.position.z),
          sphereRadius
        );
        oldSpherePos.copy(sphere.position);
      }
      waterSimulation.step();
      waterSimulation.updateNormals();
      
      const waterTexture = waterSimulation.getTexture();
      causticsGenerator.update(renderer, waterTexture, sunPosition);

      if (poolShader) {
        poolShader.uniforms.u_lightDir.value.copy(sunPosition);
        poolShader.uniforms.u_waterTexture.value = waterTexture;
        poolShader.uniforms.u_sphereCenter.value.copy(sphere.position);
      }
      if (sphereShader) {
        sphereShader.uniforms.u_lightDir.value.copy(sunPosition);
        sphereShader.uniforms.u_waterTexture.value = waterTexture;
      }
      
      waterObj.visible = false;
      bubbleParticles.visible = false;
      poolMaterial.side = THREE.FrontSide;
      updateReflector();
      renderer.clippingPlanes = [reflectorPlane];
      renderer.setRenderTarget(reflectionRenderTarget);
      renderer.render(scene, reflector);
      renderer.setRenderTarget(null);
      renderer.clippingPlanes = [];
      poolMaterial.side = THREE.BackSide;
      waterObj.visible = true;
      bubbleParticles.visible = true;

      waterMaterial.uniforms.u_waterTexture.value = waterTexture;
      waterMaterial.uniforms.u_cameraPos.value.copy(camera.position);
      waterMaterial.uniforms.u_sphereCenter.value.copy(sphere.position);
      renderer.render(scene, camera);
    };
    
    sceneObjects.current = { scene, sky, sunPosition, waterMaterial, sunLight, cubeCamera, renderer, skyScene, waterVolumeMaterial, bubbles, bubbleParticles, causticsGenerator, waterObj };

    if (sceneApiRef) {
        sceneApiRef.current = {
            setLightIntensity: (value: number) => {
                if (sunLight) sunLight.intensity = value;
            },
            setSpecularIntensity: (value: number) => {
                if (waterMaterial) waterMaterial.uniforms.u_specularIntensity.value = value;
            }
        };
    }
    
    const animId = requestAnimationFrame(animate);

    return () => {
      currentMount.removeEventListener('pointerdown', onPointerDownImpl);
      currentMount.removeEventListener('pointermove', onPointerMoveImpl);
      currentMount.removeEventListener('pointerleave', onPointerLeaveImpl);
      window.removeEventListener('pointerup', onPointerUpImpl);
      cancelAnimationFrame(animId);
      if (sceneApiRef) sceneApiRef.current = null;
      waterSimulation.dispose();
      causticsGenerator.dispose();
      reflectionRenderTarget.dispose();
      renderer.dispose();
      currentMount.removeChild(renderer.domElement);
    };
  }, [waterSimulation, sceneApiRef]);

  useEffect(() => {
    const { sky, sunPosition, waterMaterial, sunLight } = sceneObjects.current;
    if (!sky) return;

    sunPosition.set(lightPosition.x, lightPosition.y, lightPosition.z).normalize();
    
    sky.material.uniforms['sunPosition'].value.copy(sunPosition);
    waterMaterial.uniforms.u_lightDir.value.copy(sunPosition);
    sunLight.position.copy(sunPosition);
  }, [lightPosition]);

  useEffect(() => {
    const { sunLight } = sceneObjects.current;
    if (!sunLight) return;
    sunLight.intensity = lightIntensity;
  }, [lightIntensity]);
  
  useEffect(() => {
    const { waterMaterial } = sceneObjects.current;
    if (!waterMaterial) return;
    waterMaterial.uniforms.u_specularIntensity.value = specularIntensity;
  }, [specularIntensity]);
  
  useEffect(() => {
    const { scene, waterMaterial, waterVolumeMaterial } = sceneObjects.current;
    if (!waterMaterial || !waterVolumeMaterial) return;

    const deepColor = new THREE.Color(waterColorDeep);

    waterMaterial.uniforms.u_useCustomColor.value = useCustomWaterColor;
    waterMaterial.uniforms.u_shallowColor.value.set(waterColorShallow);
    waterMaterial.uniforms.u_deepColor.value.set(deepColor);
    
    // Make the volume and fog lighter for a clearer, more tropical feel
    const volumeColor = deepColor.clone().lerp(new THREE.Color(waterColorShallow), 0.2);
    waterVolumeMaterial.color.copy(volumeColor);
    waterVolumeMaterial.emissive.copy(volumeColor).multiplyScalar(0.05);
    
    if (scene && scene.fog) {
        scene.fog.color.copy(volumeColor);
    }
  }, [useCustomWaterColor, waterColorShallow, waterColorDeep]);

  useEffect(() => {
    const { sky, sunLight, waterMaterial, cubeCamera, renderer, skyScene } = sceneObjects.current;
    if (!sky) return;

    const preset = skyPresets[skyPreset as keyof typeof skyPresets] || skyPresets.default;
    const isNight = skyPreset === 'night';
    
    sky.material.uniforms['turbidity'].value = preset.turbidity;
    sky.material.uniforms['rayleigh'].value = preset.rayleigh;
    sky.material.uniforms['mieCoefficient'].value = preset.mieCoefficient;
    sky.material.uniforms['mieDirectionalG'].value = preset.mieDirectionalG;
    
    if (isNight) {
      sunLight.color.set(0x88aaff);
      // In night mode, light intensity is already scaled down, so we use the real-time value here.
    } else {
      sunLight.color.set(0xffffff);
    }
    sunLight.intensity = lightIntensity;


    if (waterMaterial) {
      waterMaterial.uniforms.u_lightColor.value.copy(sunLight.color);
    }

    if (renderer && skyScene) {
        cubeCamera.update(renderer, skyScene);
    }
  }, [skyPreset, lightIntensity]);


  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
};

export default WebGLWater;
