/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from 'three';

const causticsVertexShader = `
  uniform sampler2D u_waterTexture;
  uniform vec3 u_lightDir;
  uniform float u_poolHeight;

  varying vec3 v_oldPos;
  varying vec3 v_newPos;

  // Projects a ray from a point on the water surface to the pool floor
  vec3 project(vec3 origin, vec3 ray) {
    // Simplified intersection with a plane at y = -poolHeight
    float t = (-origin.y - u_poolHeight) / ray.y;
    return origin + ray * t;
  }

  void main() {
    // Sample the water simulation texture to get height and normals
    vec4 info = texture2D(u_waterTexture, uv);
    
    // Normals are packed into .ba channels
    vec3 normal = normalize(vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a));
    
    // Refract the light vector through the water surface
    vec3 refractedLight = refract(-u_lightDir, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
    vec3 refractedRay = refract(-u_lightDir, normal, 1.0 / 1.333);
    
    // Calculate the position on the floor if the water were flat vs. wavy
    vec3 origin = vec3(position.x, 0.0, -position.y); // Plane is rotated
    v_oldPos = project(origin, refractedLight);
    origin.y += info.r; // Displace by wave height
    v_newPos = project(origin, refractedRay);
    
    // Set gl_Position to project the distorted vertices onto the caustics map
    gl_Position = vec4(v_newPos.xz, 0.0, 1.0);
  }
`;

const causticsFragmentShader = `
  varying vec3 v_oldPos;
  varying vec3 v_newPos;

  void main() {
    // The change in area of the projected triangles gives the caustic intensity.
    // Where the area shrinks, light is focused (bright); where it expands, light is dispersed (dark).
    float oldArea = length(dFdx(v_oldPos)) * length(dFdy(v_oldPos));
    float newArea = length(dFdx(v_newPos)) * length(dFdy(v_newPos));
    
    // We store the caustic intensity in the red channel.
    gl_FragColor = vec4(oldArea / newArea * 0.2, 1.0, 0.0, 1.0);
  }
`;

const blurVertexShader = `
    varying vec2 v_uv;
    void main() {
        v_uv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

const blurFragmentShader = `
    uniform sampler2D u_texture;
    uniform vec2 u_delta;
    varying vec2 v_uv;
    
    const float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

    void main() {
        vec4 original = texture2D(u_texture, v_uv);
        float blurredCaustic = original.r * weights[0];

        for (int i = 1; i < 5; i++) {
            vec2 offset = float(i) * u_delta;
            blurredCaustic += texture2D(u_texture, v_uv + offset).r * weights[i];
            blurredCaustic += texture2D(u_texture, v_uv - offset).r * weights[i];
        }
        
        gl_FragColor = vec4(blurredCaustic, original.gba);
    }
`;

export class CausticsGenerator {
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private target: THREE.WebGLRenderTarget;
    private material: THREE.ShaderMaterial;
    private mesh: THREE.Mesh;

    // Blur pass resources
    private blurTarget: THREE.WebGLRenderTarget;
    private blurMaterial: THREE.ShaderMaterial;
    private blurScene: THREE.Scene;
    private blurPlane: THREE.Mesh;

    constructor(waterGeometry: THREE.BufferGeometry) {
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.scene = new THREE.Scene();
        const CAUSTICS_SIZE = 512;
        this.target = new THREE.WebGLRenderTarget(CAUSTICS_SIZE, CAUSTICS_SIZE, { type: THREE.HalfFloatType });
        this.blurTarget = new THREE.WebGLRenderTarget(CAUSTICS_SIZE, CAUSTICS_SIZE, { type: THREE.HalfFloatType });

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                u_waterTexture: { value: null },
                u_lightDir: { value: new THREE.Vector3(0, 1, 0) },
                u_poolHeight: { value: 1.0 },
            },
            vertexShader: causticsVertexShader,
            fragmentShader: causticsFragmentShader,
            extensions: { derivatives: true }
        });

        this.mesh = new THREE.Mesh(waterGeometry, this.material);
        this.scene.add(this.mesh);

        // Blur pass setup
        this.blurMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_texture: { value: null },
                u_delta: { value: new THREE.Vector2() },
            },
            vertexShader: blurVertexShader,
            fragmentShader: blurFragmentShader,
        });
        this.blurScene = new THREE.Scene();
        this.blurPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMaterial);
        this.blurScene.add(this.blurPlane);
    }

    update(renderer: THREE.WebGLRenderer, waterTexture: THREE.Texture, lightDir: THREE.Vector3) {
        const oldRenderTarget = renderer.getRenderTarget();

        // 1. Generate caustics
        this.material.uniforms.u_waterTexture.value = waterTexture;
        this.material.uniforms.u_lightDir.value.copy(lightDir);
        renderer.setRenderTarget(this.target);
        renderer.render(this.scene, this.camera);

        // 2. Blur passes (two-pass Gaussian blur)
        // Horizontal blur
        this.blurMaterial.uniforms.u_texture.value = this.target.texture;
        this.blurMaterial.uniforms.u_delta.value.set(1.0 / this.target.width, 0.0);
        renderer.setRenderTarget(this.blurTarget);
        renderer.render(this.blurScene, this.camera);

        // Vertical blur
        this.blurMaterial.uniforms.u_texture.value = this.blurTarget.texture;
        this.blurMaterial.uniforms.u_delta.value.set(0.0, 1.0 / this.target.height);
        renderer.setRenderTarget(this.target);
        renderer.render(this.blurScene, this.camera);

        // Restore original render target
        renderer.setRenderTarget(oldRenderTarget);
    }

    getTexture() {
        return this.target.texture;
    }

    dispose() {
        this.target.dispose();
        this.blurTarget.dispose();
        this.material.dispose();
        this.blurMaterial.dispose();
    }
}
