/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from 'three';
import { createLightShaftTexture } from './assets.ts';

export class LightShafts {
    group: THREE.Group;
    material: THREE.ShaderMaterial;
    shafts: THREE.Group[] = [];
    poolSize: number;
    poolHeight: number;

    constructor(poolSize: number, poolHeight: number) {
        this.poolSize = poolSize;
        this.poolHeight = poolHeight;
        this.group = new THREE.Group();
        
        const texture = createLightShaftTexture();
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                u_texture: { value: texture },
                u_time: { value: 0 },
                u_color: { value: new THREE.Color('#ffffff') },
                u_lightDir: { value: new THREE.Vector3(0, 1, 0) },
                u_opacity: { value: 0.3 },
                u_waterHeight: { value: 0 },
                u_poolHeight: { value: poolHeight }
            },
            vertexShader: `
                varying vec2 v_uv;
                varying float v_depth;
                varying float v_noise;
                uniform float u_time;
                uniform vec3 u_lightDir;
                
                void main() {
                    v_uv = uv;
                    
                    // Fluid sway animation
                    vec3 pos = position;
                    float swayX = sin(u_time * 0.4 + position.y * 1.5) * 0.1;
                    float swayZ = cos(u_time * 0.3 + position.y * 1.2) * 0.1;
                    pos.x += swayX;
                    pos.z += swayZ;
                    
                    // Subtle noise-like variation for fluid feel
                    v_noise = sin(u_time * 0.8 + position.y * 3.0 + position.x * 2.0) * 0.5 + 0.5;
                    
                    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                    v_depth = worldPos.y;
                    
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform sampler2D u_texture;
                uniform vec3 u_color;
                uniform float u_opacity;
                uniform float u_waterHeight;
                uniform float u_poolHeight;
                uniform float u_time;
                varying vec2 v_uv;
                varying float v_depth;
                varying float v_noise;
                
                void main() {
                    // Sample texture with slight time-based UV distortion for fluid look
                    vec2 distortedUv = v_uv;
                    distortedUv.x += sin(u_time * 0.5 + v_uv.y * 4.0) * 0.02;
                    
                    vec4 tex = texture2D(u_texture, distortedUv);
                    
                    // Fluid shimmer/flicker
                    float shimmer = 0.8 + 0.2 * v_noise;
                    
                    // Fade at top (water surface)
                    float topFade = smoothstep(0.0, -0.2, v_depth - u_waterHeight);
                    
                    // Fade at bottom (pool floor)
                    float bottomFade = smoothstep(-u_poolHeight, -u_poolHeight + 0.3, v_depth);
                    
                    // Soften edges even more
                    float edgeSoftness = smoothstep(0.0, 0.2, v_uv.x) * smoothstep(1.0, 0.8, v_uv.x);
                    
                    // Combine fades
                    float alpha = tex.a * u_opacity * topFade * bottomFade * shimmer * edgeSoftness;
                    
                    gl_FragColor = vec4(u_color * tex.rgb, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        this.createShafts();
    }

    private createShafts() {
        const shaftCount = 8;
        const planeGeo = new THREE.PlaneGeometry(0.5, this.poolHeight, 1, 8);
        planeGeo.translate(0, -this.poolHeight / 2, 0);
        
        for (let i = 0; i < shaftCount; i++) {
            const shaftGroup = new THREE.Group();
            
            // Create a "cross" of planes for each shaft, tilted slightly
            // to be visible from above as requested.
            const planeCount = 3;
            for (let j = 0; j < planeCount; j++) {
                const plane = new THREE.Mesh(planeGeo, this.material);
                plane.rotation.y = (j / planeCount) * Math.PI;
                
                // Tilt the plane slightly on the X axis so it's visible from above
                // "Rotate planes on the other axis"
                plane.rotation.x = (Math.random() - 0.5) * 0.2;
                plane.rotation.z = (Math.random() - 0.5) * 0.2;
                
                shaftGroup.add(plane);
            }
            
            // Random position within the pool
            const x = (Math.random() - 0.5) * (this.poolSize - 0.5);
            const z = (Math.random() - 0.5) * (this.poolSize - 0.5);
            shaftGroup.position.set(x, 0, z);
            
            // Random scale
            const s = 0.5 + Math.random() * 1.5;
            shaftGroup.scale.set(s, 1, s);
            
            this.shafts.push(shaftGroup);
            this.group.add(shaftGroup);
        }
    }

    update(time: number, lightDir: THREE.Vector3) {
        this.material.uniforms.u_time.value = time;
        this.material.uniforms.u_lightDir.value.copy(lightDir);
        
        // The lightDir is the vector from the origin to the sun.
        // Light rays travel in the opposite direction (-lightDir).
        // Our shaft geometry is defined along the negative Y axis (pointing down).
        // So we need to rotate the "down" vector (0, -1, 0) to match -lightDir.
        // This is mathematically equivalent to rotating the "up" vector (0, 1, 0) to match lightDir.
        
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, lightDir);
        
        this.shafts.forEach(s => {
            s.quaternion.copy(quaternion);
        });
    }

    setOpacity(v: number) {
        this.material.uniforms.u_opacity.value = v;
    }
    
    setColor(color: string) {
        this.material.uniforms.u_color.value.set(color);
    }
}
