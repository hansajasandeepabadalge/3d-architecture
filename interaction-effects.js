/* Geometry-bound energy effects and a small, dependency-free focus compositor. */
const DFNEffects = (() => {
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches;
  const ringGeometry = new THREE.RingGeometry(0.48, 0.5, 64);
  const surfaceVertex = `
    varying vec3 vLocal;
    varying float vHeight;
    uniform vec3 uHalfSize;
    void main() {
      vLocal = position / uHalfSize;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vHeight = world.y;
      gl_Position = projectionMatrix * viewMatrix * world;
    }`;
  const surfaceFragment = `
    varying vec3 vLocal;
    varying float vHeight;
    uniform vec3 uColor;
    uniform float uTime, uStrength, uSide, uBurst;
    void main() {
      vec3 a = abs(vLocal);
      float second = a.x + a.y + a.z - max(a.x, max(a.y,a.z)) - min(a.x,min(a.y,a.z));
      float edge = smoothstep(0.78, 0.99, second);
      float wave = fract(vHeight / uSide - uTime * 0.24);
      float scan = exp(-pow((wave - 0.5) * 30.0, 2.0));
      float sheen = pow(max(0.0, sin(dot(vLocal, vec3(0.6,0.9,0.4)) - uTime)), 12.0);
      float alpha = uStrength * (edge * 0.65 + scan * 0.15 + sheen * 0.035) + uBurst * edge * 0.45;
      gl_FragColor = vec4(mix(uColor, vec3(1.0), scan * 0.25 + uBurst * 0.3), alpha);
    }`;
  const perimeterVertex = `
    attribute float progress;
    varying float vProgress;
    void main() {
      vProgress = progress;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const perimeterFragment = `
    varying float vProgress;
    uniform float uTime, uStrength;
    uniform vec3 uColor;
    void main() {
      float trail = 1.0 - smoothstep(0.0, 0.3, fract(uTime * 0.19 - vProgress));
      gl_FragColor = vec4(mix(uColor, vec3(1.0), trail * 0.65), uStrength * (0.28 + trail * 0.72));
    }`;

  function createNode(group, side, color) {
    const root = new THREE.Group();
    const materials = [];
    const bodies = group._subMeshes?.map(s => s.mesh) || [group._meshRef];
    bodies.forEach(body => {
      const p = body.geometry.parameters;
      const uniforms = {
        uColor: { value: new THREE.Color(color) }, uTime: { value: 0 },
        uStrength: { value: 0 }, uBurst: { value: 0 }, uSide: { value: side },
        uHalfSize: { value: new THREE.Vector3(p.width / 2, p.height / 2, p.depth / 2) },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms, vertexShader: surfaceVertex, fragmentShader: surfaceFragment,
        transparent: true, depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      const shell = new THREE.Mesh(body.geometry, mat);
      shell.position.copy(body.position);
      shell.scale.setScalar(1.003);
      root.add(shell);
      materials.push(mat);
      [-1, 1].forEach(sign => {
        const x = p.width / 2 * 1.004, z = p.depth / 2 * 1.004;
        const y = body.position.y + sign * p.height / 2;
        const points = [new THREE.Vector3(-x,y,-z), new THREE.Vector3(x,y,-z),
          new THREE.Vector3(x,y,z), new THREE.Vector3(-x,y,z), new THREE.Vector3(-x,y,-z)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        geo.setAttribute('progress', new THREE.Float32BufferAttribute([0,0.25,0.5,0.75,1], 1));
        const lineMat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: 0 } },
          vertexShader: perimeterVertex, fragmentShader: perimeterFragment,
          transparent: true, depthWrite: false,
        });
        root.add(new THREE.Line(geo, lineMat));
        materials.push(lineMat);
      });
    });
    const pulse = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = -side / 2 + 0.025;
    root.add(pulse);
    group.add(root);
    root.visible = false;
    group._effects = { root, materials, pulse, side };
  }

  function tickNode(group, state, time, color, isDark) {
    const e = group._effects;
    const strength = Math.min(1, state.hover * 0.6 + state.selection);
    const burst = reduced() ? 0 : Math.sin(Math.min(1, state.burstAge / 0.85) * Math.PI);
    e.root.visible = strength > 0.005 || burst > 0.005;
    e.materials.forEach(mat => {
      mat.uniforms.uColor.value.setHex(color);
      mat.uniforms.uTime.value = reduced() ? 0 : time;
      mat.uniforms.uStrength.value = strength * (isDark ? 1 : 0.65);
      if (mat.uniforms.uBurst) mat.uniforms.uBurst.value = burst;
    });
    e.pulse.visible = burst > 0.005;
    e.pulse.scale.setScalar(e.side * (1.1 + Math.min(1, state.burstAge / 0.85) * 2.5));
    e.pulse.material.opacity = burst * 0.45;
    e.pulse.material.color.setHex(color);
  }

  const quadVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`;
  class FocusRenderer {
    constructor(renderer, scene, camera) {
      this.renderer = renderer; this.scene = scene; this.camera = camera;
      this.color = new THREE.WebGLRenderTarget(1, 1);
      this.hasDepth = renderer.capabilities.isWebGL2 || !!renderer.extensions.get('WEBGL_depth_texture');
      if (this.hasDepth) this.color.depthTexture = new THREE.DepthTexture(1, 1);
      this.blurA = new THREE.WebGLRenderTarget(1,1, { depthBuffer: false });
      this.blurB = new THREE.WebGLRenderTarget(1,1, { depthBuffer: false });
      this.mask = new THREE.WebGLRenderTarget(1,1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.screen = new THREE.Scene();
      this.screenCamera = new THREE.Camera();
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2));
      this.quad.frustumCulled = false;
      this.screen.add(this.quad);
      this.white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      this.black = new THREE.Color(0);
      this.blur = new THREE.ShaderMaterial({
        uniforms: { source: { value: null }, direction: { value: new THREE.Vector2() } },
        vertexShader: quadVertex,
        fragmentShader: `varying vec2 vUv; uniform sampler2D source; uniform vec2 direction;
          void main() {
            vec4 c = texture2D(source,vUv) * 0.227027;
            c += texture2D(source,vUv + direction * 1.384615) * 0.316216;
            c += texture2D(source,vUv - direction * 1.384615) * 0.316216;
            c += texture2D(source,vUv + direction * 3.230769) * 0.070270;
            c += texture2D(source,vUv - direction * 3.230769) * 0.070270;
            gl_FragColor = c;
          }`, depthTest: false, depthWrite: false,
      });
      this.composite = new THREE.ShaderMaterial({
        uniforms: {
          sharp: { value: this.color.texture }, soft: { value: this.blurB.texture },
          mask: { value: this.mask.texture }, depth: { value: this.color.depthTexture || this.mask.texture },
          texel: { value: new THREE.Vector2() }, amount: { value: 0 }, focalDepth: { value: 95 },
          near: { value: camera.near }, far: { value: camera.far }, hasDepth: { value: this.hasDepth ? 1 : 0 },
          bloom: { value: 0.2 },
        }, vertexShader: quadVertex,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D sharp, soft, mask, depth;
          uniform vec2 texel;
          uniform float amount, focalDepth, near, far, hasDepth, bloom;
          vec3 bright(vec2 uv) { vec3 c = texture2D(sharp,uv).rgb; return c * smoothstep(0.55,0.95,max(c.r,max(c.g,c.b))); }
          void main() {
            vec3 original = texture2D(sharp,vUv).rgb;
            float keep = texture2D(mask,vUv).r;
            keep = max(keep,texture2D(mask,vUv + vec2(texel.x,0.0)).r);
            keep = max(keep,texture2D(mask,vUv - vec2(texel.x,0.0)).r);
            keep = max(keep,texture2D(mask,vUv + vec2(0.0,texel.y)).r);
            keep = max(keep,texture2D(mask,vUv - vec2(0.0,texel.y)).r);
            float distance = mix(near,far,texture2D(depth,vUv).x);
            float coc = mix(1.0,clamp(abs(distance-focalDepth)/12.0,0.35,1.0),hasDepth);
            float blurAmount = amount * coc * (1.0-keep);
            vec3 color = mix(original,texture2D(soft,vUv).rgb,blurAmount);
            color *= 1.0 - amount * (1.0-keep) * 0.15;
            vec2 d = texel * 3.0;
            vec3 light = bright(vUv+vec2(d.x,0.0)) + bright(vUv-vec2(d.x,0.0))
              + bright(vUv+vec2(0.0,d.y)) + bright(vUv-vec2(0.0,d.y));
            d *= 2.0;
            light += bright(vUv+d) + bright(vUv-d) + bright(vUv+vec2(d.x,-d.y)) + bright(vUv+vec2(-d.x,d.y));
            gl_FragColor = vec4(color + light * bloom / 8.0,1.0);
          }`, depthTest: false, depthWrite: false,
      });
      this.resize();
    }
    resize() {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.color.setSize(size.x,size.y);
      [this.blurA,this.blurB,this.mask].forEach(rt => rt.setSize(Math.max(1,Math.round(size.x/2)),Math.max(1,Math.round(size.y/2))));
      this.composite.uniforms.texel.value.set(1/size.x,1/size.y);
    }
    pass(material,target) {
      this.quad.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.screen,this.screenCamera);
    }
    render(amount, selected, label, bloom) {
      const r = this.renderer, s = this.scene;
      r.setRenderTarget(this.color);
      r.render(s,this.camera);
      if (amount > 0.002) {
        const roots = s.children.map(child => [child,child.visible]);
        const childStates = selected ? selected.children.map(child => [child,child.visible]) : [];
        const background = s.background, override = s.overrideMaterial;
        const shadows = r.shadowMap.enabled;
        try {
          s.children.forEach(child => { child.visible = child === selected || child === label; });
          if (selected) selected.children.forEach(child => { child.visible = child === selected._meshRef || selected._subMeshes?.some(part => part.mesh === child); });
          s.background = this.black; s.overrideMaterial = this.white;
          r.shadowMap.enabled = false;
          r.setRenderTarget(this.mask); r.render(s,this.camera);
        } finally {
          roots.forEach(([child,visible]) => { child.visible = visible; });
          childStates.forEach(([child,visible]) => { child.visible = visible; });
          s.background = background; s.overrideMaterial = override;
          r.shadowMap.enabled = shadows;
        }
        this.blur.uniforms.source.value = this.color.texture;
        this.blur.uniforms.direction.value.set(2.2 / this.blurA.width,0);
        this.pass(this.blur,this.blurA);
        this.blur.uniforms.source.value = this.blurA.texture;
        this.blur.uniforms.direction.value.set(0,2.2 / this.blurA.height);
        this.pass(this.blur,this.blurB);
      }
      const u = this.composite.uniforms;
      u.amount.value = amount; u.bloom.value = bloom;
      if (selected) {
        const view = selected.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
        u.focalDepth.value = -view.z;
      }
      this.pass(this.composite,null);
    }
  }

  class Cursor {
    constructor() {
      this.el = document.getElementById('tech-cursor');
      this.pulse = document.getElementById('cursor-pulse');
      this.fine = matchMedia('(hover: hover) and (pointer: fine)');
      this.x = this.y = this.rx = this.ry = 0;
      this.active = false;
      window.addEventListener('pointermove', e => {
        if (!this.fine.matches || e.pointerType === 'touch') return;
        this.x = e.clientX; this.y = e.clientY;
        if (!this.active) { this.rx = this.x; this.ry = this.y; }
        this.active = true;
        document.body.classList.add('cursor-ready');
        this.uiHover = !!e.target.closest('button,select,summary,a,input');
      });
      const hide = () => { this.active = false; document.body.classList.remove('cursor-ready'); };
      document.documentElement.addEventListener('pointerleave', hide);
      window.addEventListener('blur',hide);
      this.fine.addEventListener('change',hide);
      window.addEventListener('pointerdown', e => {
        if (!this.active || e.button !== 0 || reduced()) return;
        this.pulse.style.left = `${e.clientX}px`; this.pulse.style.top = `${e.clientY}px`;
        this.pulse.getAnimations().forEach(a => a.cancel());
        this.pulse.animate([{transform:'translate(-50%,-50%) scale(0.3)',opacity:0.7},
          {transform:'translate(-50%,-50%) scale(2.8)',opacity:0}], {duration:480,easing:'cubic-bezier(.16,1,.3,1)'});
      });
    }
    tick(dt, hovered, color, dragging) {
      if (!this.active) return;
      const ease = reduced() ? 1 : 1-Math.exp(-24*dt);
      this.rx += (this.x-this.rx)*ease; this.ry += (this.y-this.ry)*ease;
      this.el.style.transform = `translate3d(${this.x}px,${this.y}px,0)`;
      this.el.style.setProperty('--trail-x',`${this.rx-this.x}px`);
      this.el.style.setProperty('--trail-y',`${this.ry-this.y}px`);
      this.el.style.setProperty('--cursor-color',color);
      this.el.classList.toggle('targeted',!!hovered || this.uiHover);
      this.el.classList.toggle('dragging',dragging);
      this.pulse.style.borderColor = color;
    }
  }
  return { createNode, tickNode, FocusRenderer, Cursor, reduced };
})();
