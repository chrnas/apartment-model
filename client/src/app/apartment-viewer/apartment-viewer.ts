import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  input,
  signal,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

// Enable BVH-accelerated raycasting on all meshes.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export type ViewMode = 'walk' | 'orbit';

interface CameraPreset {
  readonly id: string;
  readonly label: string;
}

/** A saved room viewpoint: where the camera sits and what it looks at. */
export interface RoomView {
  readonly label: string;
  /** Camera position [x, y, z] in model/world units. */
  readonly position: [number, number, number];
  /** Look-at target [x, y, z] in model/world units. */
  readonly target: [number, number, number];
}

@Component({
  selector: 'app-apartment-viewer',
  templateUrl: './apartment-viewer.html',
  styleUrl: './apartment-viewer.css',
})
export class ApartmentViewer implements AfterViewInit, OnDestroy {
  /** Path to the .glb model served from /public. */
  readonly src = input<string>('apartmentv7.glb');
  /** Movement speed in units (meters) per second. */
  readonly moveSpeed = input<number>(3);
  /** Eye height of the first-person camera, in meters. */
  readonly eyeHeight = input<number>(1.6);
  /** Capsule radius (how close you can get to a wall), in meters. */
  readonly playerRadius = input<number>(0.3);
  /** Background color behind the model. Any CSS color string or hex. */
  readonly backgroundColor = input<string>('#f4f4f5');
  /** Named room viewpoints, shown as buttons in orbit mode. */
  readonly rooms = input<RoomView[]>([]);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  // UI state
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly locked = signal(false);
  protected readonly progress = signal(0);
  protected readonly mode = signal<ViewMode>('walk');

  // Camera angle presets shown as buttons in orbit mode.
  protected readonly presets: readonly CameraPreset[] = [
    { id: 'top', label: 'Top' },
    { id: 'corner-ne', label: 'Corner NE' },
    { id: 'corner-nw', label: 'Corner NW' },
    { id: 'corner-se', label: 'Corner SE' },
    { id: 'corner-sw', label: 'Corner SW' },
  ];

  // Three.js objects
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private walkControls!: PointerLockControls;
  private orbitControls!: OrbitControls;
  private clock = new THREE.Clock();
  private animationId: number | null = null;

  // Model bounds (for presets and spawn), captured on load.
  private readonly modelBox = new THREE.Box3();
  private readonly modelCenter = new THREE.Vector3();
  private modelRadius = 5;

  // Collision
  private collider: THREE.Mesh | null = null;
  private readonly gravity = -20;
  private playerVelocityY = 0;
  private playerOnGround = false;
  private readonly capsule = {
    radius: 0.3,
    segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -1.0, 0)),
  };
  private readonly playerPos = new THREE.Vector3();

  // Scratch objects reused each frame.
  private readonly tempBox = new THREE.Box3();
  private readonly tempSegment = new THREE.Line3();
  private readonly tempVec = new THREE.Vector3();
  private readonly tempVec2 = new THREE.Vector3();

  // Camera tween state (for smooth preset transitions).
  private tween: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
    duration: number;
  } | null = null;

  // Horizontal movement state
  private readonly move = { forward: false, backward: false, left: false, right: false };
  private readonly velocity = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyP') {
      this.logCameraView();
      return;
    }
    this.setMove(e.code, true);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.setMove(e.code, false);
  private readonly onResize = () => this.resize();

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initScene());
  }

  ngOnDestroy(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.walkControls?.dispose();
    this.orbitControls?.dispose();
    this.renderer?.dispose();
  }

  // --- Public UI actions ---

  /** Enter walk mode and lock the pointer to start moving. */
  protected enterWalk(): void {
    this.setMode('walk');
    this.walkControls.lock();
  }

  /** Toggle between walk and orbit modes. */
  protected setMode(next: ViewMode): void {
    if (this.mode() === next) return;
    this.zone.run(() => this.mode.set(next));

    if (next === 'orbit') {
      this.walkControls.unlock();
      this.orbitControls.enabled = true;
      // Start from a pleasant corner view of the whole model.
      this.applyPreset('corner-ne', false);
    } else {
      this.orbitControls.enabled = false;
      // Drop the player back at the spawn point.
      this.resetWalkPosition();
    }
  }

  /** Move the orbit camera to a named preset viewpoint. */
  protected applyPreset(id: string, animate = true): void {
    const c = this.modelCenter;
    const r = this.modelRadius;
    const dist = r * 2.2;
    const pos = new THREE.Vector3();

    // Elevated corner views: horizontal offset for the corner, lifted up.
    const h = dist * 0.7;
    const up = dist * 0.6;
    switch (id) {
      case 'top':
        pos.set(c.x, c.y + dist, c.z + 0.001);
        break;
      case 'corner-ne':
        pos.set(c.x + h, c.y + up, c.z + h);
        break;
      case 'corner-nw':
        pos.set(c.x - h, c.y + up, c.z + h);
        break;
      case 'corner-se':
        pos.set(c.x + h, c.y + up, c.z - h);
        break;
      case 'corner-sw':
      default:
        pos.set(c.x - h, c.y + up, c.z - h);
        break;
    }

    if (animate) {
      this.tween = {
        fromPos: this.camera.position.clone(),
        toPos: pos,
        fromTarget: this.orbitControls.target.clone(),
        toTarget: c.clone(),
        t: 0,
        duration: 0.6,
      };
    } else {
      this.camera.position.copy(pos);
      this.orbitControls.target.copy(c);
      this.orbitControls.update();
    }
  }

  /** Fly the orbit camera to a saved room viewpoint. */
  protected goToRoom(room: RoomView): void {
    if (this.mode() !== 'orbit') {
      this.setMode('orbit');
    }
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(...room.position),
      fromTarget: this.orbitControls.target.clone(),
      toTarget: new THREE.Vector3(...room.target),
      t: 0,
      duration: 0.6,
    };
  }

  /**
   * Dev helper: logs the current camera position + orbit target to the console
   * in RoomView format, so you can copy values into the `rooms` input.
   * Trigger by pressing the "P" key while in orbit mode.
   */
  private logCameraView(): void {
    const p = this.camera.position;
    const fmt = (v: THREE.Vector3) =>
      `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}]`;

    // Target: in orbit mode use the orbit pivot; in walk mode use a point
    // one meter ahead of where the camera is looking.
    const target = new THREE.Vector3();
    if (this.mode() === 'orbit') {
      target.copy(this.orbitControls.target);
    } else {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      target.copy(p).addScaledVector(dir, 1);
    }

    console.log(
      `RoomView → { label: 'Room', position: ${fmt(p)}, target: ${fmt(target)} },`,
    );
  }

  // --- Scene setup ---

  private initScene(): void {
    const canvas = this.canvasRef().nativeElement;
    const parent = canvas.parentElement!;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.backgroundColor());

    this.camera = new THREE.PerspectiveCamera(
      70,
      parent.clientWidth / parent.clientHeight,
      0.05,
      1000,
    );

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7.5);
    dir.castShadow = true;
    this.scene.add(dir);

    // Walk (first-person) controls.
    this.walkControls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.walkControls.addEventListener('lock', () => this.zone.run(() => this.locked.set(true)));
    this.walkControls.addEventListener('unlock', () => this.zone.run(() => this.locked.set(false)));

    // Orbit controls (disabled until orbit mode is active).
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.enabled = false;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);

    this.loadModel();
    this.animate();
  }

  private loadModel(): void {
    const loader = new GLTFLoader();

    // Attach a Draco decoder so Draco-compressed .glb files load.
    // Decoder files are served from /draco (copied from three's examples).
    const draco = new DRACOLoader();
    draco.setDecoderPath('draco/');
    loader.setDRACOLoader(draco);

    loader.load(
      this.src(),
      (gltf) => {
        this.scene.add(gltf.scene);
        this.measureModel(gltf.scene);
        this.buildCollider(gltf.scene);
        this.spawnPlayer();
        this.zone.run(() => {
          this.loading.set(false);
          this.progress.set(100);
        });
      },
      (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          this.zone.run(() => this.progress.set(pct));
        }
      },
      (err) => {
        console.error('Failed to load model', err);
        this.zone.run(() => {
          this.loadError.set('Could not load the 3D model.');
          this.loading.set(false);
        });
      },
    );
  }

  private measureModel(model: THREE.Object3D): void {
    this.modelBox.setFromObject(model);
    this.modelBox.getCenter(this.modelCenter);
    this.modelRadius = this.modelBox.getBoundingSphere(new THREE.Sphere()).radius;

    const { min, max } = this.modelBox;
    const f = (v: THREE.Vector3) =>
      `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}]`;
    console.log(
      `Model bounds → min ${f(min)}  max ${f(max)}  center ${f(this.modelCenter)}  radius ${this.modelRadius.toFixed(2)}`,
    );
  }

  private buildCollider(model: THREE.Object3D): void {
    model.updateMatrixWorld(true);
    const geometries: THREE.BufferGeometry[] = [];

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        for (const key of Object.keys(geo.attributes)) {
          if (key !== 'position') geo.deleteAttribute(key);
        }
        geometries.push(geo);
      }
    });

    if (geometries.length === 0) {
      console.warn('No mesh geometry found for collision.');
      return;
    }

    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    merged.boundsTree = new MeshBVH(merged);

    this.collider = new THREE.Mesh(merged);
    this.collider.visible = false;
    this.scene.add(this.collider);
  }

  private spawnPlayer(): void {
    const r = this.playerRadius();
    this.capsule.radius = r;
    const eye = this.eyeHeight();
    this.capsule.segment.start.set(0, 0, 0);
    this.capsule.segment.end.set(0, -(eye - r * 2), 0);
    this.resetWalkPosition();
  }

  private resetWalkPosition(): void {
    this.playerPos.set(
      this.modelCenter.x,
      this.modelBox.min.y + this.eyeHeight(),
      this.modelCenter.z,
    );
    this.playerVelocityY = 0;
    this.camera.position.copy(this.playerPos);
  }

  private setMove(code: string, active: boolean): void {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move.forward = active;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.move.backward = active;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.move.left = active;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.move.right = active;
        break;
    }
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.tween) {
      this.updateTween(delta);
    } else if (this.mode() === 'orbit') {
      this.orbitControls.update();
    } else if (this.walkControls.isLocked && this.collider) {
      this.updateMovement(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private updateTween(delta: number): void {
    const tw = this.tween!;
    tw.t = Math.min(tw.t + delta / tw.duration, 1);
    // Ease in-out.
    const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
    this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    this.orbitControls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
    this.orbitControls.update();
    if (tw.t >= 1) this.tween = null;
  }

  private updateMovement(delta: number): void {
    this.velocity.x -= this.velocity.x * 10 * delta;
    this.velocity.z -= this.velocity.z * 10 * delta;

    this.direction.z = Number(this.move.forward) - Number(this.move.backward);
    this.direction.x = Number(this.move.right) - Number(this.move.left);
    this.direction.normalize();

    const accel = this.moveSpeed() * 10;
    if (this.move.forward || this.move.backward) this.velocity.z -= this.direction.z * accel * delta;
    if (this.move.left || this.move.right) this.velocity.x -= this.direction.x * accel * delta;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, forward).normalize();

    const moveStep = new THREE.Vector3();
    moveStep.addScaledVector(forward, -this.velocity.z * delta);
    moveStep.addScaledVector(right, this.velocity.x * delta);

    this.playerVelocityY += this.gravity * delta;
    moveStep.y += this.playerVelocityY * delta;

    this.playerPos.add(moveStep);
    this.resolveCollision();
    this.camera.position.copy(this.playerPos);
  }

  private resolveCollision(): void {
    if (!this.collider) return;
    const bvh = (this.collider.geometry as THREE.BufferGeometry & { boundsTree: MeshBVH }).boundsTree;
    const radius = this.capsule.radius;

    this.tempSegment.start.copy(this.playerPos).add(this.capsule.segment.start);
    this.tempSegment.end.copy(this.playerPos).add(this.capsule.segment.end);

    this.tempBox.makeEmpty();
    this.tempBox.expandByPoint(this.tempSegment.start);
    this.tempBox.expandByPoint(this.tempSegment.end);
    this.tempBox.min.addScalar(-radius);
    this.tempBox.max.addScalar(radius);

    const deltaVec = new THREE.Vector3();

    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(this.tempBox),
      intersectsTriangle: (tri) => {
        const triPoint = this.tempVec;
        const capsulePoint = this.tempVec2;
        const distance = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);
        if (distance < radius) {
          const depth = radius - distance;
          const dirN = capsulePoint.sub(triPoint).normalize();
          this.tempSegment.start.addScaledVector(dirN, depth);
          this.tempSegment.end.addScaledVector(dirN, depth);
          deltaVec.addScaledVector(dirN, depth);
        }
        return false;
      },
    });

    this.playerPos.copy(this.tempSegment.start).sub(this.capsule.segment.start);

    this.playerOnGround = deltaVec.y > Math.abs(deltaVec.x) + Math.abs(deltaVec.z);
    if (this.playerOnGround) {
      this.playerVelocityY = 0;
    }
  }

  private resize(): void {
    const parent = this.canvasRef().nativeElement.parentElement!;
    this.camera.aspect = parent.clientWidth / parent.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
  }
}
