/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const commonVertexShader = `
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const dropShaderFs = `
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

export const updateShaderFs = `
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

export const normalShaderFs = `
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

export const sphereShaderFs = `
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

export const waterVertexShader = `
  uniform sampler2D u_waterTexture;
  varying vec2 v_uv;
  varying vec3 v_worldPos;

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
    gl_Position = projectionMatrix * viewMatrix * vec4(v_worldPos, 1.0);
  }
`;

export const waterFragmentShader = `
  #include <packing>
  uniform sampler2D u_waterTexture;
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

  const float IOR_AIR = 1.0;
  const vec3 abovewaterColor = vec3(0.25, 1.0, 1.25);
  const float poolSize = 2.0;
  const float poolHeight = 1.0;

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

  // Intersects an open box (walls + floor, no ceiling)
  float intersectOpenPool(vec3 origin, vec3 ray) {
      float t = 1.0e6;
      
      // Floor plane: y = -poolHeight
      if (ray.y < 0.0) {
          float t_floor = (-poolHeight - origin.y) / ray.y;
          if (t_floor > 0.0) t = min(t, t_floor);
      }
      
      // Walls X: x = +/- poolSize/2
      if (abs(ray.x) > 1.0e-5) {
          float wallX = sign(ray.x) * poolSize/2.0;
          float t_wallX = (wallX - origin.x) / ray.x;
          if (t_wallX > 0.0) t = min(t, t_wallX);
      }

      // Walls Z: z = +/- poolSize/2
      if (abs(ray.z) > 1.0e-5) {
          float wallZ = sign(ray.z) * poolSize/2.0;
          float t_wallZ = (wallZ - origin.z) / ray.z;
          if (t_wallZ > 0.0) t = min(t, t_wallZ);
      }
      
      return t;
  }

  vec3 getSphereColor(vec3 point) {
    vec3 color = vec3(1.0);
    vec3 sphereNormal = normalize(point - u_sphereCenter);
    float diffuse = max(0.0, dot(u_lightDir, sphereNormal));
    color += u_lightColor * diffuse * 0.5;
    return color;
  }

  vec3 getWallColor(vec3 point) {
    vec3 wallColor;
    vec3 normal;
    float epsilon = 0.005; 
    
    if (point.y < -poolHeight + epsilon) {
        wallColor = texture2D(u_tiles, point.xz * 0.5 + 0.5).rgb;
        normal = vec3(0.0, 1.0, 0.0);
    } else if (abs(point.x) > (poolSize / 2.0) - epsilon) {
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

  vec3 traceRay(vec3 origin, vec3 ray) {
    if (length(ray) < 1.0e-3) return vec3(0.0);

    float t_sphere = intersectSphere(origin, ray, u_sphereCenter, u_sphereRadius);
    
    if (ray.y >= 0.0) {
        if (t_sphere < 1.0e5) {
             return getSphereColor(origin + ray * t_sphere);
        }
        return textureCube(u_skybox, ray).rgb;
    } else {
        float t_pool = intersectOpenPool(origin, ray);
        
        if (t_sphere < t_pool && t_sphere < 1.0e5) {
             return getSphereColor(origin + ray * t_sphere);
        } else if (t_pool < 1.0e5) {
             return getWallColor(origin + ray * t_pool);
        } else {
             return vec3(0.0, 0.0, 0.1); 
        }
    }
  }

  void main() {
    vec4 info = texture2D(u_waterTexture, v_uv);
    vec3 simNormal = normalize(vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a));
    vec3 worldNormal = normalize(vec3(simNormal.x, simNormal.y, -simNormal.z));
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    
    vec3 finalColor;

    if (gl_FrontFacing) {
        // --- TOP SURFACE (VIEW FROM AIR) ---
        vec3 facingNormal = worldNormal;
        
        // Reflection
        vec3 reflectedRay = reflect(-viewDir, facingNormal);
        vec3 reflectedColor = traceRay(v_worldPos, reflectedRay);

        // Refraction
        vec3 refractedRay = refract(-viewDir, facingNormal, IOR_AIR / u_waterIor);
        vec3 refractedColor = traceRay(v_worldPos, refractedRay);
        
        // Tint underwater colors
        if (refractedRay.y < 0.0) {
            vec3 waterTintColor = abovewaterColor;
            if (u_useCustomColor) {
              float mixFactor = smoothstep(-0.1, 0.1, v_worldPos.y);
              waterTintColor = mix(u_deepColor, u_shallowColor, mixFactor);
            }
            refractedColor *= waterTintColor;
        }
        
        // Fresnel
        float F0 = pow((IOR_AIR - u_waterIor) / (IOR_AIR + u_waterIor), 2.0);
        float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(0.0, dot(facingNormal, viewDir)), 5.0);
        
        finalColor = mix(refractedColor, reflectedColor, fresnel);

        // Specular Highlight
        vec3 halfVec = normalize(u_lightDir + viewDir);
        float specTerm = pow(max(0.0, dot(facingNormal, halfVec)), u_sunShininess);
        vec3 specular = u_lightColor * specTerm * u_specularIntensity;
        finalColor += specular * fresnel;

    } else {
        // --- BOTTOM SURFACE (VIEW FROM WATER) ---
        vec3 facingNormal = -worldNormal; // Normal points into the water volume
        
        // Reflection of the underwater scene (pool floor, sphere)
        vec3 reflectedRay = reflect(-viewDir, facingNormal);
        vec3 reflectedColor = traceRay(v_worldPos, reflectedRay);

        // Refraction of the world above (sky, sphere if above water)
        vec3 refractedRay = refract(-viewDir, facingNormal, u_waterIor / IOR_AIR);
        
        // Check for Total Internal Reflection
        if (length(refractedRay) < 0.1) {
            finalColor = reflectedColor;
        } else {
            vec3 refractedColor = traceRay(v_worldPos, refractedRay);
            
            // Fresnel for water -> air
            float F0 = pow((u_waterIor - IOR_AIR) / (u_waterIor + IOR_AIR), 2.0);
            float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(0.0, dot(facingNormal, viewDir)), 5.0);
            
            finalColor = mix(refractedColor, reflectedColor, fresnel);
        }
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export const bubbleVertexShader = `
  uniform sampler2D u_waterTexture;
  uniform float u_poolSize;
  uniform float u_pointSize;
  varying float v_opacity;
  
  void main() {
    vec2 waterUv = position.xz / u_poolSize + 0.5;
    waterUv.y = 1.0 - waterUv.y;
    float waterHeight = texture2D(u_waterTexture, waterUv).r;
    
    // Decay near surface: 1.0 at bottom, fades to 0.0 at surface
    v_opacity = smoothstep(waterHeight + 0.02, waterHeight - 0.08, position.y);
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = u_pointSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const bubbleFragmentShader = `
  uniform sampler2D u_texture;
  uniform float u_baseOpacity;
  varying float v_opacity;
  
  void main() {
    vec4 tex = texture2D(u_texture, gl_PointCoord);
    gl_FragColor = tex * v_opacity * u_baseOpacity;
  }
`;
