/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from 'three';
import { commonVertexShader, dropShaderFs, updateShaderFs, normalShaderFs, sphereShaderFs } from './shaders.ts';

export class GPGPUWater {
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
