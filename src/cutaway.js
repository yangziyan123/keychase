import * as THREE from "three";

export const FOREGROUND_LAYER = 1;
const WINDOW_SCALE = 2.5;
const HORIZONTAL_RADIUS = 3.3 * WINDOW_SCALE * 1.5;
const VERTICAL_RADIUS = 1.68 * WINDOW_SCALE;
const LOOK_AHEAD = 1.12;

export function createCutaway(renderer) {
  const gl = renderer.getContext();
  const hdr = renderer.extensions.has("EXT_color_buffer_float");
  const format = hdr ? gl.RGBA16F : gl.RGBA8;
  const samples = gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: samples.find((count) => count <= 4) ?? 0,
  });
  target.scissorTest = true;

  const center = new THREE.Vector2();
  const radius = new THREE.Vector2();
  const pixelSize = new THREE.Vector2();
  const point = new THREE.Vector3();
  const screen = new THREE.Scene();
  const screenCamera = new THREE.Camera();
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: {
      uStreet: { value: target.texture },
      uCenter: { value: center },
      uRadius: { value: radius },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uStreet;
      uniform vec2 uCenter;
      uniform vec2 uRadius;
      varying vec2 vUv;

      void main() {
        float distance = length((vUv - uCenter) / uRadius);
        float reveal = 1.0 - smoothstep(.72, 1.0, distance);
        if (reveal <= 0.0) discard;
        gl_FragColor = vec4(texture2D(uStreet, vUv).rgb, reveal * .98);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  overlay.frustumCulled = false;
  screen.add(overlay);

  return {
    resize() {
      renderer.getDrawingBufferSize(pixelSize);
      target.setSize(pixelSize.x, pixelSize.y);
    },

    render(scene, camera, thief) {
      renderer.render(scene, camera);
      const viewWidth = camera.right - camera.left;
      const viewHeight = camera.top - camera.bottom;
      radius.set(HORIZONTAL_RADIUS / viewWidth, VERTICAL_RADIUS / viewHeight);
      point.copy(thief.position);
      point.y += 1.02;
      point.project(camera);
      center.set(.5 + point.x / 2 + LOOK_AHEAD / viewWidth, .5 + point.y / 2);

      // Shade only the part of the unobstructed street that the ellipse can show.
      const { x: width, y: height } = pixelSize;
      const left = Math.max(0, Math.floor((center.x - radius.x) * width) - 1);
      const bottom = Math.max(0, Math.floor((center.y - radius.y) * height) - 1);
      const right = Math.min(width, Math.ceil((center.x + radius.x) * width) + 1);
      const top = Math.min(height, Math.ceil((center.y + radius.y) * height) + 1);
      if (right <= left || top <= bottom) return;

      target.scissor.set(left, bottom, right - left, top - bottom);
      camera.layers.disable(FOREGROUND_LAYER);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      camera.layers.enable(FOREGROUND_LAYER);

      renderer.autoClear = false;
      renderer.render(screen, screenCamera);
      renderer.autoClear = true;
    },
  };
}
